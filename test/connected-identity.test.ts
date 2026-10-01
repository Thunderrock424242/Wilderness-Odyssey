import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConnectedStore } from '../src/connected/store';
import { IdentityService } from '../src/connected/identity';

test('standalone tokens need no Minecraft membership and restrictions apply across linked access methods', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identities = new IdentityService(store, 'official');
  const account = identities.account('discord', 'user-1');
  const token = identities.issue(account, 'Standalone');
  assert.equal(identities.authenticate({ kind: 'account_token', token: token.token }).allowed, true);
  assert.equal(identities.authenticate({ kind: 'account_token', token: token.token }).official_server_id, null);
  assert.equal(JSON.stringify(identities.tokens(account)).includes(token.token), false);
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  identities.linkMinecraft(account, uuid, 'PlayerOne');
  store.put('restriction', 'official-only', uuid, { id: 'official-only', scope: 'aether', expiresAt: new Date(Date.now() + 60000).toISOString(), revokedAt: null, state: 'applied' });
  assert.equal(identities.authenticate({ kind: 'official_minecraft', server_id: 'official', minecraft_uuid: uuid }).allowed, false);
  assert.equal(identities.authenticate({ kind: 'account_token', token: token.token }).allowed, true);
  store.put('account_restriction', 'all-methods', account, { expiresAt: new Date(Date.now() + 60000).toISOString(), revokedAt: null });
  assert.equal(identities.authenticate({ kind: 'account_token', token: token.token }).reason, 'account_restricted');
  identities.revoke(account, token.id);
  assert.throws(() => identities.authenticate({ kind: 'account_token', token: token.token }), /credential/i);
  db.close();
});

test('linking merges restriction history and never erases an already restricted account', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identities = new IdentityService(store, 'official');
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  const game = identities.authenticate({ kind: 'official_minecraft', server_id: 'official', minecraft_uuid: uuid });
  store.put('account_restriction', 'restriction', game.account_id, { expiresAt: new Date(Date.now() + 60000).toISOString(), revokedAt: null });
  const account = identities.account('access:verified', 'sub-1');
  const token = identities.issue(account, 'Website');
  identities.linkMinecraft(account, uuid, 'PlayerOne');
  assert.equal(identities.authenticate({ kind: 'account_token', token: token.token }).reason, 'account_restricted');
  assert.throws(() => identities.authenticate({ kind: 'official_minecraft', server_id: 'untrusted', minecraft_uuid: uuid }), /server/i);
  db.close();
});

test('unlink and optional data cleanup revoke tokens without erasing active restrictions', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identity = new IdentityService(store, 'official');
  const account = identity.account('discord', 'unlink-player');
  const uuid = '12345678-1234-4234-8234-123456789012';
  identity.linkMinecraft(account, uuid, 'Player');
  const token = identity.issue(account, 'Old token');
  store.put('account_restriction', 'active', account, { revokedAt: null, expiresAt: null });
  identity.unlinkMinecraft(account, uuid);
  assert.equal(identity.ownsMinecraft(account, uuid), false);
  assert.equal(identity.authenticate({ kind: 'official_minecraft', server_id: 'official', minecraft_uuid: uuid }).allowed, false);
  identity.clearOptionalData(account);
  assert.throws(() => identity.authenticate({ kind: 'account_token', token: token.token }));
  assert.equal(identity.allowedAccount(account), false);
  db.close();
});

test('trusted Minecraft attestation registers player search without requiring a website link', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const identity = new IdentityService(store, 'official');
  const minecraft_uuid = '12345678-1234-4234-8234-123456789012';
  identity.authenticate({ kind: 'official_minecraft', server_id: 'official', minecraft_uuid, username: 'VerifiedPlayer' } as Parameters<IdentityService['authenticate']>[0]);
  assert.equal(store.record<{ username: string }>('player', minecraft_uuid)?.username, 'VerifiedPlayer');
  const account = identity.account('discord', 'token-user');
  const token = identity.issue(account, 'Test');
  assert.throws(() => identity.authenticate({ kind: 'account_token', token: token.token, username: 'Forged' } as Parameters<IdentityService['authenticate']>[0]));
  db.close();
});
