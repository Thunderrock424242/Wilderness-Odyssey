import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
test('connected startup refuses a missing database instead of silently resetting restrictions', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-startup-'));
  process.env.DISCORD_TOKEN = 'test'; process.env.CLIENT_ID = 'test';
  process.env.CONNECTED_SERVICES_ENABLED = 'true';
  process.env.DATABASE_PATH = path.join(directory, 'missing.sqlite');
  try {
    const { getDb, closeDb } = await import('../src/db');
    try { assert.throws(() => getDb(), /database.*missing|restore/i); }
    finally { closeDb(); }
    assert.equal(fs.existsSync(process.env.DATABASE_PATH), false);
  } finally {
    const generated = path.join(directory, 'missing.sqlite');
    if (fs.existsSync(generated)) fs.unlinkSync(generated);
    fs.rmdirSync(directory);
  }
});
