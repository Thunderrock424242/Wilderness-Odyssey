import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { Client } from 'discord.js';
import { ConnectedRuntime } from '../src/connected/runtime';
import { loadConnectedConfig } from '../src/connected/config';
import { MainServerClient } from '../src/connected/mainClient';
import { DashboardAuth } from '../src/connected/dashboardAuth';
import { ConnectedStore, ServiceError } from '../src/connected/store';
import { AdminService } from '../src/connected/admin';
import { IdentityService } from '../src/connected/identity';
import { ServiceMonitor } from '../src/connected/monitor';
import { ModerationService } from '../src/connected/moderation';
const user = '123456789012345678', guild = '234567890123456789', redirectUri = 'https://staff.example/api/auth/discord/callback';
const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true', CONNECTED_ADMIN_ENABLED: 'true', STAFF_AUTH_MODE: 'discord', GUILD_ID: guild, CLIENT_ID: user, DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: redirectUri, ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', BACKEND_ACCESS_AUDIENCE: 'backend', GATEWAY_SERVICE_ID: 'gateway', MAIN_SERVER_ORIGIN: 'https://main.example', MAIN_SERVER_READ_TOKEN: 'r'.repeat(40), MAIN_SERVER_WRITE_TOKEN: 'w'.repeat(40) });
const capabilities = { actions: ['ai.pause'], aiRequestsRevision: 'initial', models: { schemaVersion: '1.0' as const, revision: 'initial', activeModelId: null, models: [], settings: { temperature: 0.5, numPredict: 256, numCtx: 1024 }, permittedSettings: { temperature: { min: 0, max: 2 }, numPredict: { min: 32, max: 1024 }, numCtx: { min: 512, max: 8192 } } } };
async function fixture() {
  const db = new DatabaseSync(':memory:'); let now = Date.now(), permitted = true, outage = false;
  const store = new ConnectedStore(db, () => now);
  const auth = new DashboardAuth(store, config.discord!, async () => {
    if (outage) throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Unavailable.');
    if (!permitted) throw new ServiceError(403, 'PERMISSION_LOST', 'Administrator required.');
  }, async url => String(url).endsWith('/oauth2/token') ? Response.json({ access_token: 'discard', token_type: 'Bearer', scope: 'identify' }) : Response.json({ id: user, username: 'Admin' }));
  await auth.enroll(user, guild, true);
  const start = auth.start({ redirectUri });
  const session = await auth.callback({ redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
  const actor = await auth.authenticate(session.sessionToken);
  return { db, store, auth, actor, session, demote: () => { permitted = false; }, outage: (value: boolean) => { outage = value; }, advance: (ms: number) => { now += ms; } };
}
test('admin rechecks Discord after capability waits before responses and mutations', async () => {
  for (const path of ['/overview', '/models', '/ai-requests']) {
    const f = await fixture();
    try {
      const identity = new IdentityService(f.store, 'official'), monitor = new ServiceMonitor(f.store, 'official'), moderation = new ModerationService(f.store, identity);
      const admin = new AdminService(f.store, monitor, moderation, { async capabilities() { f.demote(); return capabilities; } }, (actor, capability) => f.auth.authorize(actor, capability));
      await assert.rejects(admin.handle(f.actor, path === '/ai-requests' ? 'PUT' : 'GET', path, { paused: true, reason: 'Planned maintenance work', revision: 'initial' }, {}, 'dashboard-remote-001'), (e: unknown) => e instanceof ServiceError && e.status === 403);
      assert.equal(f.store.operationRows().length, 0);
    } finally { f.db.close(); }
  }
});
test('queued operations recheck session and Discord before dispatch and after reconciliation', async () => {
  for (const scenario of ['demotion', 'logout', 'expiry', 'demotion-during-reconciliation', 'outage']) {
    const f = await fixture();
    try {
      const op = f.store.mutate(f.actor, '/ai-requests', 'dashboard-queue-001', {}, 'server:write', () => {}, { action: 'ai.pause', parameters: { paused: true, reason: 'Planned maintenance work', revision: 'initial' } });
      let posts = 0;
      const main = new MainServerClient(config, async (_url, init) => {
        if (init?.method === 'POST') { posts++; return Response.json({ ...op, kind: 'ai.pause', state: 'succeeded' }); }
        if (scenario === 'demotion-during-reconciliation') f.demote();
        return new Response('', { status: 404 });
      }, (actor, capability) => f.auth.authorize(actor, capability));
      if (scenario === 'demotion') f.demote();
      if (scenario === 'logout') f.auth.logout(f.session.sessionToken);
      if (scenario === 'expiry') f.advance(900000);
      if (scenario === 'outage') f.outage(true);
      await main.process(f.store); assert.equal(posts, 0);
      assert.equal(f.store.operation(op.id, f.actor).state, scenario === 'outage' ? 'requested' : 'cancelled');
      if (scenario === 'outage') {
        f.outage(false); f.advance(60000);
        await main.process(f.store); assert.equal(posts, 1);
        assert.equal(f.store.operation(op.id, f.actor).state, 'succeeded');
      }
    } finally { f.db.close(); }
  }
});
test('runtime rejects stale Discord staff rows in Discord mode after Administrator loss', async () => {
  const db = new DatabaseSync(':memory:'), runtime = new ConnectedRuntime(db, config);
  let permitted = true;
  runtime.attachDiscord({ isReady: () => true, rest: { async get(path: string) {
    if (path.endsWith('/roles')) return [{ id: guild, permissions: permitted ? '8' : '0' }];
    if (path.includes('/members/')) return { user: { id: user }, roles: [] };
    return { id: guild, owner_id: '345678901234567890' };
  } } } as unknown as Client);
  try {
    runtime.store.assign('discord', user, 'administrator', 'Old staff assignment', 'test');
    await runtime.dashboard!.enroll(user, guild, true); permitted = false;
    const actor = runtime.store.staff('discord', user)!;
    await assert.rejects(runtime.admin.handle(actor, 'PUT', '/maintenance', { active: false, services: [], message: '', startsAt: null, endsAt: null, reason: 'Planned maintenance work', revision: 'initial' }, {}, 'stale-staff-row-001'), (e: unknown) => e instanceof ServiceError && e.status === 403);
    assert.equal(runtime.store.operationRows().length, 0);
  } finally { runtime.stop(); db.close(); }
});

test('logout cannot label an already accepted remote operation cancelled; reconciliation continues without redispatch', async () => {
  const f = await fixture();
  try {
    const op = f.store.mutate(f.actor, '/ai-requests', 'accepted-queue-001', {}, 'server:write', () => {}, { action: 'ai.pause', parameters: { paused: true, reason: 'Planned maintenance work', revision: 'initial' } });
    let posts = 0;
    const main = new MainServerClient(config, async (_url, init) => {
      if (init?.method === 'POST') { posts++; throw new Error('Acknowledgement lost after acceptance'); }
      return posts ? Response.json({ ...op, kind: 'ai.pause', state: 'succeeded' }) : new Response('', { status: 404 });
    }, (actor, capability) => f.auth.authorize(actor, capability));
    await main.process(f.store); assert.equal(f.store.operation(op.id, f.actor).state, 'running');
    f.auth.logout(f.session.sessionToken); f.advance(60000);
    await main.process(f.store);
    assert.equal(posts, 1); assert.equal(f.store.operation(op.id, f.actor).state, 'succeeded');
  } finally { f.db.close(); }
});

test('the same Discord human cannot independently review historical restrictions through a dashboard alias', async () => {
  const f = await fixture();
  try {
    const uuid = '12345678-1234-4234-8234-123456789012';
    const identity = new IdentityService(f.store, 'official'), monitor = new ServiceMonitor(f.store, 'official'), moderation = new ModerationService(f.store, identity);
    const account = identity.account('discord', 'player'); identity.linkMinecraft(account, uuid, 'Player');
    const admin = new AdminService(f.store, monitor, moderation);
    const historical = { id: 'discord|' + user, issuer: 'discord', subject: user, role: 'administrator' as const };
    await admin.handle(historical, 'POST', '/players/' + uuid + '/restrictions', { scope: 'aether', reason: 'Policy violation reviewed', expiresAt: new Date(f.store.clock() + 3600000).toISOString() }, {}, 'historical-restriction-001');
    moderation.appeal(account, uuid, 'Please review this decision.', 'historical-appeal-001');
    const appeal = f.store.records<{ id: string; revision: string }>('appeal', uuid)[0]!;
    const input = { decision: 'accepted', reason: 'Reviewed available evidence', revision: appeal.revision };
    await assert.rejects(admin.handle(f.actor, 'POST', '/players/' + uuid + '/appeals/' + appeal.id + '/resolve', input, {}, 'dashboard-alias-review-001'), /another staff member/i);
    const otherGuildAlias = { ...f.actor, id: 'discord-dashboard|345678901234567890:' + user, guildId: '345678901234567890' };
    await assert.rejects(admin.handle(otherGuildAlias, 'POST', '/players/' + uuid + '/appeals/' + appeal.id + '/resolve', input, {}, 'dashboard-alias-review-002'), /another staff member/i);
    const differentHuman = { ...f.actor, id: 'discord-dashboard|' + guild + ':456789012345678901', subject: '456789012345678901' };
    await admin.handle(differentHuman, 'POST', '/players/' + uuid + '/appeals/' + appeal.id + '/resolve', input, {}, 'dashboard-alias-review-003');
  } finally { f.db.close(); }
});
