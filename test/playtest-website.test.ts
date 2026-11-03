import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ConnectedStore, ServiceError, type Actor } from '../src/connected/store';
import { PlaytestWebsite } from '../src/connected/playtestWebsite';
import { PlaytestService } from '../src/connected/playtest';
import * as s from '../src/contracts/v1/playtests';

const actor: Actor = { id: 'admin', role: 'administrator' };
test('website campaign, invitation, client collection, pause/resume, notes, artifacts and deletion share the real store', () => {
  const db = new DatabaseSync(':memory:');
  let now = Date.now();
  const store = new ConnectedStore(db, () => now);
  const api = new PlaytestWebsite(store, 'https://gateway.example');
  const client = new PlaytestService(store);
  const call = (method: string, path: string, body?: unknown, key = randomUUID()) => api.handle(actor, method, path, body, {}, key);
  try {
    const { campaign: created } = s.campaignEnvelope.parse(call('POST', '/playtests', { title: 'Release test', build: '0.2', retentionDays: 7 }));
    const { campaign } = s.campaignEnvelope.parse(call('PUT', '/playtests/' + created.id + '/collection', { collect: true, revision: created.revision }));
    const path = '/playtests/' + campaign.id;
    const input = { testerLabel: 'Outside tester', discordUserId: '937012682702352434', expiresInHours: 24, revision: campaign.revision };
    const key = randomUUID();
    const invited = s.invitationSchema.parse(call('POST', path + '/invitations', input, key));
    assert.deepEqual(call('POST', path + '/invitations', input, key), invited);
    const enrollment = client.enroll({ schemaVersion: '1.0', installationId: randomUUID(), invitation: invited.invitation.code, consentVersion: '1' });
    const policy = client.policy(enrollment.accessToken);
    assert.equal(policy.enabled, true);
    const profilePath = path + '/testers/' + enrollment.testerId;
    const artifactId = randomUUID(), sessionId = randomUUID();
    const artifact = { schemaVersion: '1.0' as const, artifactId, campaignId: campaign.id, testerId: enrollment.testerId, collectionId: policy.collectionId!, sessionId, kind: 'session', scope: 'client', capturedAt: store.now(), contentType: 'application/json', encoding: 'utf8', content: JSON.stringify({ state: 'recording', sparkStatus: 'idle', startedAt: store.now(), build: '0.2' }) };
    client.accept(enrollment.accessToken, artifact);
    const profile = s.profileSchema.parse(call('GET', profilePath));
    assert.equal(profile.sessions.length, 1);
    const saved = s.sessionEnvelope.parse(call('PUT', profilePath + '/sessions/' + sessionId + '/notes', { notes: 'Investigate startup', revision: profile.sessions[0]!.revision }));
    assert.equal(saved.session.notes, 'Investigate startup');
    const download = s.privateArtifactSchema.parse(call('GET', profilePath + '/sessions/' + sessionId + '/artifacts/' + artifactId));
    assert.equal(download.redacted, true);
    assert.throws(() => call('GET', profilePath.replace(enrollment.testerId, 'someone-else') + '/sessions/' + sessionId + '/artifacts/' + artifactId));
    const paused = s.testerEnvelope.parse(call('PUT', profilePath + '/permission', { permission: 'paused', revision: profile.tester.revision }));
    assert.equal(client.policy(enrollment.accessToken).enabled, false);
    assert.throws(() => client.accept(enrollment.accessToken, { ...artifact, artifactId: randomUUID() }));
    call('PUT', profilePath + '/permission', { permission: 'allowed', revision: paused.tester.revision });
    assert.notEqual(client.policy(enrollment.accessToken).collectionId, policy.collectionId);
    assert.throws(() => client.accept(enrollment.accessToken, { ...artifact, artifactId: randomUUID() }));
    const current = s.profileSchema.parse(call('GET', profilePath));
    call('DELETE', profilePath + '/data', { revision: current.tester.revision, confirmDelete: true });
    assert.throws(() => call('POST', path + '/invitations', input, key), (error: unknown) => error instanceof ServiceError && error.status === 410);
    assert.equal(db.prepare('SELECT count(*) AS n FROM cs_playtest_files').get()!.n, 0);
    assert.throws(() => client.policy(enrollment.accessToken));
    now += 8 * 86400000;
    api.cleanup();
    assert.throws(() => call('POST', path + '/invitations', input, key), (error: unknown) => error instanceof ServiceError && error.status === 409);
    assert.throws(() => api.handle({ id: 'viewer', role: 'viewer' }, 'GET', '/playtests', undefined, {}, ''), (error: unknown) => error instanceof ServiceError && error.status === 403);
  } finally { db.close(); }
});

test('retention hides and erases session notes and timing, and legacy tester IDs cannot change identity', () => {
  const db = new DatabaseSync(':memory:');
  let now = Date.now();
  const store = new ConnectedStore(db, () => now), api = new PlaytestWebsite(store, 'https://gateway.example');
  try {
    const campaign = { id: 'legacy', title: 'Legacy', enabled: true, collectionId: 'collection', captureLogs: true, captureSpark: true, revision: 'revision', createdAt: store.now(), updatedAt: store.now() };
    const tester = { id: '937012682702352434', campaignId: campaign.id, discordUserId: '123456789012345678', displayName: 'Original tester', revision: 'tester-revision', approvedAt: store.now(), revokedAt: null };
    store.put('pt_campaign', campaign.id, campaign.id, campaign);
    store.put('pt_web_campaign', campaign.id, campaign.id, { build: 'legacy', retentionDays: 1 });
    store.put('pt_tester', campaign.id + ':' + tester.id, campaign.id, tester);
    assert.throws(() => api.handle(actor, 'POST', '/playtests/legacy/invitations', { testerLabel: 'Different person', discordUserId: tester.id, revision: campaign.revision, expiresInHours: 1 }, {}, randomUUID()));
    const sessionId = randomUUID(), owner = campaign.id + ':' + tester.id;
    store.put('pt_session', sessionId, owner, { id: sessionId, campaignId: campaign.id, testerId: tester.id, collectionId: 'collection', installation: 'installation', firstArtifactAt: store.now(), lastArtifactAt: store.now(), state: 'unknown', sparkStatus: 'unknown', observedAt: null, observedReceivedAt: null });
    store.put('pt_web_notes', sessionId, owner, { notes: 'private', revision: 'notes-revision' });
    store.put('pt_session_metadata', sessionId, owner, { startedAt: store.now(), build: 'legacy', durationSeconds: null });
    const notesPath = '/playtests/legacy/testers/' + tester.id + '/sessions/' + sessionId + '/notes';
    now += 23 * 3600000;
    const notesInput = { notes: 'Private notes near expiry', revision: 'notes-revision' }, notesKey = randomUUID();
    api.handle(actor, 'PUT', notesPath, notesInput, {}, notesKey);
    now += 2 * 3600000;
    assert.throws(() => api.handle(actor, 'PUT', notesPath, notesInput, {}, notesKey));
    const profile = s.profileSchema.parse(api.handle(actor, 'GET', '/playtests/legacy/testers/' + tester.id, undefined, {}, ''));
    assert.equal(profile.sessions.length, 0);
    api.cleanup();
    assert.equal(store.record('pt_web_notes', sessionId), null);
    assert.equal(store.record('pt_session_metadata', sessionId), null);
    assert.equal(store.record('pt_session', sessionId), null);
  } finally { db.close(); }
});
