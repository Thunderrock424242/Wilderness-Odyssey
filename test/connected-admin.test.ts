import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConnectedStore } from '../src/connected/store';
import { ServiceMonitor } from '../src/connected/monitor';
import { IdentityService } from '../src/connected/identity';
import { ModerationService } from '../src/connected/moderation';
import { AdminService } from '../src/connected/admin';
const uuid = '12345678-1234-4234-8234-123456789012';
function fixture() {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identity = new IdentityService(store, 'official');
  const moderation = new ModerationService(store, identity);
  return { db, store, identity, moderation, admin: new AdminService(store, new ServiceMonitor(store, 'official'), moderation) };
}
const admin = { id: 'admin', role: 'administrator' as const };
const mod = { id: 'mod', role: 'moderator' as const };
const viewer = { id: 'viewer', role: 'viewer' as const };
test('admin validates revision inside idempotent transaction and hides sensitive records from viewers', async () => {
  const f = fixture();
  const body = { active: true, services: ['aether'], message: 'Scheduled work', startsAt: null, endsAt: null, reason: 'Scheduled service work', revision: 'initial' };
  const first = await f.admin.handle(admin, 'PUT', '/maintenance', body, {}, 'maintenance-key-001');
  assert.deepEqual(await f.admin.handle(admin, 'PUT', '/maintenance', body, {}, 'maintenance-key-001'), first);
  await assert.rejects(f.admin.handle(admin, 'PUT', '/maintenance', body, {}, 'maintenance-key-002'), /changed/i);
  await assert.rejects(f.admin.handle(mod, 'PUT', '/maintenance', body, {}, 'maintenance-key-003'), /permitted/i);
  await assert.rejects(f.admin.handle(viewer, 'GET', '/reports', undefined, {}), /permitted/i);
  await assert.rejects(f.admin.handle(admin, 'POST', '/service-operations', { operationId: 'shell', reason: 'Do something unsafe' }, {}, 'service-key-12345'), /available|supported/i);
  f.db.close();
});
test('reports accept only bounded selected excerpts and purge them at expiry', () => {
  const f = fixture();
  const accountId = f.identity.account('discord', 'player');
  f.identity.linkMinecraft(accountId, uuid, 'Player');
  const input = { accountId, playerUuid: uuid, summary: 'An inappropriate answer', excerpts: [{ speaker: 'aether' as const, text: 'Selected private content', sentAt: f.store.now() }], provenance: 'User selected in Discord' };
  const report = f.moderation.submitReport(input, 'report-key-123456');
  assert.equal(f.moderation.submitReport(input, 'report-key-123456').id, report.id);
  assert.throws(() => f.moderation.submitReport({ ...input, excerpts: [{ ...input.excerpts[0]!, text: 'a'.repeat(2001) }] }, 'other-key-1234567'));
  f.moderation.cleanup(Date.now() + 31 * 86400000);
  assert.deepEqual(f.moderation.detail(report.id).excerpts, []);
  assert.equal(JSON.stringify(f.store.records('report')).includes('Selected private content'), false);
  f.db.close();
});
test('moderation is scoped to verified players and global restrictions survive linkage', async () => {
  const f = fixture();
  const accountId = f.identity.account('discord', 'player');
  f.identity.linkMinecraft(accountId, uuid, 'Player');
  const token = f.identity.issue(accountId, 'Local');
  const body = { scope: 'aether', reason: 'Repeated abusive AI requests', expiresAt: new Date(Date.now() + 3600000).toISOString() };
  await f.admin.handle(mod, 'POST', '/players/' + uuid + '/restrictions', body, {}, 'restrict-key-12345');
  assert.equal(f.identity.authenticate({ kind: 'account_token', token: token.token }).allowed, true);
  assert.equal(f.identity.authenticate({ kind: 'official_minecraft', server_id: 'official', minecraft_uuid: uuid }).allowed, false);
  await f.admin.handle(mod, 'POST', '/accounts/' + accountId + '/restrictions', body, {}, 'global-key-123456');
  assert.equal(f.identity.authenticate({ kind: 'account_token', token: token.token }).allowed, false);
  f.db.close();
});

