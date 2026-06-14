import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    db = new DatabaseSync(config.databasePath);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    migrate(db);
  }

  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function migrate(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      modpack_version TEXT NOT NULL,
      minecraft_version TEXT,
      loader_version TEXT,
      play_mode TEXT NOT NULL,
      happened TEXT NOT NULL,
      expected TEXT NOT NULL,
      steps TEXT NOT NULL,
      bug_context TEXT,
      location TEXT,
      anomaly_context TEXT,
      repeatable TEXT,
      spark_link TEXT,
      attachment_url TEXT,
      attachment_name TEXT,
      screenshot_url TEXT,
      screenshot_name TEXT,
      log_file_name TEXT,
      redacted_log TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crash_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      redacted_log TEXT NOT NULL,
      likely_cause TEXT NOT NULL,
      confidence TEXT NOT NULL,
      next_steps TEXT NOT NULL,
      activity TEXT,
      steps TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS performance_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      modpack_version TEXT NOT NULL,
      fps_average TEXT NOT NULL,
      ram_allocated TEXT NOT NULL,
      cpu_gpu TEXT,
      java_version TEXT,
      launcher TEXT,
      shaders TEXT,
      render_distance INTEGER,
      lag_location TEXT NOT NULL,
      activity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      category TEXT NOT NULL,
      modpack_version TEXT,
      summary TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS known_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      severity TEXT NOT NULL DEFAULT 'medium',
      affected_versions TEXT,
      fixed_in_version TEXT,
      external_key TEXT,
      external_url TEXT,
      added_by TEXT NOT NULL,
      source_report_type TEXT,
      source_report_public_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS changelog_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      added_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      category TEXT NOT NULL,
      modpack_version TEXT,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      message_channel_id TEXT,
      message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suggestion_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_public_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vote TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(suggestion_public_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS playtest_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      tester_name TEXT NOT NULL,
      modpack_version TEXT NOT NULL,
      test_type TEXT NOT NULL,
      expected_duration TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      successful TEXT,
      crashes TEXT,
      major_lag TEXT,
      bugs_found TEXT,
      spark_reports_attached TEXT,
      rating INTEGER,
      final_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playtest_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      created_by TEXT NOT NULL,
      created_by_username TEXT NOT NULL,
      title TEXT NOT NULL,
      modpack_version TEXT NOT NULL,
      test_focus TEXT NOT NULL,
      expected_duration TEXT NOT NULL,
      package_name TEXT NOT NULL,
      package_url TEXT NOT NULL,
      package_size INTEGER,
      terms_url TEXT,
      privacy_url TEXT,
      instructions TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playtest_release_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_public_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(release_public_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS qa_forwards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      message_url TEXT NOT NULL,
      question TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'forwarded',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS qa_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_terms TEXT NOT NULL,
      title TEXT NOT NULL,
      answer TEXT NOT NULL,
      added_by TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS spark_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT UNIQUE,
      session_public_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      spark_url TEXT NOT NULL,
      activity TEXT NOT NULL,
      symptoms TEXT,
      location TEXT,
      suspected_area TEXT,
      fps_average TEXT,
      tps_mspt TEXT,
      ram_allocated TEXT,
      render_distance INTEGER,
      shader_status TEXT,
      latest_log_name TEXT,
      redacted_log TEXT,
      staff_notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS report_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_public_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      report_public_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_public_id, report_type, report_public_id)
    );

    CREATE TABLE IF NOT EXISTS report_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_type TEXT NOT NULL,
      report_public_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bug_reports_public_id ON bug_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_crash_reports_public_id ON crash_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_performance_reports_public_id ON performance_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_reports_public_id ON feedback_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_known_issues_status ON known_issues(status);
    CREATE INDEX IF NOT EXISTS idx_known_issues_external ON known_issues(external_key);
    CREATE INDEX IF NOT EXISTS idx_changelog_entries_version ON changelog_entries(version);
    CREATE INDEX IF NOT EXISTS idx_suggestions_public_id ON suggestions(public_id);
    CREATE INDEX IF NOT EXISTS idx_suggestion_votes_public_id ON suggestion_votes(suggestion_public_id);
    CREATE INDEX IF NOT EXISTS idx_playtest_sessions_public_id ON playtest_sessions(public_id);
    CREATE INDEX IF NOT EXISTS idx_playtest_releases_public_id ON playtest_releases(public_id);
    CREATE INDEX IF NOT EXISTS idx_playtest_releases_channel ON playtest_releases(channel_id);
    CREATE INDEX IF NOT EXISTS idx_playtest_release_acceptances_release ON playtest_release_acceptances(release_public_id);
    CREATE INDEX IF NOT EXISTS idx_qa_forwards_public_id ON qa_forwards(public_id);
    CREATE INDEX IF NOT EXISTS idx_qa_forwards_status ON qa_forwards(status);
    CREATE INDEX IF NOT EXISTS idx_qa_answers_enabled ON qa_answers(enabled);
    CREATE INDEX IF NOT EXISTS idx_minecraft_link_codes_code ON minecraft_link_codes(code);
    CREATE INDEX IF NOT EXISTS idx_minecraft_link_codes_user ON minecraft_link_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_minecraft_links_user ON minecraft_links(user_id);
    CREATE INDEX IF NOT EXISTS idx_minecraft_links_uuid ON minecraft_links(minecraft_uuid);
    CREATE INDEX IF NOT EXISTS idx_spark_reports_public_id ON spark_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_spark_reports_session ON spark_reports(session_public_id);
    CREATE INDEX IF NOT EXISTS idx_report_links_session ON report_links(session_public_id);
    CREATE INDEX IF NOT EXISTS idx_report_links_report ON report_links(report_type, report_public_id);
    CREATE INDEX IF NOT EXISTS idx_report_updates_report ON report_updates(report_type, report_public_id);
  `);

  ensureColumn(database, 'bug_reports', 'minecraft_version', 'TEXT');
  ensureColumn(database, 'bug_reports', 'loader_version', 'TEXT');
  ensureColumn(database, 'bug_reports', 'repeatable', 'TEXT');
  ensureColumn(database, 'bug_reports', 'bug_context', 'TEXT');
  ensureColumn(database, 'bug_reports', 'spark_link', 'TEXT');
  ensureColumn(database, 'bug_reports', 'screenshot_url', 'TEXT');
  ensureColumn(database, 'bug_reports', 'screenshot_name', 'TEXT');
  ensureColumn(database, 'bug_reports', 'log_file_name', 'TEXT');
  ensureColumn(database, 'bug_reports', 'redacted_log', 'TEXT');
  ensureColumn(database, 'crash_reports', 'activity', 'TEXT');
  ensureColumn(database, 'crash_reports', 'steps', 'TEXT');
  ensureColumn(database, 'known_issues', 'source_report_type', 'TEXT');
  ensureColumn(database, 'known_issues', 'source_report_public_id', 'TEXT');
  ensureColumn(database, 'known_issues', 'affected_versions', 'TEXT');
  ensureColumn(database, 'known_issues', 'fixed_in_version', 'TEXT');
  ensureColumn(database, 'known_issues', 'external_key', 'TEXT');
  ensureColumn(database, 'known_issues', 'external_url', 'TEXT');
  database.exec('CREATE INDEX IF NOT EXISTS idx_known_issues_source ON known_issues(source_report_type, source_report_public_id);');
  database.exec('CREATE INDEX IF NOT EXISTS idx_known_issues_external ON known_issues(external_key);');
  ensureReportClaimColumns(database, 'bug_reports');
  ensureReportClaimColumns(database, 'crash_reports');
  ensureReportClaimColumns(database, 'performance_reports');
  ensureReportClaimColumns(database, 'spark_reports');
}

function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }

  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function ensureReportClaimColumns(database: DatabaseSync, table: string): void {
  ensureColumn(database, table, 'claimed_by', 'TEXT');
  ensureColumn(database, table, 'claimed_by_username', 'TEXT');
  ensureColumn(database, table, 'claimed_at', 'TEXT');
}
