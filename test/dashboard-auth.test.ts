import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { DashboardAuth } from '../src/connected/dashboardAuth';
import { ConnectedStore, ServiceError } from '../src/connected/store';
import { discordCallbackSchema, discordSessionSchema, discordStartSchema } from '../src/contracts/v1/auth';

const user = '123456789012345678', guild = '234567890123456789';
const redirectUri = 'https://staff.example/api/auth/discord/callback';
function fixture() {
  const db = new DatabaseSync(':memory:');
  let now = Date.now(), permission: 'allowed' | 'denied' | 'unavailable' = 'allowed';
  let afterCheck = () => {}, bot = false, exchanges = 0;
  const store = new ConnectedStore(db, () => now);
  const auth = new DashboardAuth(store, { guildId: guild, clientId: user, clientSecret: 'test-secret', redirectUri }, async () => {
    afterCheck();
    if (permission === 'denied') throw new ServiceError(403, 'FORBIDDEN', 'Administrator required.');
    if (permission === 'unavailable') throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Unavailable.');
  }, async (url, init) => {
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    if (String(url).endsWith('/oauth2/token')) {
      exchanges++;
      assert.equal(new Headers(init?.headers).get('content-type'), 'application/x-www-form-urlencoded');
      assert.equal(new URLSearchParams(String(init?.body)).get('redirect_uri'), redirectUri);
      return Response.json({ access_token: 'discarded-access', refresh_token: 'discarded-refresh', token_type: 'Bearer', scope: 'identify' });
    }
    return Response.json({ id: user, username: 'Administrator', bot });
  });
  return { db, store, auth, advance: (ms: number) => { now += ms; }, permission: (value: typeof permission) => { permission = value; }, bot: () => { bot = true; }, afterCheck: (fn: () => void) => { afterCheck = fn; }, exchanges: () => exchanges };
}
function attempt(f: ReturnType<typeof fixture>) {
  const start = discordStartSchema.parse(f.auth.start({ redirectUri }));
  return { redirectUri, code: 'valid-code', state: new URL(start.authorizationUrl).searchParams.get('state')!, flowToken: start.flowToken };
}
async function login(f: ReturnType<typeof fixture>) { return discordCallbackSchema.parse(await f.auth.callback(attempt(f))); }

test('enrollment is caller/guild bound, idempotent, and self-revocation never needs permission', async () => {
  const f = fixture();
  try {
    for (const wrong of [null, '345678901234567890']) await assert.rejects(f.auth.enroll(user, wrong, true), /server/i);
    f.permission('denied'); await assert.rejects(f.auth.enroll(user, guild, true));
    f.permission('allowed'); await f.auth.enroll(user, guild, true);
    const session = await login(f);
    await f.auth.enroll(user, guild, true);
    assert.equal((await f.auth.authenticate(session.sessionToken)).subject, user);
    f.permission('unavailable'); await f.auth.enroll(user, guild, false);
    await assert.rejects(f.auth.authenticate(session.sessionToken), /session/i);
    await f.auth.enroll(user, guild, false);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM cs_dashboard_enrollments').get()!.n, 1);
  } finally { f.db.close(); }
});

test('OAuth uses exact fields, hash-only bindings, callback allowlist, expiry and atomic single-use', async () => {
  const f = fixture();
  try {
    await f.auth.enroll(user, guild, true);
    assert.throws(() => f.auth.start({ redirectUri: redirectUri + '/' }));
    const input = attempt(f);
    const raw = JSON.stringify(f.db.prepare('SELECT * FROM cs_dashboard_attempts').all());
    assert.ok(!raw.includes(input.state) && !raw.includes(input.flowToken));
    for (const tamper of [{ state: 'x'.repeat(43) }, { flowToken: 'x'.repeat(43) }, { redirectUri: 'https://evil.example/callback' }]) await assert.rejects(f.auth.callback({ ...input, ...tamper }));
    assert.equal(f.exchanges(), 0);
    const result = await f.auth.callback(input);
    await assert.rejects(f.auth.callback(input));
    assert.equal(f.exchanges(), 1);
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM cs_dashboard_sessions').all()).includes(result.sessionToken));
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM cs_dashboard_sessions').all()).includes('discarded'));
    const expired = attempt(f); f.advance(300000); await assert.rejects(f.auth.callback(expired));
    assert.equal(f.exchanges(), 1);
    await assert.rejects(f.auth.callback({ ...attempt(f), code: 'c'.repeat(2049) }));
    const start = f.auth.start({ redirectUri });
    const url = new URL(start.authorizationUrl);
    assert.equal(url.origin + url.pathname, 'https://discord.com/oauth2/authorize');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['client_id', 'redirect_uri', 'response_type', 'scope', 'state']);
    assert.equal(url.searchParams.get('scope'), 'identify');
  } finally { f.db.close(); }
});

test('OAuth rejects unenrolled users and bots; parallel callbacks exchange once', async () => {
  const f = fixture();
  try {
    await assert.rejects(login(f), (e: unknown) => e instanceof ServiceError && e.code === 'ENROLLMENT_REQUIRED');
    await f.auth.enroll(user, guild, true);
    const input = attempt(f);
    const results = await Promise.allSettled([f.auth.callback(input), f.auth.callback(input)]);
    assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
    f.bot(); await assert.rejects(login(f), /identity/i);
  } finally { f.db.close(); }
});

test('sessions keep original absolute expiry; outages preserve enrollment, confirmed loss requires enable again', async () => {
  const f = fixture();
  try {
    f.store.assign('discord', user, 'moderator', 'Historical staff', 'test');
    await f.auth.enroll(user, guild, true);
    const session = await login(f);
    const actor = await f.auth.authenticate(session.sessionToken);
    f.advance(10000);
    assert.equal(discordSessionSchema.parse(await f.auth.session(session.sessionToken)).expiresAt, session.expiresAt);
    f.permission('unavailable'); await assert.rejects(f.auth.authenticate(session.sessionToken));
    f.permission('allowed'); await f.auth.authenticate(session.sessionToken);
    f.permission('denied'); await assert.rejects(f.auth.authorize(actor, 'server:write'));
    f.permission('allowed'); await assert.rejects(login(f), (e: unknown) => e instanceof ServiceError && e.code === 'ENROLLMENT_REQUIRED');
    assert.equal(f.store.staff('discord', user)!.role, 'moderator');
    await f.auth.enroll(user, guild, true);
    const next = await login(f); f.advance(900000); await assert.rejects(f.auth.authenticate(next.sessionToken));
    assert.deepEqual(f.auth.logout(next.sessionToken), { schemaVersion: '1.0', revoked: true });
    assert.deepEqual(f.auth.logout(next.sessionToken), { schemaVersion: '1.0', revoked: true });
  } finally { f.db.close(); }
});

test('revocation during awaited checks cannot issue or authorize a session or resurrect enrollment', async () => {
  const f = fixture();
  try {
    await f.auth.enroll(user, guild, true);
    const session = await login(f), actor = await f.auth.authenticate(session.sessionToken);
    f.afterCheck(() => { f.auth.logout(session.sessionToken); });
    await assert.rejects(f.auth.authorize(actor, 'server:write'));
    f.afterCheck(() => { void f.auth.enroll(user, guild, false); });
    await assert.rejects(login(f));
    await assert.rejects(f.auth.enroll(user, guild, true));
    assert.equal(f.db.prepare('SELECT active FROM cs_dashboard_enrollments').get()!.active, 0);
  } finally { f.db.close(); }
});