test('staff can moderate a verified standalone account without Minecraft membership', async () => {
  const f = fixture();
  const accountId = f.identity.account('https://test.cloudflareaccess.com', 'standalone');
  const token = f.identity.issue(accountId, 'Standalone');
  const detail = await f.admin.handle(mod, 'GET', '/accounts/' + accountId, undefined);
  assert.deepEqual(detail, { schemaVersion: '1.0', account: { id: accountId, restrictions: [] } });
  await assert.rejects(f.admin.handle(viewer, 'GET', '/accounts/' + accountId, undefined), /permitted/i);
  await f.admin.handle(mod, 'POST', '/accounts/' + accountId + '/restrictions', { scope: 'aether', reason: 'Repeated abusive requests', expiresAt: new Date(Date.now() + 3600000).toISOString() }, {}, 'standalone-restriction-key');
  assert.equal(f.identity.authenticate({ kind: 'account_token', token: token.token }).allowed, false);
  f.db.close();
});

test('appeal decisions require a different staff member from the restriction author', async () => {
  const f = fixture();
  const account = f.identity.account('discord', 'appeal-player');
  f.identity.linkMinecraft(account, uuid, 'Player');
  await f.admin.handle(mod, 'POST', '/players/' + uuid + '/restrictions', { scope: 'aether', reason: 'Policy violation reviewed', expiresAt: new Date(Date.now() + 3600000).toISOString() }, {}, 'appeal-restriction-key');
  const appeal = f.moderation.appeal(account, uuid, 'Please review this decision.', 'appeal-request-key-123');
  const record = f.store.records<{ id: string; revision: string }>('appeal', uuid)[0]!;
  const input = { decision: 'accepted', reason: 'Reviewed available evidence', revision: record.revision };
  await assert.rejects(f.admin.handle(mod, 'POST', '/players/' + uuid + '/appeals/' + record.id + '/resolve', input, {}, 'appeal-resolution-key'), /another|different/i);
  assert.ok(appeal);
  await f.admin.handle(admin, 'POST', '/players/' + uuid + '/appeals/' + record.id + '/resolve', input, {}, 'appeal-second-review-key');
  f.db.close();
});
test('maintenance keeps one private reason and session exposes the verified subject', async () => {
  const f = fixture();
  f.store.assign('https://team.cloudflareaccess.com', 'staff-subject', 'administrator', 'Staff', 'test');
  const actor = f.store.staff('https://team.cloudflareaccess.com', 'staff-subject')!;
  const session = await f.admin.handle(actor, 'GET', '/session', undefined) as { user: { id: string } };
  assert.equal(session.user.id, 'staff-subject');
  const body = { active: false, services: [], message: '', startsAt: null, endsAt: null, reason: 'Private maintenance justification', revision: 'initial' };
  await f.admin.handle(actor, 'PUT', '/maintenance', body, {}, 'maintenance-audit-key');
  await f.admin.handle(actor, 'PUT', '/maintenance', body, {}, 'maintenance-audit-key');
  const history = f.store.records<{ reason: string; actorId: string }>('maintenance_history');
  assert.equal(history.length, 1);
  assert.equal(history[0]!.reason, body.reason);
  assert.equal(history[0]!.actorId, actor.id);
  assert.equal(JSON.stringify(f.admin.monitor.publicStatus()).includes(body.reason), false);
  f.db.close();
});

test('remote wait rechecks active staff for mutation and protected responses', async () => {
  const f = fixture();
  f.store.assign('discord', 'admin', 'administrator', 'Staff', 'test');
  const actor = f.store.staff('discord', 'admin')!;
  const remote = { async capabilities() {
    f.db.prepare('UPDATE cs_staff SET active=0').run();
    return { actions: ['ai.pause'], aiRequestsRevision: 'initial', models: { schemaVersion: '1.0' as const, revision: 'initial', activeModelId: null, models: [], settings: { temperature: 0.5, numPredict: 256, numCtx: 1024 }, permittedSettings: { temperature: { min: 0, max: 2 }, numPredict: { min: 32, max: 1024 }, numCtx: { min: 512, max: 8192 } } } };
  } };
  const service = new AdminService(f.store, f.admin.monitor, f.moderation, remote);
  for (const path of ['/overview', '/models', '/ai-requests']) {
    f.store.assign('discord', 'admin', 'administrator', 'Staff', 'test');
    await assert.rejects(service.handle(actor, path === '/ai-requests' ? 'PUT' : 'GET', path, { paused: true, revision: 'initial', reason: 'Planned maintenance work' }, {}, 'revoked-remote-key'), /permitted/i);
  }
  assert.equal(f.store.operationRows().length, 0);
  f.db.close();
});

