import { randomInt } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_AETHER_PREFERENCES,
  type AetherLinkCode,
  type AetherLinkCompletionResult,
  type AetherMemoryProvider,
  type AetherMinecraftLink,
  type AetherPrivacyMode,
  type AetherProfile,
  type AetherResponseDetail,
  type AetherUserPreferences
} from './types';

interface LinkCodeRow {
  code: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface LinkRow {
  user_id: string;
  minecraft_uuid: string;
  minecraft_name: string;
  verified_at: string;
  updated_at: string;
}

interface PreferencesRow {
  conversation_memory_enabled: number;
  minecraft_notifications_enabled: number;
  response_detail: string;
  privacy_mode: string;
}

interface SummaryRow {
  summary: string;
}

interface LoreDiscoveryRow {
  discovery_key: string;
}

export interface AetherSqliteMemoryOptions {
  clock?: () => Date;
  codeGenerator?: () => string;
}

export class AetherSqliteMemory implements AetherMemoryProvider {
  private readonly clock: () => Date;
  private readonly codeGenerator: () => string;

  constructor(
    private readonly database: DatabaseSync,
    options: AetherSqliteMemoryOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.codeGenerator = options.codeGenerator ?? generateLinkCode;
  }

  initialize(): void {
    migrateAetherMemory(this.database);
  }

  isAvailable(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'sqlite';
  }

  createLinkCode(input: {
    discordUserId: string;
    username: string;
    expiresInMinutes: number;
  }): AetherLinkCode {
    const now = this.clock();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + input.expiresInMinutes * 60_000).toISOString();
    this.database.prepare(`
      UPDATE minecraft_link_codes
      SET used_at = @now
      WHERE user_id = @discordUserId AND used_at IS NULL
    `).run({ now: nowIso, discordUserId: input.discordUserId });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = normalizeCode(this.codeGenerator());
      if (code.length < 6) {
        continue;
      }

      try {
        this.database.prepare(`
          INSERT INTO minecraft_link_codes (
            code, user_id, username, expires_at, created_at
          ) VALUES (
            @code, @discordUserId, @username, @expiresAt, @createdAt
          )
        `).run({
          code,
          discordUserId: input.discordUserId,
          username: input.username,
          expiresAt,
          createdAt: nowIso
        });

        return {
          code,
          discordUserId: input.discordUserId,
          createdAt: nowIso,
          expiresAt,
          status: 'pending'
        };
      } catch (error) {
        if (attempt === 4) {
          throw error;
        }
      }
    }

