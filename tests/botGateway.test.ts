import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleBotGateway, type BotGatewayEnv } from '../workers/bot-gateway/index';

const issuer = 'https://wilderness-odyssey.cloudflareaccess.com';
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  keys = await generateKeyPair('RS256');
  jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' }] });
});
const status = {
  schemaVersion: '1.0', observedAt: '2026-11-01T12:00:00Z', staleAfterSeconds: 120,
  minecraft: { state: 'unknown', players: null, tps: null, mspt: null, minecraftVersion: null, modpackVersion: null, loader: null },
  aether: { ollama: 'unknown', inference: 'unknown', requestsPaused: null, responseLatency: null },
  maintenance: { active: false, message: '', startsAt: null, endsAt: null, services: [] }, incidents: [],
};
function fixture() {
  const fetcher = vi.fn(async (_request: Request) => Response.json(status));
  const env: BotGatewayEnv = { BOT_API: { fetch: fetcher }, ENVIRONMENT: 'production', ACCESS_TEAM_DOMAIN: issuer, BACKEND_ACCESS_AUDIENCE: 'audience', GATEWAY_SERVICE_ID: 'pages.access' };
  return { env, fetcher };
}
async function request(path = '/v1/admin/session', options: { audience?: string; identity?: string; issuer?: string; expiry?: string; future?: boolean } = {}, init: RequestInit = {}) {
  const assertion = await new SignJWT({ common_name: options.identity ?? 'pages.access' }).setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(options.issuer ?? issuer).setAudience(options.audience ?? 'audience')
    .setIssuedAt(options.future ? Math.floor(Date.now() / 1000) + 600 : undefined).setExpirationTime(options.expiry ?? '5m').sign(keys.privateKey);
  const headers = new Headers(init.headers);
  headers.set('Cf-Access-Jwt-Assertion', assertion); headers.set('X-WO-Environment', 'production');
  return new Request('https://gateway.example' + path, { ...init, headers });
}
describe('bot gateway', () => {
  it('projects public status through a fixed VPC target without forwarding credentials', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(Response.json({ ...status, privateAddress: 'private' }));
    const response = await handleBotGateway(new Request('https://gateway.example/v1/public/status', { headers: { Cookie: 'secret', Authorization: 'secret' } }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(status);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=15, must-revalidate');
    const sent = fetcher.mock.calls[0]![0];
    expect(sent.url).toBe('http://127.0.0.1:25599/v1/public/status');
    expect([...sent.headers.keys()]).toEqual(['accept']);
    expect(sent.redirect).toBe('manual');
  });
  it.each(['/v1/service/authenticate', '/metrics', '/v1/admin/ollama/pull', '/v1/admin/%73ession', '/v1/admin/session/', '//evil.example/v1/admin/session'])('denies unapproved route %s', async path => {
    const { env, fetcher } = fixture();
    expect((await handleBotGateway(await request(path), env, { jwks })).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ audience: 'other' }, { identity: 'other' }, { issuer: 'https://other.cloudflareaccess.com' }, { expiry: '-1m' }, { future: true }])('rejects invalid identity %j', async options => {
    const { env, fetcher } = fixture();
    expect((await handleBotGateway(await request(undefined, options), env, { jwks })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('denies missing or forged signatures and mismatched environments', async () => {
    const { env, fetcher } = fixture();
    const missing = new Request('https://gateway.example/v1/admin/session');
    expect((await handleBotGateway(missing, env, { jwks })).status).toBe(401);
    const forged = await request();
    const parts = forged.headers.get('Cf-Access-Jwt-Assertion')!.split('.'); parts[2] = 'A'.repeat(parts[2]!.length);
    forged.headers.set('Cf-Access-Jwt-Assertion', parts.join('.'));
    expect((await handleBotGateway(forged, env, { jwks })).status).toBe(401);
    const wrongEnvironment = await request(); wrongEnvironment.headers.set('X-WO-Environment', 'preview');
    expect((await handleBotGateway(wrongEnvironment, env, { jwks })).status).toBe(401);
    expect((await handleBotGateway(await request(), { ...env, GATEWAY_SERVICE_ID: '' }, { jwks })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('allows bodyless authoring reads and keeps private responses uncached', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(Response.json({ schemaVersion: '1.0', records: [] }));
    const response = await handleBotGateway(await request('/v1/admin/content/transmissions'), env, { jwks });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetcher.mock.calls[0]![0].body).toBe(null);
  });
  it('forwards a verified assertion/session but strips machine secrets and cookies', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(Response.json({ schemaVersion: '1.0', revoked: true }));
    const req = await request('/v1/admin/auth/logout', {}, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'CF-Access-Client-Secret': 'secret', Cookie: 'secret', 'X-WO-Admin-Session': 'a'.repeat(43) } });
    expect((await handleBotGateway(req, env, { jwks })).status).toBe(200);
    const sent = fetcher.mock.calls[0]![0];
    expect(sent.headers.get('Cf-Access-Jwt-Assertion')).toBe(req.headers.get('Cf-Access-Jwt-Assertion'));
    expect(sent.headers.get('X-WO-Admin-Session')).toBe('a'.repeat(43));
    expect(sent.headers.has('CF-Access-Client-Secret')).toBe(false);
    expect(sent.headers.has('Cookie')).toBe(false);
  });
  it('rejects invalid queries and oversized input before contacting the bot', async () => {
    const { env, fetcher } = fixture();
    expect((await handleBotGateway(await request('/v1/admin/session?url=https://evil.example'), env, { jwks })).status).toBe(400);
    expect((await handleBotGateway(await request('/v1/admin/auth/logout', {}, { method: 'POST', body: ' '.repeat(17000), headers: { 'Content-Type': 'application/json' } }), env, { jwks })).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([302, 500, 401, 403, 429])('sanitizes upstream status %s and response headers', async code => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(new Response('private error', { status: code, headers: { Location: 'https://private.example', 'Set-Cookie': 'secret=value' } }));
    const response = await handleBotGateway(await request(), env, { jwks });
    expect(response.status).toBe([401, 403, 429].includes(code) ? code : 502);
    expect(await response.text()).not.toMatch(/private|secret/);
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Location')).toBe(false);
  });
  it('rejects malformed and oversized status responses', async () => {
    const { env, fetcher } = fixture();
    for (const body of [{ invented: true }, { text: 'x'.repeat(66000) }]) {
      fetcher.mockResolvedValue(Response.json(body));
      expect((await handleBotGateway(new Request('https://gateway.example/v1/public/status'), env)).status).toBe(502);
    }
  });
  it('cancels a response stream that never finishes', async () => {
    const { env, fetcher } = fixture(); let cancelled = false;
    fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }));
    vi.useFakeTimers();
    try {
      const pending = handleBotGateway(new Request('https://gateway.example/v1/public/status'), env);
      await vi.advanceTimersByTimeAsync(16000);
      expect((await pending).status).toBe(503);
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
