import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleBotGateway, type BotGatewayEnv } from '../workers/bot-gateway/index';

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
const issuer = 'https://wilderness-odyssey.cloudflareaccess.com';
const status = {
  schemaVersion: '1.0', observedAt: '2026-11-01T12:00:00Z', staleAfterSeconds: 120,
  minecraft: { state: 'unknown', players: null, tps: null, mspt: null, minecraftVersion: null, modpackVersion: null, loader: null },
  aether: { ollama: 'unknown', inference: 'unknown', requestsPaused: null, responseLatency: null },
  maintenance: { active: false, message: '', startsAt: null, endsAt: null, services: [] }, incidents: [],
};
beforeAll(async () => {
  keys = await generateKeyPair('RS256');
  jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: 'gateway-test', alg: 'RS256' }] });
});
async function token(overrides: { issuer?: string; audience?: string; identity?: string; expiry?: string; future?: boolean } = {}) {
  return new SignJWT({ common_name: overrides.identity ?? 'pages-production.access' })
    .setProtectedHeader({ alg: 'RS256', kid: 'gateway-test' }).setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? 'bot-audience').setIssuedAt(overrides.future ? Math.floor(Date.now() / 1000) + 600 : undefined)
    .setExpirationTime(overrides.expiry ?? '5m').sign(keys.privateKey);
}
function fixture() {
  const fetcher = vi.fn(async (_request: Request) => Response.json(status));
  const env: BotGatewayEnv = {
    BOT_API: { fetch: fetcher }, ENVIRONMENT: 'production', ACCESS_TEAM_DOMAIN: issuer,
    BACKEND_ACCESS_AUDIENCE: 'bot-audience', GATEWAY_SERVICE_ID: 'pages-production.access',
  };
  return { env, fetcher };
}
async function adminRequest(path = '/v1/admin/session', init: RequestInit = {}, assertion?: string) {
  const headers = new Headers(init.headers);
  headers.set('Cf-Access-Jwt-Assertion', assertion ?? await token());
  headers.set('X-WO-Environment', 'production');
  return new Request('https://gateway.example.com' + path, { ...init, headers });
}

