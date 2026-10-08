import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AccessAuthenticator, loadJose } from '../src/connected/auth';
import { AdminService } from '../src/connected/admin';
import { DashboardAuth } from '../src/connected/dashboardAuth';
import { ConnectedHttp } from '../src/connected/http';
import { loadConnectedConfig } from '../src/connected/config';
import { ConnectedStore, ServiceError } from '../src/connected/store';
import { IdentityService } from '../src/connected/identity';
import { ModerationService } from '../src/connected/moderation';
import { ServiceMonitor } from '../src/connected/monitor';
const user = '123456789012345678', guild = '234567890123456789', redirectUri = 'https://staff.example/api/auth/discord/callback';
async function fixture() {
  const db = new DatabaseSync(':memory:'), store = new ConnectedStore(db);
  let permitted = true, unavailable = false, afterCheck = () => {};
  const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true', CONNECTED_ADMIN_ENABLED: 'true', STAFF_AUTH_MODE: 'discord', GUILD_ID: guild, CLIENT_ID: user, DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: redirectUri, ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', BACKEND_ACCESS_AUDIENCE: 'backend', GATEWAY_SERVICE_ID: 'gateway' });
  const auth = new DashboardAuth(store, config.discord!, async () => {
    afterCheck();
    if (unavailable) throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Unavailable');
    if (!permitted) throw new ServiceError(403, 'PERMISSION_LOST', 'Administrator required');
  }, async input => String(input).endsWith('/oauth2/token') ? Response.json({ access_token: 'discard', token_type: 'Bearer', scope: 'identify' }) : Response.json({ id: user, username: 'Admin' }));
  const identity = new IdentityService(store, 'official'), monitor = new ServiceMonitor(store, 'official'), moderation = new ModerationService(store, identity);
  const admin = new AdminService(store, monitor, moderation, undefined, (actor, capability) => auth.authorize(actor, capability));
  const handler = new ConnectedHttp(config, store, monitor, identity, moderation, admin, auth);
  const { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } = await loadJose();
  const keys = await generateKeyPair('RS256'), jwk = { ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' };
  const verifier = new AccessAuthenticator(store, config.trust, createLocalJWKSet({ keys: [jwk] }));
  handler.staffAuth.machine = headers => verifier.machine(headers);
  const machine = await new SignJWT({ common_name: 'gateway' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(config.trust.issuer).setAudience('backend').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  const headers = { 'cf-access-jwt-assertion': machine, 'x-wo-environment': 'production', 'x-request-id': 'dashboard-test-request', 'content-type': 'application/json' };
  const server = createServer((req, res) => { void handler.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = (path: string, body?: unknown, session?: string, extra: Record<string, string> = {}, method = body === undefined ? 'GET' : 'POST') => fetch(base + '/v1/admin' + path, { method, headers: { ...headers, ...(session ? { 'x-wo-admin-session': session } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = async () => {
    const startResponse = await call('/auth/discord/start', { redirectUri });
    assert.equal(startResponse.status, 200);
    const start = await startResponse.json() as { authorizationUrl: string; flowToken: string };
    return call('/auth/discord/callback', { redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
  };
  return { db, store, auth, admin, handler, call, login, server, headers, permission: (allowed: boolean) => { permitted = allowed; }, outage: (value: boolean) => { unavailable = value; }, afterCheck: (fn: () => void) => { afterCheck = fn; }, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); } };
}
test('HTTP brokers OAuth/session/logout with machine-only Access and preserves admin revision/idempotency rules', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/auth/discord/start', { redirectUri }, undefined, { 'cf-access-jwt-assertion': 'forged' })).status, 401);
    assert.equal((await f.call('/auth/discord/start', { redirectUri }, undefined, { 'x-wo-environment': 'preview' })).status, 401);
    assert.equal((await f.login()).status, 403);
    await f.auth.enroll(user, guild, true);
    const response = await f.login(); assert.equal(response.status, 200);
    const session = await response.json() as { sessionToken: string; expiresAt: string };
    const current = await f.call('/session', undefined, session.sessionToken); assert.equal(current.status, 200);
    const data = await current.json() as { user: { id: string; role: string }; guildId: string; expiresAt: string };
    assert.deepEqual(data.user, { id: user, displayName: 'Admin', role: 'administrator' });
    assert.equal(data.guildId, guild); assert.equal(data.expiresAt, session.expiresAt);
    const body = { active: false, services: [], message: '', startsAt: null, endsAt: null, reason: 'Planned service maintenance', revision: 'initial' };
    const first = await f.call('/maintenance', body, session.sessionToken, { 'idempotency-key': 'dashboard-maintenance-001' }, 'PUT');
    assert.equal(first.status, 200);
    assert.deepEqual(await (await f.call('/maintenance', body, session.sessionToken, { 'idempotency-key': 'dashboard-maintenance-001' }, 'PUT')).json(), await first.json());
    assert.equal((await f.call('/maintenance', body, session.sessionToken, { 'idempotency-key': 'dashboard-maintenance-002' }, 'PUT')).status, 409);
    f.outage(true); assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 503);
    f.outage(false); assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 200);
    f.permission(false); assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 403);
    assert.equal((await f.call('/auth/logout', {}, session.sessionToken)).status, 200);
    assert.equal((await f.call('/auth/logout', {}, session.sessionToken)).status, 200);
    assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 401);
    assert.equal((await f.call('/session', undefined, undefined, { 'x-wo-user-assertion': 'legacy-human' })).status, 401);
  } finally { await f.close(); }
});

test('HTTP rechecks permission after slow body uploads before mutating', async () => {
  const f = await fixture();
  try {
    await f.auth.enroll(user, guild, true);
    const session = await (await f.login()).json() as { sessionToken: string };
    let checked!: () => void;
    const ready = new Promise<void>(resolve => { checked = resolve; });
    f.afterCheck(() => { checked(); });
    const status = new Promise<number>((resolve, reject) => {
      const req = httpRequest({ hostname: '127.0.0.1', port: (f.server.address() as { port: number }).port, path: '/v1/admin/maintenance', method: 'PUT', headers: { ...f.headers, 'x-wo-admin-session': session.sessionToken, 'idempotency-key': 'upload-maintenance-001' } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on('error', reject); req.write('{');
      void ready.then(() => { f.permission(false); req.end('"active":false,"services":[],"message":"","startsAt":null,"endsAt":null,"reason":"Planned service maintenance","revision":"initial"}'); });
    });
    assert.equal(await status, 403);
    assert.equal(f.store.operationRows().length, 0);
  } finally { await f.close(); }
});

test('OAuth attempts, callbacks and staff requests have bounded rate limits', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 20; i++) assert.equal((await f.call('/auth/discord/start', { redirectUri })).status, 200);
    assert.equal((await f.call('/auth/discord/start', { redirectUri })).status, 429);
    for (let i = 0; i < 30; i++) assert.equal((await f.call('/auth/discord/callback', { redirectUri, code: 'code', state: 'x'.repeat(43), flowToken: 'y'.repeat(43) })).status, 401);
    assert.equal((await f.call('/auth/discord/callback', { redirectUri, code: 'code', state: 'x'.repeat(43), flowToken: 'y'.repeat(43) })).status, 429);
    await f.auth.enroll(user, guild, true);
    const start = f.auth.start({ redirectUri });
    const session = await f.auth.callback({ redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
    for (let i = 0; i < 120; i++) assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 200);
    assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 429);
  } finally { await f.close(); }
});
