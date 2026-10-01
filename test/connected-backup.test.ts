import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { backupDatabase, verifyDatabase } from '../src/connected/operator';
import { ConnectedStore } from '../src/connected/store';
test('backup contains committed WAL data and refuses to overwrite any destination', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-backup-'));
  const source = path.join(directory, 'source.sqlite'), copy = path.join(directory, 'backup.sqlite');
  const db = new DatabaseSync(source);
  try {
    db.exec('PRAGMA journal_mode=WAL');
    const store = new ConnectedStore(db);
    store.set('durable-marker', 'committed');
    backupDatabase(source, copy);
    verifyDatabase(copy);
    const restored = new DatabaseSync(copy);
    try { assert.equal(new ConnectedStore(restored).get('durable-marker'), 'committed'); } finally { restored.close(); }
    assert.throws(() => backupDatabase(source, copy), /never overwritten/i);
  } finally { db.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
