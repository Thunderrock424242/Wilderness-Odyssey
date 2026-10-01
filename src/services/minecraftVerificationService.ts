import { AetherSqliteMemory } from '../aether/memory';
import { getConnected } from '../connected/runtime';
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

/** Called only after the HTTP/relay transport has authenticated the official server. */
export function completeMinecraftLink(input: { code: string; minecraftUuid: string; minecraftName: string }): { ok: true; link: MinecraftLinkRecord } | { ok: false; reason: string } {
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(input.minecraftName)) return { ok: false, reason: 'Invalid Minecraft identity.' };
  const result = new AetherSqliteMemory(getDb()).completeLink(input);
  if (!result.ok) return { ok: false, reason: 'This code is invalid, expired, already used, or belongs to an account linked elsewhere.' };
  const identity = getConnected()?.identity;
  if (!identity) return { ok: false, reason: 'Identity service is unavailable. Generate another code and try again later.' };
  identity.linkMinecraft(identity.account('discord', result.link.discordUserId), result.link.minecraftUuid, result.link.minecraftName);
  const link = getMinecraftLinkByUserId(result.link.discordUserId);
  return link ? { ok: true, link } : { ok: false, reason: 'Link is unavailable.' };
}
export function getMinecraftLinkByUserId(userId: string): MinecraftLinkRecord | null {
  const row = getDb().prepare('SELECT * FROM minecraft_links WHERE user_id = ?')
    .get(userId) as MinecraftLinkRow | undefined;

  return row ? mapLink(row) : null;
}

export function removeMinecraftLink(userId: string): boolean {
  const old = getMinecraftLinkByUserId(userId);
  const identity = getConnected()?.identity;
  if (old && identity) identity.unlinkMinecraft(identity.account('discord', userId), old.minecraftUuid);
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
