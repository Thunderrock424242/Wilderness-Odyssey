import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConnectedStore } from '../src/connected/store';
import { IdentityService } from '../src/connected/identity';
import { ModerationService } from '../src/connected/moderation';
import { ServiceMonitor } from '../src/connected/monitor';
import { AdminService } from '../src/connected/admin';
import { ConnectedHttp } from '../src/connected/http';
import { loadConnectedConfig } from '../src/connected/config';
test('HTTP separates public status, private identity broker, and authenticated player attestation', async () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identity = new IdentityService(store, 'official');
  const monitor = new ServiceMonitor(store, 'official');
  const moderation = new ModerationService(store, identity);
  const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true', IDENTITY_SERVICE_TOKEN: 'i'.repeat(40), MAIN_SERVER_INGEST_TOKEN: 'm'.repeat(40) });
  const http = new ConnectedHttp(config, store, monitor, identity, moderation, new AdminService(store, monitor, moderation));
  const server = createServer((req, res) => { void http.handle(req, res).then(handled => { if (!handled) { res.statusCode = 404; res.end(); } }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    const status = await fetch(base + '/api/public/v2/status');
    assert.equal(status.status, 200);
    assert.equal((await status.json() as { minecraft: { status: string } }).minecraft.status, 'unknown');
    const account = identity.account('discord', 'person');
    const token = identity.issue(account, 'Test');
    const call = (path: string, body: unknown, credential?: string) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(credential ? { authorization: 'Bearer ' + credential } : {}) }, body: JSON.stringify(body) });
    assert.equal((await call('/v1/service/authenticate', { kind: 'account_token', token: token.token })).status, 401);
    assert.equal((await call('/v1/service/authenticate', { kind: 'account_token', token: token.token }, 'm'.repeat(40))).status, 401);
    const auth = await call('/v1/service/authenticate', { kind: 'account_token', token: token.token }, 'i'.repeat(40));
    assert.equal(auth.status, 200);
    assert.equal((await auth.json() as { official_server_id: null }).official_server_id, null);
    assert.equal((await call('/v1/service/authenticate', { kind: 'account_token', token: token.token, minecraft_uuid: 'forged' }, 'i'.repeat(40))).status, 400);
    assert.equal((await fetch(base + '/v1/admin/overview')).status, 404);
    const link = identity.createLink(account);
    const payload = { code: link.code, minecraft_uuid: '12345678-1234-4234-8234-123456789012', username: 'Player' };
    assert.equal((await call('/v1/service/minecraft-link', payload, 'i'.repeat(40))).status, 401);
    assert.equal((await call('/v1/service/minecraft-link', payload, 'm'.repeat(40))).status, 200);
    assert.equal((await call('/v1/service/minecraft-link', payload, 'm'.repeat(40))).status, 409);
    assert.equal(identity.ownsMinecraft(account, payload.minecraft_uuid), true);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

test('staff revocation during request-body upload prevents the mutation', async () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identity = new IdentityService(store, 'official');
  const monitor = new ServiceMonitor(store, 'official');
  const moderation = new ModerationService(store, identity);
  const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true' });
  const admin = new AdminService(store, monitor, moderation);
  let called = false;
  admin.handle = async () => { called = true; return {}; };
  const handler = new ConnectedHttp({ ...config, adminEnabled: true, staffAuthMode: 'access' }, store, monitor, identity, moderation, admin);
  store.assign('https://test.cloudflareaccess.com', 'staff', 'administrator', 'Test', 'test');
  let authenticated!: () => void;
  const ready = new Promise<void>(resolve => { authenticated = resolve; });
  handler.staffAuth.authenticate = async () => {
    const actor = store.staff('https://test.cloudflareaccess.com', 'staff')!;
    authenticated();
    return { actor, subject: 'staff' };
  };
  handler.staffAuth.trust.issuer = 'https://test.cloudflareaccess.com';
  const server = createServer((req, res) => { void handler.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { request } = await import('node:http');
    const result = new Promise<number>(resolve => {
      const req = request({ hostname: '127.0.0.1', port: (server.address() as { port: number }).port, path: '/v1/admin/maintenance', method: 'PUT', headers: { 'content-type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode!); });
      req.write('{');
      void ready.then(() => { db.prepare('UPDATE cs_staff SET active=0').run(); req.end('}'); });
    });
    assert.equal(await result, 403);
    assert.equal(called, false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