    throw new Error('Failed to generate a unique Aether link code.');
  }

  completeLink(input: {
    code: string;
    minecraftUuid: string;
    minecraftName: string;
  }): AetherLinkCompletionResult {
    const code = normalizeCode(input.code);
    const minecraftUuid = normalizeMinecraftUuid(input.minecraftUuid);
    const minecraftName = input.minecraftName.trim().slice(0, 64);
    if (code.length < 6 || !minecraftUuid || !minecraftName) {
      return { ok: false, reason: 'invalid' };
    }

    const now = this.clock();
    const nowIso = now.toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const codeRow = this.database.prepare(
        'SELECT * FROM minecraft_link_codes WHERE code = ?'
      ).get(code) as LinkCodeRow | undefined;
      if (!codeRow) {
        this.database.exec('COMMIT');
        return { ok: false, reason: 'invalid' };
      }

      if (codeRow.used_at) {
        this.database.exec('COMMIT');
        return { ok: false, reason: 'used' };
      }

      if (new Date(codeRow.expires_at).getTime() <= now.getTime()) {
        this.database.prepare(
          'UPDATE minecraft_link_codes SET used_at = ? WHERE code = ? AND used_at IS NULL'
        ).run(nowIso, code);
        this.database.exec('COMMIT');
        return { ok: false, reason: 'expired' };
      }

      const existingUuidLink = this.database.prepare(
        'SELECT user_id FROM minecraft_links WHERE minecraft_uuid = ?'
      ).get(minecraftUuid) as { user_id: string } | undefined;
      if (existingUuidLink && existingUuidLink.user_id !== codeRow.user_id) {
        this.database.exec('COMMIT');
        return { ok: false, reason: 'uuid_in_use' };
      }

      this.database.prepare(`
        INSERT INTO minecraft_links (
          user_id, username, minecraft_uuid, minecraft_name, verified_at, updated_at
        ) VALUES (
          @userId, @username, @minecraftUuid, @minecraftName, @now, @now
        )
        ON CONFLICT(user_id)
        DO UPDATE SET
          username = excluded.username,
          minecraft_uuid = excluded.minecraft_uuid,
          minecraft_name = excluded.minecraft_name,
          updated_at = excluded.updated_at
      `).run({
        userId: codeRow.user_id,
        username: this.usernameForCode(code),
        minecraftUuid,
        minecraftName,
        now: nowIso
      });
      this.database.prepare(
        'UPDATE minecraft_link_codes SET used_at = ? WHERE code = ? AND used_at IS NULL'
      ).run(nowIso, code);
      this.database.exec('COMMIT');

      const link = this.getLinkByUserId(codeRow.user_id);
      return link ? { ok: true, link } : { ok: false, reason: 'unavailable' };
    } catch (error) {
      this.database.exec('ROLLBACK');
      if (error instanceof Error && error.message.includes('minecraft_links.minecraft_uuid')) {
        return { ok: false, reason: 'uuid_in_use' };
      }
      throw error;
    }
  }

  getProfile(discordUserId: string): AetherProfile {
    return {
      discordUserId,
      minecraftLink: this.getLinkByUserId(discordUserId),
      preferences: this.getPreferences(discordUserId)
    };
  }

  getLinkByMinecraftUuid(minecraftUuid: string): AetherMinecraftLink | null {
    const normalized = normalizeMinecraftUuid(minecraftUuid);
    if (!normalized) {
      return null;
    }

    const row = this.database.prepare(
      'SELECT * FROM minecraft_links WHERE minecraft_uuid = ?'
    ).get(normalized) as LinkRow | undefined;
    return row ? mapLink(row) : null;
  }

  unlink(discordUserId: string): boolean {
    this.database.prepare(`
      UPDATE minecraft_link_codes
      SET used_at = ?
      WHERE user_id = ? AND used_at IS NULL
    `).run(this.clock().toISOString(), discordUserId);
    const result = this.database.prepare(
      'DELETE FROM minecraft_links WHERE user_id = ?'
    ).run(discordUserId);
    return result.changes > 0;
  }

  updatePreferences(
    discordUserId: string,
    preferences: Partial<AetherUserPreferences>
  ): AetherUserPreferences {
    const current = this.getPreferences(discordUserId);
    const next: AetherUserPreferences = {
      conversationMemoryEnabled: preferences.conversationMemoryEnabled
        ?? current.conversationMemoryEnabled,
      minecraftNotificationsEnabled: preferences.minecraftNotificationsEnabled
        ?? current.minecraftNotificationsEnabled,
      responseDetail: validResponseDetail(preferences.responseDetail)
        ? preferences.responseDetail
        : current.responseDetail,
      privacyMode: validPrivacyMode(preferences.privacyMode)
        ? preferences.privacyMode
        : current.privacyMode
    };

    this.database.prepare(`
      INSERT INTO aether_user_preferences (
        user_id,
        conversation_memory_enabled,
        minecraft_notifications_enabled,
        response_detail,
        privacy_mode,
        updated_at
      ) VALUES (
        @userId,
        @conversationMemoryEnabled,
        @minecraftNotificationsEnabled,
        @responseDetail,
        @privacyMode,
        @updatedAt
      )
      ON CONFLICT(user_id)
      DO UPDATE SET
        conversation_memory_enabled = excluded.conversation_memory_enabled,
        minecraft_notifications_enabled = excluded.minecraft_notifications_enabled,
        response_detail = excluded.response_detail,
        privacy_mode = excluded.privacy_mode,
        updated_at = excluded.updated_at
    `).run({
      userId: discordUserId,
      conversationMemoryEnabled: next.conversationMemoryEnabled ? 1 : 0,
      minecraftNotificationsEnabled: next.minecraftNotificationsEnabled ? 1 : 0,
      responseDetail: next.responseDetail,
      privacyMode: next.privacyMode,
      updatedAt: this.clock().toISOString()
    });

    if (!next.conversationMemoryEnabled) {
      this.database.prepare(
        'DELETE FROM aether_conversation_summaries WHERE user_id = ?'
      ).run(discordUserId);
    }

    return next;
  }

  getConversationSummary(discordUserId: string): string | null {
    if (!this.getPreferences(discordUserId).conversationMemoryEnabled) {
      return null;
    }

    const row = this.database.prepare(
      'SELECT summary FROM aether_conversation_summaries WHERE user_id = ?'
    ).get(discordUserId) as SummaryRow | undefined;
    return row?.summary ?? null;
  }

  saveConversationSummary(discordUserId: string, summary: string): boolean {
    if (!this.getPreferences(discordUserId).conversationMemoryEnabled) {
      return false;
    }

    this.database.prepare(`
      INSERT INTO aether_conversation_summaries (user_id, summary, updated_at)
      VALUES (@userId, @summary, @updatedAt)
      ON CONFLICT(user_id)
      DO UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at
    `).run({
      userId: discordUserId,
      summary: summary.trim().slice(0, 4000),
      updatedAt: this.clock().toISOString()
    });
    return true;
  }

  getLoreDiscoveries(discordUserId: string): string[] {
    const rows = this.database.prepare(`
      SELECT discovery_key
      FROM aether_lore_discoveries
      WHERE user_id = ?
      ORDER BY discovered_at DESC
      LIMIT 100
    `).all(discordUserId) as unknown as LoreDiscoveryRow[];
    return rows.map((row) => row.discovery_key);
  }

  addLoreDiscovery(discordUserId: string, discoveryKey: string): void {
    this.database.prepare(`
      INSERT OR IGNORE INTO aether_lore_discoveries (
        user_id, discovery_key, discovered_at
      ) VALUES (?, ?, ?)
    `).run(discordUserId, discoveryKey.trim().slice(0, 160), this.clock().toISOString());
  }

  recordDiagnosticReference(input: {
    discordUserId: string;
    reference: string;
    summary: string;
  }): void {
    this.database.prepare(`
      INSERT INTO aether_diagnostic_history (
        user_id, reference, summary, created_at
      ) VALUES (?, ?, ?, ?)
    `).run(
      input.discordUserId,
      input.reference.trim().slice(0, 160),
      input.summary.trim().slice(0, 1000),
      this.clock().toISOString()
    );
  }

  close(): void {}

  getLinkCode(code: string): AetherLinkCode | null {
    const row = this.database.prepare(
      'SELECT * FROM minecraft_link_codes WHERE code = ?'
    ).get(normalizeCode(code)) as LinkCodeRow | undefined;
    if (!row) {
      return null;
    }

    return {
      code: row.code,
      discordUserId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: row.used_at
        ? 'used'
        : new Date(row.expires_at).getTime() <= this.clock().getTime()
          ? 'expired'
          : 'pending'
    };
  }

  private getLinkByUserId(discordUserId: string): AetherMinecraftLink | null {
    const row = this.database.prepare(
      'SELECT * FROM minecraft_links WHERE user_id = ?'
    ).get(discordUserId) as LinkRow | undefined;
    return row ? mapLink(row) : null;
  }

  private getPreferences(discordUserId: string): AetherUserPreferences {
    const row = this.database.prepare(
      'SELECT * FROM aether_user_preferences WHERE user_id = ?'
    ).get(discordUserId) as PreferencesRow | undefined;
    if (!row) {
      return { ...DEFAULT_AETHER_PREFERENCES };
    }

    return {
      conversationMemoryEnabled: row.conversation_memory_enabled === 1,
      minecraftNotificationsEnabled: row.minecraft_notifications_enabled === 1,
      responseDetail: validResponseDetail(row.response_detail)
        ? row.response_detail
        : DEFAULT_AETHER_PREFERENCES.responseDetail,
      privacyMode: validPrivacyMode(row.privacy_mode)
        ? row.privacy_mode
        : DEFAULT_AETHER_PREFERENCES.privacyMode
    };
  }

  private usernameForCode(code: string): string {
    const row = this.database.prepare(
      'SELECT username FROM minecraft_link_codes WHERE code = ?'
    ).get(code) as { username: string } | undefined;
    return row?.username ?? 'Unknown Discord user';
  }
}

