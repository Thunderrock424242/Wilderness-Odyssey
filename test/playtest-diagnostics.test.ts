import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConnectedStore } from '../src/connected/store';
import { IdentityService } from '../src/connected/identity';
import { ServiceMonitor } from '../src/connected/monitor';
import { ModerationService } from '../src/connected/moderation';
import { AdminService } from '../src/connected/admin';
import { ConnectedHttp } from '../src/connected/http';
import { loadConnectedConfig } from '../src/connected/config';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  let now = Date.now();
  const store = new ConnectedStore(db, () => now);
  const identity = new IdentityService(store, 'official');
  const monitor = new ServiceMonitor(store, 'official');
  const moderation = new ModerationService(store, identity);
  const config = { ...loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true' }), adminEnabled: true, staffAuthMode: 'access' as const };
  const handler = new ConnectedHttp(config, store, monitor, identity, moderation, new AdminService(store, monitor, moderation));
  store.assign('test', 'staff', 'administrator', 'Staff', 'test');
  handler.staffAuth.trust.issuer = 'test';
  // Only the external identity provider is substituted; authorization, handlers and storage are real.
  handler.staffAuth.authenticate = async () => ({ actor: store.staff('test', 'staff')!, subject: 'staff' });
  const server = createServer((req, res) => { void handler.handle(req, res).then(handled => { if (!handled) { res.statusCode = 404; res.end(); } }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = (path: string, body?: unknown, token?: string, method = body === undefined ? 'GET' : 'POST', key: string = randomUUID()) => fetch(base + path, {
    method, headers: { 'content-type': 'application/json', 'idempotency-key': key, ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const staff = async (path: string, body?: unknown, method?: string, key?: string) => {
    const response = await call('/v1/admin/playtest' + path, body, undefined, method, key);
    const result = await response.json() as Record<string, any>;
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  const seed = async (suffix = '1') => {
    const campaignId = 'campaign-' + suffix, testerId = 'tester-' + suffix;
    await staff('/campaigns', { id: campaignId, title: 'Test', reason: 'Test campaign setup' });
    let campaign = (await staff('/campaigns')).campaigns.find((c: { id: string }) => c.id === campaignId);
    await staff('/campaigns/' + campaignId + '/collection', { revision: campaign.revision, enabled: true, captureLogs: true, captureSpark: true, reason: 'Begin test collection' }, 'PUT');
    await staff('/campaigns/' + campaignId + '/testers', { testerId, discordUserId: '123456789012345678', displayName: 'Tester', reason: 'Approved test participant' });
    const tester = (await staff('/campaigns/' + campaignId + '/testers')).testers[0];
    const issued = await staff('/campaigns/' + campaignId + '/invitations', { id: randomUUID(), testerId, revision: tester.revision, expiresInSeconds: 300, reason: 'Private test invitation' });
    campaign = (await staff('/campaigns')).campaigns.find((c: { id: string }) => c.id === campaignId);
    return { campaignId, testerId, campaign, tester, invite: issued.invitation };
  };
  const enroll = async (invitation: string, installationId = randomUUID()) => {
    const response = await call('/api/playtest/v1/enroll', { schemaVersion: '1.0', installationId, invitation, consentVersion: '1' });
    return { response, body: await response.json() as Record<string, any>, installationId };
  };
  return { db, store, handler, base, call, staff, seed, enroll, advance: (ms: number) => { now += ms; }, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); } };
}

const artifact = (campaignId: string, testerId: string, collectionId: string, changes: Record<string, unknown> = {}) => ({
  schemaVersion: '1.0', artifactId: randomUUID(), campaignId, testerId, collectionId, sessionId: randomUUID(), kind: 'log', scope: 'client', capturedAt: new Date().toISOString(), contentType: 'text/plain', encoding: 'utf8', content: 'safe log', ...changes,
});

test('atomic invitations require consent, expire, cannot be reused and never expose credentials in lists', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const bad = await f.call('/api/playtest/v1/enroll', { schemaVersion: '1.0', installationId: randomUUID(), invitation: a.invite.invitation, consentVersion: '0' });
    assert.equal(bad.status, 400);
    const attempts = await Promise.all([f.enroll(a.invite.invitation), f.enroll(a.invite.invitation)]);
    assert.deepEqual(attempts.map(a => a.response.status).sort(), [201, 409]);
    const winner = attempts.find(a => a.response.status === 201)!;
    assert.deepEqual(Object.keys(winner.body).sort(), ['accessToken', 'campaignId', 'schemaVersion', 'testerId']);
    assert.ok(winner.body.accessToken.length >= 32);
    assert.equal((await f.enroll(a.invite.invitation, winner.installationId)).response.status, 409);
    const lists = JSON.stringify(await f.staff('/campaigns/' + a.campaignId + '/invitations')) + JSON.stringify(await f.staff('/campaigns/' + a.campaignId + '/testers'));
    assert.ok(!lists.includes(a.invite.invitation));
    assert.ok(!lists.includes(winner.body.accessToken));
    const expired = await f.seed('expired');
    f.advance(300001);
    assert.equal((await f.enroll(expired.invite.invitation)).response.status, 410);
  } finally { await f.close(); }
});

test('policy scopes credentials, off rejects immediately and every reenable invalidates the old collection', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const b = await f.seed('2');
    const token = (await f.enroll(a.invite.invitation)).body.accessToken;
    const policy = await (await f.call('/api/playtest/v1/policy', undefined, token)).json() as any;
    assert.equal(policy.collectionId, a.campaign.collectionId);
    assert.equal(policy.leaseSeconds, 60);
    assert.equal(policy.testerId, a.testerId);
    assert.equal((await f.call('/api/playtest/v1/policy', undefined, 'bogus')).status, 401);
    assert.equal((await f.call('/api/playtest/v1/artifacts', artifact(b.campaignId, b.testerId, b.campaign.collectionId), token)).status, 403);
    await f.staff('/campaigns/' + a.campaignId + '/collection', { revision: a.campaign.revision, enabled: false, captureLogs: true, captureSpark: true, reason: 'Stop test collection' }, 'PUT');
    assert.deepEqual(await (await f.call('/api/playtest/v1/policy', undefined, token)).json(), { schemaVersion: '1.0', enabled: false });
    assert.equal((await f.call('/api/playtest/v1/artifacts', artifact(a.campaignId, a.testerId, policy.collectionId), token)).status, 403);
    let campaign = (await f.staff('/campaigns')).campaigns.find((c: any) => c.id === a.campaignId);
    await f.staff('/campaigns/' + a.campaignId + '/collection', { revision: campaign.revision, enabled: true, captureLogs: true, captureSpark: true, reason: 'Restart test collection' }, 'PUT');
    campaign = (await f.staff('/campaigns')).campaigns.find((c: any) => c.id === a.campaignId);
    assert.notEqual(campaign.collectionId, policy.collectionId);
    assert.equal((await f.call('/api/playtest/v1/artifacts', artifact(a.campaignId, a.testerId, policy.collectionId), token)).status, 403);
    await f.staff('/campaigns/' + a.campaignId + '/testers/' + a.testerId + '/revoke', { revision: a.tester.revision, reason: 'Revoke test participation' });
    assert.equal((await f.call('/api/playtest/v1/policy', undefined, token)).status, 410);
    assert.equal((await f.call('/api/playtest/v1/artifacts', artifact(a.campaignId, a.testerId, campaign.collectionId), token)).status, 410);
  } finally { await f.close(); }
});

test('separate durable artifacts deduplicate, conflict, enforce sizes, download safely and remain deleted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wo-diagnostics-'));
  const path = join(dir, 'test.sqlite');
  let f = await fixture(path);
  try {
    const a = await f.seed();
    const enrolled = await f.enroll(a.invite.invitation);
    const token = enrolled.body.accessToken;
    const sessionId = randomUUID();
    const entries = ['session', 'log', 'crash', 'spark'].map(kind => artifact(a.campaignId, a.testerId, a.campaign.collectionId, {
      sessionId, kind, contentType: kind === 'spark' ? 'application/x-spark-sampler' : kind === 'session' ? 'application/json' : 'text/plain',
      encoding: kind === 'spark' ? 'base64' : 'utf8', content: kind === 'spark' ? Buffer.from('actual profile bytes').toString('base64') : kind === 'session' ? JSON.stringify({ state: 'interrupted', sparkStatus: 'busy', startedAt: new Date().toISOString(), build: 'test' }) : kind,
    }));
    for (const item of entries) {
      const response = await f.call('/api/playtest/v1/artifacts', item, token);
      assert.equal(response.status, 200, await response.clone().text());
      assert.deepEqual(await response.json(), { schemaVersion: '1.0', accepted: true, artifactId: item.artifactId });
    }
    assert.equal((await f.call('/api/playtest/v1/artifacts', entries[1], token)).status, 200);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...entries[1], content: 'conflicting' }, token)).status, 409);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...entries[1], artifactId: randomUUID(), content: 'x'.repeat(256 * 1024 + 1) }, token)).status, 413);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...entries[1], artifactId: randomUUID(), content: '😀'.repeat(65537) }, token)).status, 413);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...entries[3], artifactId: randomUUID(), content: Buffer.alloc(1024 * 1024 + 1).toString('base64') }, token)).status, 413);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...entries[3], artifactId: randomUUID(), content: '!!!!' }, token)).status, 400);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...entries[1], artifactId: randomUUID(), scope: 'server' }, token)).status, 400);
    await f.close();
    f = await fixture(path);
    assert.equal((await f.call('/api/playtest/v1/policy', undefined, token)).status, 200);
    const history = await f.staff('/campaigns/' + a.campaignId + '/testers/' + a.testerId + '/sessions');
    assert.equal(history.sessions[0].state, 'interrupted');
    assert.equal(history.sessions[0].sparkStatus, 'busy');
    const list = await f.staff('/campaigns/' + a.campaignId + '/testers/' + a.testerId + '/artifacts');
    assert.deepEqual(list.artifacts.map((v: any) => v.kind).sort(), ['crash', 'log', 'session', 'spark']);
    const spark = entries[3];
    const download = await f.call('/v1/admin/playtest/artifacts/' + spark.artifactId + '/download');
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-disposition'), 'attachment; filename="' + spark.artifactId + '.sparkprofile"');
    assert.equal(await download.text(), 'actual profile bytes');
    const metadata = list.artifacts.find((v: any) => v.artifactId === spark.artifactId);
    await f.staff('/artifacts/' + spark.artifactId + '/delete', { revision: metadata.revision, reason: 'Explicit test deletion' });
    assert.equal((await f.call('/v1/admin/playtest/artifacts/' + spark.artifactId + '/download')).status, 410);
    assert.equal((await f.call('/api/playtest/v1/artifacts', spark, token)).status, 410);
    assert.equal((await f.call('/v1/admin/playtest/artifacts/%2e%2e%2f/download')).status, 400);
  } finally { await f.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('client enrollment is handled without trusting supplied identity', async () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identity = new IdentityService(store, 'official');
  const monitor = new ServiceMonitor(store, 'official');
  const moderation = new ModerationService(store, identity);
  const handler = new ConnectedHttp(loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true' }), store, monitor, identity, moderation, new AdminService(store, monitor, moderation));
  const server = createServer((req, res) => { void handler.handle(req, res).then(handled => { if (!handled) { res.statusCode = 404; res.end(); } }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + (server.address() as { port: number }).port + '/api/playtest/v1/enroll', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: '1.0', installationId: '12345678-1234-4234-8234-123456789012', invitation: 'x'.repeat(43), consentVersion: '1' }),
    });
    assert.equal(response.status, 401);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

test('disabled enrollment, invitation revocation, staff revisions and issue retries fail safely', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const path = '/v1/admin/playtest/campaigns/' + a.campaignId + '/collection';
    const input = { revision: a.campaign.revision, enabled: false, captureLogs: true, captureSpark: true, reason: 'Stop before enrollment' };
    const key = randomUUID();
    assert.equal((await f.call(path, input, undefined, 'PUT', key)).status, 200);
    assert.equal((await f.call(path, input, undefined, 'PUT', key)).status, 200);
    assert.equal((await f.call(path, { ...input, enabled: true }, undefined, 'PUT', key)).status, 409);
    assert.equal((await f.call(path, input, undefined, 'PUT')).status, 409);
    assert.equal((await f.enroll(a.invite.invitation)).response.status, 403);
    const issuedInput = { id: randomUUID(), testerId: a.testerId, revision: a.tester.revision, expiresInSeconds: 60, reason: 'Issue retry test invitation' };
    const issueKey = randomUUID();
    const first = await f.staff('/campaigns/' + a.campaignId + '/invitations', issuedInput, 'POST', issueKey);
    const retry = await f.staff('/campaigns/' + a.campaignId + '/invitations', issuedInput, 'POST', issueKey);
    assert.equal(retry.invitation, null);
    assert.equal(first.operation.id, retry.operation.id);
    const listed = await f.staff('/campaigns/' + a.campaignId + '/invitations');
    const invitation = listed.invitations.find((v: any) => v.id === issuedInput.id);
    await f.staff('/invitations/' + issuedInput.id + '/revoke', { revision: invitation.revision, reason: 'Revoke undelivered invitation' });
    assert.equal((await f.enroll(first.invitation.invitation)).response.status, 410);
    f.db.prepare("UPDATE cs_staff SET role='viewer'").run();
    assert.equal((await f.call('/v1/admin/playtest/campaigns')).status, 403);
    assert.equal((await f.call('/v1/admin/playtest/campaigns', { id: 'denied', title: 'Denied', reason: 'Unauthorized creation' })).status, 403);
  } finally { await f.close(); }
});

