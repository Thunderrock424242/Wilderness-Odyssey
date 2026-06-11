import { getDb } from '../db';
import type {
  PlaytestReleaseAcceptanceRecord,
  PlaytestReleaseRecord,
  PlaytestReleaseStatus
} from '../types/playtest';
import { formatPublicId, normalizePublicId } from '../utils/ids';

interface PlaytestReleaseRow {
  id: number;
  public_id: string;
  guild_id: string;
  channel_id: string | null;
  message_id: string | null;
  created_by: string;
  created_by_username: string;
  title: string;
  modpack_version: string;
  test_focus: string;
  expected_duration: string;
  package_name: string;
  package_url: string;
  package_size: number | null;
  terms_url: string | null;
  privacy_url: string | null;
  instructions: string | null;
  status: PlaytestReleaseStatus;
  created_at: string;
  updated_at: string;
}

interface PlaytestReleaseAcceptanceRow {
  id: number;
  release_public_id: string;
  user_id: string;
  username: string;
  accepted_at: string;
}

export function createPlaytestRelease(input: {
  guildId: string;
  createdBy: string;
  createdByUsername: string;
  title: string;
  modpackVersion: string;
  testFocus: string;
  expectedDuration: string;
  packageName: string;
  packageUrl: string;
  packageSize: number | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  instructions: string | null;
}): PlaytestReleaseRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO playtest_releases (
      guild_id, created_by, created_by_username, title, modpack_version, test_focus,
      expected_duration, package_name, package_url, package_size, terms_url, privacy_url, instructions
    ) VALUES (
      @guildId, @createdBy, @createdByUsername, @title, @modpackVersion, @testFocus,
      @expectedDuration, @packageName, @packageUrl, @packageSize, @termsUrl, @privacyUrl, @instructions
    )
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('playtestRelease', id);
  database.prepare('UPDATE playtest_releases SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const release = getPlaytestRelease(publicId);
  if (!release) {
    throw new Error(`Failed to read created playtest release ${publicId}`);
  }

  return release;
}

export function updatePlaytestReleaseMessage(publicId: string, input: {
  channelId: string;
  messageId: string;
}): PlaytestReleaseRecord | null {
  const normalized = normalizePublicId(publicId);
  const result = getDb().prepare(`
    UPDATE playtest_releases
    SET channel_id = @channelId,
        message_id = @messageId,
        updated_at = datetime('now')
    WHERE public_id = @publicId
  `).run({ ...input, publicId: normalized });

  return result.changes > 0 ? getPlaytestRelease(normalized) : null;
}

export function getPlaytestRelease(publicId: string): PlaytestReleaseRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM playtest_releases WHERE public_id = ?')
    .get(normalizePublicId(publicId)) as PlaytestReleaseRow | undefined;

  return row ? mapRelease(row) : null;
}

export function recordPlaytestReleaseAcceptance(input: {
  releasePublicId: string;
  userId: string;
  username: string;
}): PlaytestReleaseAcceptanceRecord {
  const releasePublicId = normalizePublicId(input.releasePublicId);
  const database = getDb();
  database.prepare(`
    INSERT OR IGNORE INTO playtest_release_acceptances (
      release_public_id, user_id, username
    ) VALUES (
      @releasePublicId, @userId, @username
    )
  `).run({
    releasePublicId,
    userId: input.userId,
    username: input.username
  });

  const row = database.prepare(`
    SELECT * FROM playtest_release_acceptances
    WHERE release_public_id = @releasePublicId AND user_id = @userId
  `).get({ releasePublicId, userId: input.userId }) as PlaytestReleaseAcceptanceRow | undefined;

  if (!row) {
    throw new Error(`Failed to record playtest acceptance for ${releasePublicId}`);
  }

  return mapAcceptance(row);
}

function mapRelease(row: PlaytestReleaseRow): PlaytestReleaseRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    createdBy: row.created_by,
    createdByUsername: row.created_by_username,
    title: row.title,
    modpackVersion: row.modpack_version,
    testFocus: row.test_focus,
    expectedDuration: row.expected_duration,
    packageName: row.package_name,
    packageUrl: row.package_url,
    packageSize: row.package_size,
    termsUrl: row.terms_url,
    privacyUrl: row.privacy_url,
    instructions: row.instructions,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAcceptance(row: PlaytestReleaseAcceptanceRow): PlaytestReleaseAcceptanceRecord {
  return {
    id: row.id,
    releasePublicId: row.release_public_id,
    userId: row.user_id,
    username: row.username,
    acceptedAt: row.accepted_at
  };
}