export function migrateAetherMemory(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_link_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS minecraft_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      minecraft_uuid TEXT UNIQUE NOT NULL,
      minecraft_name TEXT NOT NULL,
      verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS aether_user_preferences (
      user_id TEXT PRIMARY KEY,
      conversation_memory_enabled INTEGER NOT NULL DEFAULT 0,
      minecraft_notifications_enabled INTEGER NOT NULL DEFAULT 0,
      response_detail TEXT NOT NULL DEFAULT 'standard',
      privacy_mode TEXT NOT NULL DEFAULT 'private',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS aether_conversation_summaries (
      user_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS aether_lore_discoveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      discovery_key TEXT NOT NULL,
      discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, discovery_key)
    );

    CREATE TABLE IF NOT EXISTS aether_diagnostic_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      reference TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_aether_preferences_user
      ON aether_user_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_aether_lore_user
      ON aether_lore_discoveries(user_id);
    CREATE INDEX IF NOT EXISTS idx_aether_diagnostic_user
      ON aether_diagnostic_history(user_id);
  `);
}

function generateLinkCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 10; index += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }
  return code;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeMinecraftUuid(value: string): string | null {
  const compact = value.trim().toLowerCase().replace(/-/g, '');
  if (!/^[a-f0-9]{32}$/.test(compact)) {
    return null;
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20)
  ].join('-');
}

function mapLink(row: LinkRow): AetherMinecraftLink {
  return {
    discordUserId: row.user_id,
    minecraftUuid: row.minecraft_uuid,
    minecraftName: row.minecraft_name,
    linkedAt: row.verified_at,
    updatedAt: row.updated_at
  };
}

function validResponseDetail(value: unknown): value is AetherResponseDetail {
  return value === 'concise' || value === 'standard' || value === 'detailed';
}

function validPrivacyMode(value: unknown): value is AetherPrivacyMode {
  return value === 'private' || value === 'minimal';
}
