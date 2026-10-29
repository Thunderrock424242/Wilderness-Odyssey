import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleGateway } from '../server/gateway';
import { createCsrf } from '../server/csrf';
import type { GatewayEnv } from '../server/env';
import { artifact, campaign, sessionRecord, tester } from './fixtures/playtests';

const env: GatewayEnv = { ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'access', ALLOWED_HOSTS: 'site.example.com', ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUDIENCE: 'staff', KINETIC_ADMIN_ORIGIN: 'https://backend.example.com', KINETIC_ACCESS_CLIENT_ID: 'machine', KINETIC_ACCESS_CLIENT_SECRET: 'machine-private', CSRF_SECRET: 'test-signing-key-of-at-least-32-bytes' };
let jwt: string, jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' }] });
  jwt = await new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(env.ACCESS_TEAM_DOMAIN!).setAudience('staff').setSubject('owner').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
});
const profilePath = '/playtests/autumn/testers/tester-a';
const artifactPath = profilePath + '/sessions/session-a/artifacts/log-a';
async function request(path: string, method = 'GET', body?: unknown, override: Record<string, string> = {}) {
  const headers = new Headers({ 'Cf-Access-Jwt-Assertion': jwt, ...override });
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json'); headers.set('Origin', override.Origin ?? 'https://site.example.com'); headers.set('Idempotency-Key', override['Idempotency-Key'] ?? 'request-1234567890');
    headers.set('X-CSRF-Token', override['X-CSRF-Token'] ?? await createCsrf('owner', 'https://site.example.com', env.CSRF_SECRET!));
  }
  return new Request('https://site.example.com/api/admin/v1' + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
function upstream(value: unknown, role = 'administrator', capabilities = ['playtests:read', 'playtests:write']): typeof fetch {
  return async url => String(url).endsWith('/session') ? Response.json({ schemaVersion: '1.0', user: { id: 'owner', displayName: 'Owner', role }, capabilities }) : Response.json(value);
}
async function call(req: Request, fetcher: typeof fetch) { return handleGateway(req, env, { fetch: fetcher, jwks }); }
describe('private playtest gateway adapter', () => {
  it('accepts diagnostic IDs through the client limit of 100 characters', async () => {
    const id = 'c'.repeat(100);
    const response = await call(await request('/playtests/' + id), upstream({ schemaVersion: '1.0', campaign: { ...campaign, id }, testers: [], nextCursor: null }));
    expect(response.status).toBe(200);
  });
  it('preserves unknown upload counters instead of requiring fabricated zeros', async () => {
    const response = await call(await request(profilePath), upstream({ schemaVersion: '1.0', campaign, tester, sessions: [{ ...sessionRecord, uploadErrors: null }], nextCursor: null }));
    expect(response.status).toBe(200); expect((await response.json()).sessions[0].uploadErrors).toBeNull();
  });
  it('allows the valid campaign ID testers without confusing it with global history', async () => {
    const response = await call(await request('/playtests/testers'), upstream({ schemaVersion: '1.0', campaign: { ...campaign, id: 'testers' }, testers: [], nextCursor: null }));
    expect(response.status).toBe(200);
  });
  it('accepts collection identifiers through the client transport limit of 100 characters', async () => {
    const value = { schemaVersion: '1.0', campaigns: [{ ...campaign, collectionId: 'c'.repeat(100) }], nextCursor: null };
    expect((await call(await request('/playtests'), upstream(value))).status).toBe(200);
  });
  it('rejects a saved Spark claim when no committed recording summary exists', async () => {
    const response = await call(await request(profilePath), upstream({ schemaVersion: '1.0', campaign, tester, sessions: [{ ...sessionRecord, sparkStatus: 'saved' }], nextCursor: null }));
    expect(response.status).toBe(502);
  });
  it('requires staff permission and projects only validated private records', async () => {
    const value = { schemaVersion: '1.0', campaigns: [{ ...campaign, token: 'secret-do-not-project' }], nextCursor: null };
    const response = await call(await request('/playtests'), upstream(value));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(await response.text()).not.toContain('secret-do-not-project');
    expect((await call(new Request('https://site.example.com/api/admin/v1/playtests'), upstream(value))).status).toBe(401);
    expect((await call(await request('/playtests'), upstream(value, 'moderator'))).status).toBe(403);
    expect((await call(await request('/playtests'), upstream(value, 'administrator', []))).status).toBe(403);
  });
  it('preserves CSRF, origin, idempotency and revision checks before forwarding desired state', async () => {
    const body = { collect: false, revision: 'c1' };
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).endsWith('/session')) return upstream({})(url, init);
      expect(String(url)).toBe('https://backend.example.com/v1/admin/playtests/autumn/collection');
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('request-1234567890');
      expect(new Headers(init?.headers).get('CF-Access-Client-Secret')).toBe('machine-private');
      expect(JSON.parse(String(init?.body))).toEqual(body);
      return Response.json({ schemaVersion: '1.0', campaign: { ...campaign, collect: false, collectionId: null, revision: 'c2' } });
    };
    expect((await call(await request('/playtests/autumn/collection', 'PUT', body), fetcher)).status).toBe(200);
    const overrides: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { 'X-CSRF-Token': 'wrong' }, { 'Idempotency-Key': 'short' }];
    for (const override of overrides) expect((await call(await request('/playtests/autumn/collection', 'PUT', body, override), fetcher)).status).toBeGreaterThanOrEqual(400);
    expect((await call(await request('/playtests/autumn/collection', 'PUT', { collect: false }), fetcher)).status).toBe(400);
  });
  it('rejects cross-profile session and artifact responses and unredacted text', async () => {
    const history = { schemaVersion: '1.0', campaign, tester, sessions: [sessionRecord], nextCursor: null };
    expect((await call(await request(profilePath), upstream(history))).status).toBe(200);
    expect((await call(await request(profilePath), upstream({ ...history, sessions: [{ ...sessionRecord, testerId: 'tester-b' }] }))).status).toBe(502);
    for (const value of [{ ...artifact, testerId: 'tester-b' }, { ...artifact, redacted: false }, { ...artifact, contentType: 'text/html' }]) expect((await call(await request(artifactPath), upstream(value))).status).toBe(502);
  });
  it('downloads only bounded real artifacts with private headers and generated safe names', async () => {
    const log = await call(await request(artifactPath + '/download'), upstream(artifact));
    expect(log.status).toBe(200); expect(log.headers.get('Content-Type')).toBe('text/plain; charset=utf-8'); expect(log.headers.get('Content-Disposition')).toBe('attachment; filename="log-log-a.txt"'); expect(await log.text()).toBe(artifact.content);
    const spark = { ...artifact, kind: 'spark', redacted: false, contentType: 'application/x-spark-sampler', encoding: 'base64', content: 'AAECA/8=' };
    const download = await call(await request(artifactPath + '/download'), upstream(spark));
    expect(download.status).toBe(200); expect(download.headers.get('Content-Disposition')).toContain('.sparkprofile'); expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([0, 1, 2, 3, 255]);
    for (const value of [artifact, spark]) {
      const response = await call(await request(artifactPath + '/download'), upstream(value));
      expect(response.headers.get('Cache-Control')).toBe('no-store'); expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff'); expect(response.headers.get('Content-Security-Policy')).toContain('sandbox');
    }
    expect((await call(await request(artifactPath), upstream({ ...spark, content: 'not base64' }))).status).toBe(502);
    expect((await call(await request(artifactPath), upstream({ ...artifact, content: 'x'.repeat(256 * 1024 + 1) }))).status).toBeGreaterThanOrEqual(400);
  });
  it('does not expose upstream errors or follow artifact storage redirects', async () => {
    const fetcher: typeof fetch = async (url, init) => String(url).endsWith('/session') ? upstream({})(url, init) : new Response('private-stack-trace', { status: 302, headers: { Location: 'https://private-storage.example/secret' } });
    const response = await call(await request(artifactPath + '/download'), fetcher);
    expect(response.status).toBe(502); expect(await response.text()).not.toMatch(/private-stack|private-storage/);
  });
  it('keeps Discord staff credentials server-side and rechecks permission before releasing private bytes', async () => {
    const token = 's'.repeat(43);
    const discordEnv: GatewayEnv = { ...env, STAFF_AUTH_MODE: 'discord', DISCORD_REDIRECT_URI: 'https://site.example.com/api/auth/discord/callback', DISCORD_GUILD_ID: '123456789012345678' };
    let checks = 0;
    const fetcher: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('X-WO-Admin-Session')).toBe(token); expect(headers.get('CF-Access-Client-Secret')).toBe('machine-private');
      if (String(url).endsWith('/session')) {
        checks++;
        if (checks === 2) return Response.json({}, { status: 401 });
        return Response.json({ schemaVersion: '1.0', user: { id: '345678901234567890', displayName: 'Discord admin', role: 'administrator' }, capabilities: ['playtests:read'], guildId: discordEnv.DISCORD_GUILD_ID, expiresAt: new Date(Date.now() + 850000).toISOString() });
      }
      return Response.json(artifact);
    };
    const req = new Request('https://site.example.com/api/admin/v1' + artifactPath + '/download', { headers: { Cookie: '__Host-wo-admin-session=' + token, 'X-WO-Admin-Session': 'browser-forgery' } });
    const response = await handleGateway(req, discordEnv, { fetch: fetcher });
    expect(checks).toBe(2); expect(response.status).toBe(401); expect(await response.text()).not.toContain(artifact.content);
  });
});