test('upload rechecks off and revoked authority after streaming body; staff cannot forge identity headers', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const enrolled = await f.enroll(a.invite.invitation);
    const token = enrolled.body.accessToken;
    const item = artifact(a.campaignId, a.testerId, a.campaign.collectionId);
    const { request } = await import('node:http');
    const slow = (path: string, body: unknown, change: () => Promise<void>) => new Promise<number>((resolve, reject) => {
      const req = request(f.base + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'idempotency-key': randomUUID() } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on('error', reject);
      req.write(JSON.stringify(body).slice(0, -1));
      setTimeout(() => { void change().then(() => req.end('}')).catch(reject); }, 20);
    });
    assert.equal(await slow('/api/playtest/v1/artifacts', item, async () => {
      await f.staff('/campaigns/' + a.campaignId + '/collection', { revision: a.campaign.revision, enabled: false, captureLogs: true, captureSpark: true, reason: 'Stop during in flight upload' }, 'PUT');
    }), 403);
    assert.equal(f.store.records('pt_artifact').length, 0);
    const b = await f.seed('revoke');
    const tokenB = (await f.enroll(b.invite.invitation)).body.accessToken;
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...item, testerId: b.testerId, campaignId: b.campaignId }, tokenB)).status, 403);
    assert.equal(await slow('/v1/admin/playtest/campaigns', { id: 'late', title: 'Late', reason: 'Late staff upload test' }, async () => { f.db.prepare('UPDATE cs_staff SET active=0').run(); }), 403);
    assert.equal(f.store.record('pt_campaign', 'late'), null);
    const response = await fetch(f.base + '/api/playtest/v1/policy', { headers: { 'x-discord-user-id': '123456789012345678', 'x-wo-user-role': 'administrator' } });
    assert.equal(response.status, 401);
  } finally { await f.close(); }
});

