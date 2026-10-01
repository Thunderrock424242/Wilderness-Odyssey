import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { Client } from 'discord.js';
import { ConnectedRuntime } from '../src/connected/runtime';
import { loadConnectedConfig } from '../src/connected/config';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
test('a stalled Discord delivery cannot prevent later service observations', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-09-23T20:00:00Z') });
  const db = new DatabaseSync(':memory:');
  const runtime = new ConnectedRuntime(db, loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true', MAIN_SERVER_ORIGIN: 'https://main.example', MAIN_SERVER_READ_TOKEN: 'r'.repeat(40), MONITOR_INTERVAL_MS: '5000', GUILD_ID: 'guild', MONITOR_PUBLIC_CHANNEL_ID: 'public' }));
  let reads = 0;
  runtime.main.health = async () => ({ schema_version: '1.0', server_id: 'official', boot_id: 'boot', sequence: ++reads, observed_at: new Date().toISOString(), minecraft: { status: 'online', checked_at: new Date().toISOString(), players_online: 2, players_max: 20, tps: 20, mspt: 30, minecraft_version: '1.21.1', modpack_version: 'test' }, aether: { status: 'unknown', checked_at: null, ollama_reachable: null, inference_available: null, latency_ms: null, requests_paused: null } });
  runtime.main.process = async () => {};
  runtime.attachDiscord({ isReady: () => true, channels: { fetch: () => new Promise(() => {}) } } as unknown as Client);
  runtime.store.enqueue('test-event', 'public', 'Synthetic incident');
  try {
    runtime.start(); await flush();
    assert.equal(reads, 1);
    context.mock.timers.tick(7000); await flush();
    assert.equal(reads, 2);
  } finally { runtime.stop(); context.mock.timers.reset(); db.close(); }
});
