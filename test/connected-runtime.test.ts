import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { Client } from 'discord.js';
import { ConnectedRuntime } from '../src/connected/runtime';
import { loadConnectedConfig } from '../src/connected/config';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('participant invitation validates Discord accounts, reports blocked DMs and bounds stalled delivery', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const db = new DatabaseSync(':memory:');
  const user = '123456789012345678', guild = '234567890123456789';
  const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED:'true', CONNECTED_ADMIN_ENABLED:'true', STAFF_AUTH_MODE:'discord', GUILD_ID:guild, CLIENT_ID:user, DISCORD_CLIENT_SECRET:'test-secret', DISCORD_REDIRECT_URI:'https://site.example/api/auth/discord/callback', ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com', BACKEND_ACCESS_AUDIENCE:'aud', GATEWAY_SERVICE_ID:'gateway' });
  const runtime = new ConnectedRuntime(db,config);
  let mode: 'sent' | 'blocked' | 'missing' | 'stalled' = 'sent';
  const account = { id:user,bot:false,send: async () => { if(mode === 'blocked') throw new Error('blocked'); if(mode === 'stalled') await new Promise(() => {}); } };
  runtime.attachDiscord({ isReady:() => true, users:{ fetch:async () => { if(mode === 'missing') throw new Error('missing'); return account; } } } as unknown as Client);
  runtime.store.put('pt_campaign','alpha','alpha',{ id:'alpha',title:'Alpha',enabled:false });
  try {
    assert.equal((await runtime.inviteParticipant(user,'alpha','invitation-sent-key',24)).delivery,'sent');
    mode = 'blocked'; assert.equal((await runtime.inviteParticipant(user,'alpha','invitation-blocked-key',24)).delivery,'failed');
    mode = 'missing'; await assert.rejects(runtime.inviteParticipant(user,'alpha','invitation-missing-key',24));
    mode = 'sent'; const before = db.prepare('SELECT count(*) AS n FROM cs_participant_invites').get()!.n;
    await assert.rejects(runtime.inviteParticipant(user,'alpha','invitation-revoked-staff-key',24,async () => { throw new Error('Staff access revoked during account lookup.'); }));
    assert.equal(db.prepare('SELECT count(*) AS n FROM cs_participant_invites').get()!.n,before);
    mode = 'stalled'; const pending = runtime.inviteParticipant(user,'alpha','invitation-stalled-key',24); await flush();
    context.mock.timers.tick(6000); await flush(); assert.equal((await pending).delivery,'unknown');
  } finally { runtime.stop(); context.mock.timers.reset(); db.close(); }
});
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