test('storage failure never acknowledges and rolls back file, metadata and receipt together', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const token = (await f.enroll(a.invite.invitation)).body.accessToken;
    const item = artifact(a.campaignId, a.testerId, a.campaign.collectionId);
    f.db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON cs_records WHEN NEW.kind='pt_artifact' BEGIN SELECT RAISE(ABORT, 'storage failure'); END;");
    assert.equal((await f.call('/api/playtest/v1/artifacts', item, token)).status, 503);
    assert.equal(f.store.record('pt_artifact', item.artifactId), null);
    assert.equal((f.db.prepare('SELECT count(*) AS n FROM cs_playtest_files').get() as { n: number }).n, 0);
    f.db.exec('DROP TRIGGER test_failure');
    assert.equal((await f.call('/api/playtest/v1/artifacts', item, token)).status, 200);
    const second = await f.enroll((await f.staff('/campaigns/' + a.campaignId + '/invitations', { id: randomUUID(), testerId: a.testerId, revision: a.tester.revision, expiresInSeconds: 60, reason: 'Second installation invitation' })).invitation.invitation);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...item, artifactId: randomUUID() }, second.body.accessToken)).status, 403);
    assert.equal((await f.call('/api/playtest/v1/artifacts', item, second.body.accessToken)).status, 409);
    const raw = await fetch(f.base + '/api/playtest/v1/artifacts', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ ...item, content: 'x'.repeat(1536 * 1024) }) });
    assert.equal(raw.status, 413);
    f.db.prepare("UPDATE cs_staff SET role='viewer'").run();
    assert.equal((await f.call('/v1/admin/playtest/artifacts/' + item.artifactId + '/download')).status, 403);
  } finally { await f.close(); }
});

