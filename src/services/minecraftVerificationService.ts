import { randomInt } from 'node:crypto';
import { config } from '../config';
import { getDb } from '../db';
import type { MinecraftLinkCodeRecord, MinecraftLinkRecord } from '../types';

interface MinecraftLinkCodeRow {
  id: number;
  code: string;
  user_id: string;
  username: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface MinecraftLinkRow {
  id: number;
  user_id: string;
  username: string;
  minecraft_uuid: string;
  minecraft_name: string;
  verified_at: string;
  updated_at: string;
}

export function createMinecraftLinkCode(input: {
  userId: string;
  username: string;
}): MinecraftLinkCodeRecord {
  const database = getDb();
  database.prepare(`
    UPDATE minecraft_link_codes
    SET used_at = datetime('now')
    WHERE user_id = @userId AND used_at IS NULL
  `).run({ userId: input.userId });

  const expiresAt = new Date(Date.now() + config.minecraftVerification.codeTtlMinutes * 60_000).toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    try {
      const info = database.prepare(`
        INSERT INTO minecraft_link_codes (
          code, user_id, username, expires_at
        ) VALUES (
          @code, @userId, @username, @expiresAt
        )
      `).run({ ...input, code, expiresAt });

      const row = database.prepare('SELECT * FROM minecraft_link_codes WHERE id = ?')
        .get(Number(info.lastInsertRowid)) as MinecraftLinkCodeRow | undefined;
      if (!row) {
        throw new Error('Failed to read created Minecraft verification code.');
      }

      return mapCode(row);
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
    }
  }

  throw new Error('Failed to generate a unique Minecraft verification code.');
}

export function completeMinecraftLink(input: {
  code: string;
  minecraftUuid: string;
  minecraftName: string;
}): { ok: true; link: MinecraftLinkRecord } | { ok: false; reason: string } {
  const normalizedCode = normalizeCode(input.code);
  const normalizedUuid = normalizeUuid(input.minecraftUuid);
  const minecraftName = input.minecraftName.trim();

  if (!normalizedCode || !normalizedUuid || !minecraftName) {
    return { ok: false, reason: 'Code, Minecraft UUID, and Minecraft name are required.' };
  }

  const database = getDb();
  const codeRow = database.prepare(`
    SELECT * FROM minecraft_link_codes
    WHERE code = ? AND used_at IS NULL
  `).get(normalizedCode) as MinecraftLinkCodeRow | undefined;

  if (!codeRow) {
    return { ok: false, reason: 'That code is invalid or has already been used.' };
  }

  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    database.prepare('UPDATE minecraft_link_codes SET used_at = datetime(\'now\') WHERE id = ?').run(codeRow.id);
    return { ok: false, reason: 'That code expired. Generate a new one in Discord.' };
  }

  database.prepare(`
    INSERT INTO minecraft_links (
      user_id, username, minecraft_uuid, minecraft_name
    ) VALUES (
      @userId, @username, @minecraftUuid, @minecraftName
    )
    ON CONFLICT(user_id)
    DO UPDATE SET
      username = excluded.username,
      minecraft_uuid = excluded.minecraft_uuid,
      minecraft_name = excluded.minecraft_name,
      updated_at = datetime('now')
  `).run({
    userId: codeRow.user_id,
    username: codeRow.username,
    minecraftUuid: normalizedUuid,
    minecraftName
  });

  database.prepare('UPDATE minecraft_link_codes SET used_at = datetime(\'now\') WHERE id = ?').run(codeRow.id);

  const link = getMinecraftLinkByUserId(codeRow.user_id);
  if (!link) {
    return { ok: false, reason: 'Verification was accepted, but the link could not be read back.' };
  }

  return { ok: true, link };
}

export function getMinecraftLinkByUserId(userId: string): MinecraftLinkRecord | null {
  const row = getDb().prepare('SELECT * FROM minecraft_links WHERE user_id = ?')
    .get(userId) as MinecraftLinkRow | undefined;

  return row ? mapLink(row) : null;
}

export function removeMinecraftLink(userId: string): boolean {
  const result = getDb().prepare('DELETE FROM minecraft_links WHERE user_id = ?').run(userId);
  return result.changes > 0;
}

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }
  return code;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeUuid(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-f0-9-]/g, '');
}

function mapCode(row: MinecraftLinkCodeRow): MinecraftLinkCodeRecord {
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    username: row.username,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at
  };
}

function mapLink(row: MinecraftLinkRow): MinecraftLinkRecord {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    minecraftUuid: row.minecraft_uuid,
    minecraftName: row.minecraft_name,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at
  };
}