describe('private bot gateway', () => {
  it('projects anonymous status and forwards no caller headers or secrets', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(Response.json({ ...status, internalAddress: 'private' }));
    const response = await handleBotGateway(new Request('https://gateway.example.com/v1/public/status', { headers: { Cookie: 'secret', Authorization: 'secret', 'CF-Access-Client-Secret': 'secret' } }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(status);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=15, must-revalidate');
    const sent = fetcher.mock.calls[0]![0];
    expect(sent.url).toBe('http://127.0.0.1:25599/v1/public/status');
    expect([...sent.headers.keys()]).toEqual(['accept']);
    expect(sent.redirect).toBe('manual');
  });

  it.each(['/v1/service/authenticate', '/v1/admin/ollama/pull', '/metrics', '/api/playtest/v1/enroll', '/v1/admin/%73ession', '/v1/admin/session/', '//evil.example/v1/admin/session'])('denies unapproved path %s', async path => {
    const { env, fetcher } = fixture();
    expect((await handleBotGateway(await adminRequest(path), env, { jwks })).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['POST', 'HEAD', 'OPTIONS'])('denies %s on public status', async method => {
    const { env, fetcher } = fixture();
    expect((await handleBotGateway(new Request('https://gateway.example.com/v1/public/status', { method }), env)).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('denies missing authentication and incomplete setup without touching VPC', async () => {
    const { env, fetcher } = fixture();
    expect((await handleBotGateway(new Request('https://gateway.example.com/v1/admin/session'), env, { jwks })).status).toBe(401);
    expect((await handleBotGateway(await adminRequest(), { ...env, BACKEND_ACCESS_AUDIENCE: '' }, { jwks })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([{ issuer: 'https://other.cloudflareaccess.com' }, { audience: 'other' }, { identity: 'other' }, { expiry: '-1m' }, { future: true }])('rejects mismatched or expired machine identity %j', async overrides => {
    const { env, fetcher } = fixture();
    expect((await handleBotGateway(await adminRequest(undefined, {}, await token(overrides)), env, { jwks })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature and a different environment', async () => {
    const { env, fetcher } = fixture();
    const valid = await token();
    const parts = valid.split('.'); parts[2] = 'A'.repeat(parts[2]!.length);
    expect((await handleBotGateway(await adminRequest(undefined, {}, parts.join('.')), env, { jwks })).status).toBe(401);
    const req = await adminRequest(); req.headers.set('X-WO-Environment', 'preview');
    expect((await handleBotGateway(req, env, { jwks })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards only approved admin headers and preserves the verified assertion', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(Response.json({ schemaVersion: '1.0', revoked: true }));
    const request = await adminRequest('/v1/admin/auth/logout', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Cookie: 'private', Authorization: 'private', 'CF-Access-Client-Id': 'private', 'CF-Access-Client-Secret': 'private', 'X-WO-Admin-Session': 'a'.repeat(43) } });
    const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
    const response = await handleBotGateway(request, env, { jwks });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const sent = fetcher.mock.calls[0]![0];
    expect(sent.headers.get('Cf-Access-Jwt-Assertion')).toBe(assertion);
    expect(sent.headers.get('X-WO-Admin-Session')).toBe('a'.repeat(43));
    expect(sent.headers.has('Cookie')).toBe(false);
    expect(sent.headers.has('Authorization')).toBe(false);
    expect(sent.headers.has('CF-Access-Client-Secret')).toBe(false);
    expect(sent.headers.has('CF-Access-Client-Id')).toBe(false);
    expect(await sent.text()).toBe('{}');
  });

  it('validates query and mutation input before reaching the backend', async () => {
    const { env, fetcher } = fixture();
    for (const path of ['/v1/public/status?destination=https://evil.example', '/v1/admin/session?x=1', '/v1/admin/players?q=aa&q=bb']) {
      expect((await handleBotGateway(await adminRequest(path), env, { jwks })).status).toBe(400);
    }
    expect((await handleBotGateway(await adminRequest('/v1/admin/maintenance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"command":"shell"}' }), env, { jwks })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces actual streamed body limits without trusting Content-Length', async () => {
    const { env, fetcher } = fixture();
    const response = await handleBotGateway(await adminRequest('/v1/admin/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(17000) }), env, { jwks });
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([302, 500, 401, 403, 429])('sanitizes backend status %s and never copies headers', async code => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(new Response('private failure and secrets', { status: code, headers: { Location: 'https://private.example', 'Set-Cookie': 'secret=value' } }));
    const response = await handleBotGateway(await adminRequest(), env, { jwks });
    expect(response.status).toBe([401, 403, 429].includes(code) ? code : 502);
    expect(await response.text()).not.toMatch(/private|secret/);
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Location')).toBe(false);
  });

  it('rejects malformed status, oversized responses and private network errors safely', async () => {
    const { env, fetcher } = fixture();
    for (const value of [{ invented: true }, { content: 'x'.repeat(66000) }]) {
      fetcher.mockResolvedValue(Response.json(value));
      const response = await handleBotGateway(new Request('https://gateway.example.com/v1/public/status'), env);
      expect(response.status).toBe(502);
    }
    fetcher.mockRejectedValue(new Error('private endpoint and credential'));
    const response = await handleBotGateway(new Request('https://gateway.example.com/v1/public/status'), env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private|credential/);
  });

  it('aborts a backend body that never finishes', async () => {
    const { env, fetcher } = fixture();
    let cancelled = false;
    fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }));
    vi.useFakeTimers();
    try {
      const pending = handleBotGateway(new Request('https://gateway.example.com/v1/public/status'), env);
      await vi.advanceTimersByTimeAsync(16000);
      expect((await pending).status).toBe(503);
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('supports bounded private image uploads and downloads without forwarding response cookies', async () => {
    const { env, fetcher } = fixture();
    const image = { id: 'image-1', src: '/images/transmissions/test/image.png', previewUrl: '/api/admin/v1/content/media/image-1', fileName: 'image.png', mimeType: 'image/png', kind: 'image' };
    fetcher.mockResolvedValue(Response.json(image));
    const response = await handleBotGateway(await adminRequest('/v1/admin/content/media', {
      method: 'POST', body: new Uint8Array([137, 80, 78, 71]), headers: {
        'Content-Type': 'image/png', 'X-WO-Media': JSON.stringify({ slug: 'test', purpose: 'body', fileName: 'image.png', mimeType: 'image/png' }),
        'Idempotency-Key': 'upload-request-123456789',
      },
    }), env, { jwks });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(image);
    expect(fetcher.mock.calls[0]![0].headers.get('X-WO-Media')).toContain('image.png');
    fetcher.mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png', 'Set-Cookie': 'private=value' } }));
    const download = await handleBotGateway(await adminRequest('/v1/admin/content/media/image-1'), env, { jwks });
    expect(download.status).toBe(200);
    expect(download.headers.get('Cache-Control')).toBe('no-store');
    expect(download.headers.has('Set-Cookie')).toBe(false);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('denies dangerous media types, encoded bodies, and unexpected image metadata', async () => {
    const { env, fetcher } = fixture();
    const invalidHeaders: Record<string, string>[] = [
      { 'Content-Type': 'image/svg+xml', 'X-WO-Media': '{}' },
      { 'Content-Type': 'image/png', 'X-WO-Media': '{"url":"https://evil.example"}' },
      { 'Content-Type': 'image/png', 'Content-Encoding': 'gzip' },
    ];
    for (const headers of invalidHeaders) {
      const response = await handleBotGateway(await adminRequest('/v1/admin/content/media', { method: 'POST', body: 'image', headers }), env, { jwks });
      expect([400, 415]).toContain(response.status);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns an enrollment instruction code without exposing backend diagnostics', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(Response.json({ error: { code: 'ENROLLMENT_REQUIRED', message: 'private diagnostic' } }, { status: 403 }));
    const response = await handleBotGateway(await adminRequest('/v1/admin/auth/discord/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirectUri: 'https://wilderness-odyssey.pages.dev/api/auth/discord/callback', code: 'code', state: 'a'.repeat(43), flowToken: 'b'.repeat(43) }) }), env, { jwks });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'ENROLLMENT_REQUIRED' });
  });

  it('allows bodyless authoring reads through the shared route contract', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockResolvedValue(Response.json({ schemaVersion: '1.0', records: [] }));
    const response = await handleBotGateway(await adminRequest('/v1/admin/content/transmissions'), env, { jwks });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schemaVersion: '1.0', records: [] });
    expect(fetcher.mock.calls[0]![0].body).toBe(null);
    for (const path of ['/v1/admin/configuration', '/v1/admin/content/pages/site', '/v1/admin/content/publications/publication-1']) {
      fetcher.mockClear();
      await handleBotGateway(await adminRequest(path), env, { jwks });
      expect(fetcher).toHaveBeenCalledOnce();
      expect(fetcher.mock.calls[0]![0].body).toBe(null);
    }
  });

  it('aborts a stalled upstream fetch without retrying', async () => {
    const { env, fetcher } = fixture();
    fetcher.mockImplementation(request => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(new Error('private timeout diagnostic')), { once: true });
    }));
    vi.useFakeTimers();
    try {
      const pending = handleBotGateway(new Request('https://gateway.example.com/v1/public/status'), env);
      await vi.advanceTimersByTimeAsync(16000);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private');
      expect(fetcher).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