test('session metadata cannot overwrite trusted ownership or invent a saved Spark file', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const token = (await f.enroll(a.invite.invitation)).body.accessToken;
    const item = artifact(a.campaignId, a.testerId, a.campaign.collectionId, {
      kind: 'session', contentType: 'application/json', content: JSON.stringify({ state: 'recording', sparkStatus: 'saved', campaignId: 'forged', testerId: 'forged', collectionId: 'forged', id: randomUUID(), installation: 'forged' }),
    });
    assert.equal((await f.call('/api/playtest/v1/artifacts', item, token)).status, 200);
    const stored = f.store.record<{ campaignId: string; testerId: string; collectionId: string }>('pt_session', item.sessionId)!;
    assert.equal(stored.campaignId, a.campaignId);
    assert.equal(stored.testerId, a.testerId);
    assert.equal(stored.collectionId, a.campaign.collectionId);
    const response = await f.staff('/campaigns/' + a.campaignId + '/testers/' + a.testerId + '/sessions');
    assert.equal(response.sessions[0].sparkArtifactCount, 0);
    assert.equal(response.sessions[0].sparkStatus, 'saved'); // Reported state is distinct from received evidence.
  } finally { await f.close(); }
});

test('lost enrollment acknowledgement recovers only with staff revocation and a fresh private invitation', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const first = await f.enroll(a.invite.invitation);
    assert.equal((await f.enroll(a.invite.invitation, first.installationId)).response.status, 409);
    const old = (await f.staff('/campaigns/' + a.campaignId + '/testers/' + a.testerId + '/installations')).installations[0];
    await f.staff('/installations/' + first.installationId + '/revoke', { campaignId: a.campaignId, testerId: a.testerId, installationId: first.installationId, revision: old.revision, reason: 'Lost enrollment acknowledgement' });
    assert.equal((await f.call('/api/playtest/v1/policy', undefined, first.body.accessToken)).status, 410);
    const invitation = (await f.staff('/campaigns/' + a.campaignId + '/invitations', { id: randomUUID(), testerId: a.testerId, revision: a.tester.revision, expiresInSeconds: 60, reason: 'Replace lost installation credential' })).invitation;
    const second = await f.enroll(invitation.invitation, first.installationId);
    assert.equal(second.response.status, 201);
    assert.notEqual(first.body.accessToken, second.body.accessToken);
    assert.equal((await f.call('/api/playtest/v1/policy', undefined, first.body.accessToken)).status, 401);
    assert.equal((await f.call('/api/playtest/v1/policy', undefined, second.body.accessToken)).status, 200);
  } finally { await f.close(); }
});

