import { getDb } from '../db';
import type { SparkReportRecord, SparkReportStatus } from '../types/spark';
import { formatPublicId, normalizePublicId } from '../utils/ids';
import { getPlaytestSession, linkReportToSession } from './playtestSessionService';

interface SparkReportRow {
  id: number;
  public_id: string;
  session_public_id: string;
  user_id: string;
  username: string;
  spark_url: string;
  activity: string;
  symptoms: string | null;
  location: string | null;
  suspected_area: string | null;
  fps_average: string | null;
  tps_mspt: string | null;
  ram_allocated: string | null;
  render_distance: number | null;
  shader_status: string | null;
  latest_log_name: string | null;
  redacted_log: string | null;
  staff_notes: string | null;
  status: SparkReportStatus;
  created_at: string;
  updated_at: string;
}

const sparkUrlPattern = /https?:\/\/(?:spark\.lucko\.me|sparkapi\.lucko\.me|viewer\.spark\.lucko\.me)\/[^\s<>()]+/gi;

export function detectSparkUrls(text: string): string[] {
  return Array.from(new Set(text.match(sparkUrlPattern) ?? []));
}

export function isSparkReportUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['spark.lucko.me', 'sparkapi.lucko.me', 'viewer.spark.lucko.me'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function createSparkReport(input: {
  sessionPublicId: string;
  userId: string;
  username: string;
  sparkUrl: string;
  activity: string;
  symptoms: string | null;
  location: string | null;
  suspectedArea: string | null;
  fpsAverage: string | null;
  tpsMspt: string | null;
  ramAllocated: string | null;
  renderDistance: number | null;
  shaderStatus: string | null;
  latestLogName: string | null;
  redactedLog: string | null;
}): SparkReportRecord {
  if (!isSparkReportUrl(input.sparkUrl)) {
    throw new Error('That does not look like a Spark viewer/report URL.');
  }

  const session = getPlaytestSession(input.sessionPublicId);
  if (!session) {
    throw new Error(`No playtest session found for ${input.sessionPublicId}.`);
  }

  const database = getDb();
  const info = database.prepare(`
    INSERT INTO spark_reports (
      session_public_id, user_id, username, spark_url, activity, symptoms, location,
      suspected_area, fps_average, tps_mspt, ram_allocated, render_distance,
      shader_status, latest_log_name, redacted_log
    ) VALUES (
      @sessionPublicId, @userId, @username, @sparkUrl, @activity, @symptoms, @location,
      @suspectedArea, @fpsAverage, @tpsMspt, @ramAllocated, @renderDistance,
      @shaderStatus, @latestLogName, @redactedLog
    )
  `).run({
    ...input,
    sessionPublicId: session.publicId
  });

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('spark', id);
  database.prepare('UPDATE spark_reports SET public_id = @publicId WHERE id = @id').run({ publicId, id });
  linkReportToSession(session.publicId, 'spark', publicId);

  const report = getSparkReport(publicId);
  if (!report) {
    throw new Error(`Failed to read created Spark report ${publicId}`);
  }

  return report;
}

export function createSparkReportFromBridge(input: Parameters<typeof createSparkReport>[0]): SparkReportRecord {
  return createSparkReport(input);
}

export function getSparkReport(publicId: string): SparkReportRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM spark_reports WHERE public_id = ?')
    .get(normalizePublicId(publicId)) as SparkReportRow | undefined;

  return row ? mapSpark(row) : null;
}

export function listSparkReportsForSession(sessionPublicId: string): SparkReportRecord[] {
  const rows = getDb().prepare(`
    SELECT * FROM spark_reports
    WHERE session_public_id = ?
    ORDER BY id DESC
  `).all(normalizePublicId(sessionPublicId)) as SparkReportRow[];

  return rows.map(mapSpark);
}

export function updateSparkReportStatus(publicId: string, status: SparkReportStatus): SparkReportRecord | null {
  const normalized = normalizePublicId(publicId);
  const result = getDb().prepare(`
    UPDATE spark_reports
    SET status = @status,
        updated_at = datetime('now')
    WHERE public_id = @publicId
  `).run({ publicId: normalized, status });

  return result.changes > 0 ? getSparkReport(normalized) : null;
}

export function updateSparkReportNotes(publicId: string, staffNotes: string): SparkReportRecord | null {
  const normalized = normalizePublicId(publicId);
  const result = getDb().prepare(`
    UPDATE spark_reports
    SET staff_notes = @staffNotes,
        updated_at = datetime('now')
    WHERE public_id = @publicId
  `).run({ publicId: normalized, staffNotes });

  return result.changes > 0 ? getSparkReport(normalized) : null;
}

function mapSpark(row: SparkReportRow): SparkReportRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    sessionPublicId: row.session_public_id,
    userId: row.user_id,
    username: row.username,
    sparkUrl: row.spark_url,
    activity: row.activity,
    symptoms: row.symptoms,
    location: row.location,
    suspectedArea: row.suspected_area,
    fpsAverage: row.fps_average,
    tpsMspt: row.tps_mspt,
    ramAllocated: row.ram_allocated,
    renderDistance: row.render_distance,
    shaderStatus: row.shader_status,
    latestLogName: row.latest_log_name,
    redactedLog: row.redacted_log,
    staffNotes: row.staff_notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
