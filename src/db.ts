import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    db = new Database(config.databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }

  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function migrate(database: Database.Database): void {
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
      added_by TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_bug_reports_public_id ON bug_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_crash_reports_public_id ON crash_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_performance_reports_public_id ON performance_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_reports_public_id ON feedback_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_known_issues_status ON known_issues(status);
    CREATE INDEX IF NOT EXISTS idx_changelog_entries_version ON changelog_entries(version);
    CREATE INDEX IF NOT EXISTS idx_suggestions_public_id ON suggestions(public_id);
    CREATE INDEX IF NOT EXISTS idx_suggestion_votes_public_id ON suggestion_votes(suggestion_public_id);
    CREATE INDEX IF NOT EXISTS idx_playtest_sessions_public_id ON playtest_sessions(public_id);
    CREATE INDEX IF NOT EXISTS idx_spark_reports_public_id ON spark_reports(public_id);
    CREATE INDEX IF NOT EXISTS idx_spark_reports_session ON spark_reports(session_public_id);
    CREATE INDEX IF NOT EXISTS idx_report_links_session ON report_links(session_public_id);
    CREATE INDEX IF NOT EXISTS idx_report_links_report ON report_links(report_type, report_public_id);
  `);

  ensureColumn(database, 'bug_reports', 'minecraft_version', 'TEXT');
  ensureColumn(database, 'bug_reports', 'loader_version', 'TEXT');
  ensureColumn(database, 'bug_reports', 'repeatable', 'TEXT');
  ensureColumn(database, 'bug_reports', 'spark_link', 'TEXT');
  ensureColumn(database, 'bug_reports', 'screenshot_url', 'TEXT');
  ensureColumn(database, 'bug_reports', 'screenshot_name', 'TEXT');
  ensureColumn(database, 'bug_reports', 'log_file_name', 'TEXT');
  ensureColumn(database, 'bug_reports', 'redacted_log', 'TEXT');
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string): void {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }

  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