test('delayed logs do not renew recording observations and a future client clock cannot hide an end', async () => {
  const f = await fixture();
  try {
    const a = await f.seed();
    const token = (await f.enroll(a.invite.invitation)).body.accessToken;
    const item = artifact(a.campaignId, a.testerId, a.campaign.collectionId, { kind: 'session', contentType: 'application/json', content: JSON.stringify({ state: 'recording', sparkStatus: 'busy' }) });
    assert.equal((await f.call('/api/playtest/v1/artifacts', item, token)).status, 200);
    f.advance(120000);
    await f.call('/api/playtest/v1/policy', undefined, token);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...item, artifactId: randomUUID(), kind: 'log', contentType: 'text/plain', content: 'old queued log' }, token)).status, 200);
    const listPath = '/campaigns/' + a.campaignId + '/testers/' + a.testerId + '/sessions';
    assert.equal((await f.staff(listPath)).sessions[0].observation, 'waiting');
    const future = { ...item, artifactId: randomUUID(), sessionId: randomUUID(), capturedAt: '2099-01-01T00:00:00Z' };
    assert.equal((await f.call('/api/playtest/v1/artifacts', future, token)).status, 200);
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...future, artifactId: randomUUID(), capturedAt: new Date().toISOString(), content: JSON.stringify({ state: 'ended', sparkStatus: 'unavailable' }) }, token)).status, 200);
    const session = (await f.staff(listPath)).sessions.find((s: any) => s.id === future.sessionId);
    assert.equal(session.state, 'ended');
    // A delayed recording update can never resurrect a terminal session.
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...future, artifactId: randomUUID() }, token)).status, 200);
    assert.equal((await f.staff(listPath)).sessions.find((s: any) => s.id === future.sessionId).state, 'ended');
    assert.equal((await f.call('/api/playtest/v1/artifacts', { ...future, artifactId: randomUUID(), content: JSON.stringify({ state: 'ended', sparkStatus: 'saved' }) }, token)).status, 200);
    const final = (await f.staff(listPath)).sessions.find((s: any) => s.id === future.sessionId);
    assert.equal(final.state, 'ended');
    assert.equal(final.sparkStatus, 'saved');
  } finally { await f.close(); }
});
