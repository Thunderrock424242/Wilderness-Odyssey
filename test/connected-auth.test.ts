import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AccessAuthenticator, secretMatches } from '../src/connected/auth';
import { ConnectedStore } from '../src/connected/store';

const loadJose = new Function('return import("jose")') as () => Promise<typeof import('jose')>;
test('admin authentication requires distinct signed machine and human identities and a current assignment', async () => {
  const { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } = await loadJose();
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const key = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' };
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const issuer = 'https://test.cloudflareaccess.com';
  const authenticator = new AccessAuthenticator(store, { issuer, machineAudience: 'backend', staffAudience: 'website', machineIdentity: 'gateway', environment: 'production' }, createLocalJWKSet({ keys: [key] }));
  const sign = (claims: Record<string, unknown>, audience: string) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: key.kid }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const machine = await sign({ common_name: 'gateway' }, 'backend');
  const human = await sign({ sub: 'staff-1', email: 'staff@example.invalid', role: 'administrator' }, 'website');
  const headers = { 'cf-access-jwt-assertion': machine, 'x-wo-user-assertion': human, 'x-wo-environment': 'production' };
  await assert.rejects(authenticator.authenticate(headers), /permission/i);
  store.assign(issuer, 'staff-1', 'viewer', 'Viewer', 'operator');
  assert.equal((await authenticator.authenticate(headers)).actor.role, 'viewer');
  await assert.rejects(authenticator.authenticate({ ...headers, 'cf-access-jwt-assertion': human }), /identity/i);
  await assert.rejects(authenticator.authenticate({ ...headers, 'x-wo-environment': 'preview' }), /identity/i);
  await assert.rejects(authenticator.authenticate({ ...headers, 'x-wo-user-assertion': await sign({ common_name: 'automation', sub: 'staff-1', email: 'staff@example.invalid' }, 'website') }), /identity/i);
  db.prepare('UPDATE cs_staff SET active=0').run();
  await assert.rejects(authenticator.authenticate(headers), /permission/i);
  db.close();
});
test('unset or short service credentials never authenticate', () => {
  assert.equal(secretMatches('', ''), false);
  assert.equal(secretMatches('short', 'short'), false);
  assert.equal(secretMatches('a'.repeat(32), 'a'.repeat(32)), true);
  assert.equal(secretMatches('a'.repeat(32), 'b'.repeat(32)), false);
});
