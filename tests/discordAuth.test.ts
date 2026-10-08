import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleGateway } from '../server/gateway';
import { onRequest } from '../functions/_middleware';
import type { GatewayEnv } from '../server/env';

const env: GatewayEnv = {
  ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'discord', ALLOWED_HOSTS: 'site.example.com',
  DISCORD_REDIRECT_URI: 'https://site.example.com/api/auth/discord/callback', DISCORD_GUILD_ID: '123456789012345678',
  KINETIC_ADMIN_ORIGIN: 'https://backend.example.com', KINETIC_ACCESS_CLIENT_ID: 'machine-id',
  KINETIC_ACCESS_CLIENT_SECRET: 'machine-secret', CSRF_SECRET: 'test-only-secret-with-at-least-32-bytes',
};
const flowToken = 'f'.repeat(43), sessionToken = 's'.repeat(43), state = 'n'.repeat(43);
const callbackPath = '/api/auth/discord/callback?code=discord-code&state=' + state;
const authorizationUrl = 'https://discord.com/oauth2/authorize?client_id=234567890123456789&response_type=code&scope=identify&redirect_uri=' + encodeURIComponent(env.DISCORD_REDIRECT_URI!) + '&state=' + state;
const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const backendSession = () => ({
  schemaVersion: '1.0', user: { id: '345678901234567890', displayName: 'Discord admin', role: 'administrator' },
  capabilities: ['status:read', 'server:write'], guildId: env.DISCORD_GUILD_ID, expiresAt: expiry(850),
});
function request(path: string, init: RequestInit = {}) { return new Request('https://site.example.com' + path, init); }
const cookie = (token = sessionToken) => ({ Cookie: '__Host-wo-admin-session=' + token });
afterEach(() => vi.unstubAllGlobals());

describe('Discord OAuth gateway', () => {
  it('starts login only at Discord and stores the browser binding in a secure cookie', async () => {
    const upstream = vi.fn<typeof fetch>(async (url, options) => {
      expect(String(url)).toBe('https://backend.example.com/v1/admin/auth/discord/start');
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({ redirectUri: env.DISCORD_REDIRECT_URI });
      const headers = new Headers(options?.headers);
      expect(headers.get('CF-Access-Client-Secret')).toBe('machine-secret');
      expect(headers.has('X-WO-User-Assertion')).toBe(false);
      return Response.json({ schemaVersion: '1.0', authorizationUrl, flowToken, expiresAt: expiry(300) });
    });
    const response = await handleGateway(request('/api/auth/discord/start'), env, { fetch: upstream });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(authorizationUrl);
    expect(response.headers.get('Set-Cookie')).toMatch(/__Host-wo-admin-flow=f+;.*Path=\/;.*HttpOnly;.*Secure;.*SameSite=Lax/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain(flowToken);
  });

  it.each([
    'https://evil.example/oauth2/authorize',
    authorizationUrl.replace('scope=identify', 'scope=identify%20email'),
    authorizationUrl + '&redirect_uri=https%3A%2F%2Fevil.example',
    authorizationUrl.replace(encodeURIComponent(env.DISCORD_REDIRECT_URI!), 'https%3A%2F%2Fevil.example'),
  ])('rejects an unsafe authorization URL from the backend: %s', async (unsafe) => {
    const response = await handleGateway(request('/api/auth/discord/start'), env, { fetch: async () => Response.json({ schemaVersion: '1.0', authorizationUrl: unsafe, flowToken, expiresAt: expiry(300) }) });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login/?error=service_unavailable');
    expect(response.headers.get('Set-Cookie') ?? '').not.toContain(flowToken);
  });

  it('exchanges the callback only with its browser binding and keeps credentials out of JSON', async () => {
    const upstream = vi.fn<typeof fetch>(async (url, options) => {
      expect(String(url)).toBe('https://backend.example.com/v1/admin/auth/discord/callback');
      expect(JSON.parse(String(options?.body))).toEqual({ code: 'discord-code', state, flowToken, redirectUri: env.DISCORD_REDIRECT_URI });
      return Response.json({ schemaVersion: '1.0', sessionToken, userId: '345678901234567890', guildId: env.DISCORD_GUILD_ID, expiresAt: expiry(900), privateNote: 'do not forward' });
    });
    const response = await handleGateway(request(callbackPath, { headers: { Cookie: '__Host-wo-admin-flow=' + flowToken } }), env, { fetch: upstream });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/admin/');
    expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-admin-session=' + sessionToken);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-admin-flow=;');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response.text()).not.toMatch(/ssss|privateNote|discord-code/);
  });

  it('clears a cancelled login attempt without exchanging a code', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleGateway(request('/api/auth/discord/callback?error=access_denied&state=' + state, { headers: { Cookie: '__Host-wo-admin-flow=' + flowToken } }), env, { fetch: upstream });
    expect(response.headers.get('Location')).toBe('/login/?error=cancelled');
    expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-admin-flow=;');
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    { path: callbackPath, headers: {} },
    { path: callbackPath + '&state=other', headers: { Cookie: '__Host-wo-admin-flow=' + flowToken } },
    { path: callbackPath, headers: { Cookie: '__Host-wo-admin-flow=' + flowToken + '; __Host-wo-admin-flow=' + flowToken } },
  ])('rejects a callback without a unique browser binding and query', async ({ path, headers }) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleGateway(request(path, { headers: new Headers(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) }), env, { fetch: upstream });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login/?error=login_expired');
    expect(upstream).not.toHaveBeenCalled();
    expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-admin-flow=;');
  });

  it('explains missing bot enrollment without exposing the backend response', async () => {
    const response = await handleGateway(request(callbackPath, { headers: { Cookie: '__Host-wo-admin-flow=' + flowToken } }), env, { fetch: async () => Response.json({ code: 'ENROLLMENT_REQUIRED', message: 'private backend detail' }, { status: 403 }) });
    expect(response.headers.get('Location')).toBe('/login/?error=enrollment_required');
    expect(await response.text()).not.toContain('private backend detail');
  });

  it('does not accept a session for a different guild or an excessive lifetime', async () => {
    for (const changes of [{ guildId: '999999999999999999' }, { expiresAt: expiry(3600) }]) {
      const response = await handleGateway(request(callbackPath, { headers: { Cookie: '__Host-wo-admin-flow=' + flowToken } }), env, { fetch: async () => Response.json({ schemaVersion: '1.0', sessionToken, userId: '345678901234567890', guildId: env.DISCORD_GUILD_ID, expiresAt: expiry(900), ...changes }) });
      expect(response.headers.get('Location')).toBe('/login/?error=service_unavailable');
      expect(response.headers.get('Set-Cookie')).not.toContain('__Host-wo-admin-session=' + sessionToken);
    }
  });
});

describe('Discord staff sessions', () => {
  it('accepts only the host cookie, uses the bot session identity and strips private fields', async () => {
    const upstream = vi.fn<typeof fetch>(async (_url, options) => {
      const headers = new Headers(options?.headers);
      expect(headers.get('X-WO-Admin-Session')).toBe(sessionToken);
      expect(headers.has('X-WO-User-Assertion')).toBe(false);
      return Response.json({ ...backendSession(), sessionToken, privateAddress: 'private-host' });
    });
    const response = await handleGateway(request('/api/admin/v1/session', { headers: { ...cookie(), 'X-WO-Admin-Session': 'forged-header', 'Cf-Access-Jwt-Assertion': 'forged-access' } }), env, { fetch: upstream });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: '345678901234567890', role: 'administrator' }, csrfToken: expect.any(String) });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('requires Discord sign-in even if a caller supplies an Access assertion or session header', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleGateway(request('/api/admin/v1/session', { headers: { 'Cf-Access-Jwt-Assertion': 'access', 'X-WO-Admin-Session': sessionToken } }), env, { fetch: upstream });
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    { configuration: { DISCORD_GUILD_ID: '' }, address: 'https://site.example.com', status: 503 },
    { configuration: { STAFF_AUTH_MODE: '' }, address: 'https://site.example.com', status: 503 },
    { configuration: {}, address: 'https://bypass.pages.dev', status: 403 },
    { configuration: {}, address: 'http://site.example.com', status: 403 },
  ])('denies missing Discord configuration and unapproved origins', async ({ configuration, address, status }) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleGateway(new Request(address + '/api/admin/v1/session', { headers: cookie() }), { ...env, ...configuration }, { fetch: upstream });
    expect(response.status).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not accept ambiguous session cookies', async () => {
    const response = await handleGateway(request('/api/admin/v1/session', { headers: { Cookie: '__Host-wo-admin-session=' + sessionToken + '; __Host-wo-admin-session=' + 'r'.repeat(43) } }), env, { fetch: vi.fn<typeof fetch>() });
    expect(response.status).toBe(401);
  });

  it.each([{ user: { ...backendSession().user, role: 'viewer' } }, { expiresAt: '2020-01-01T00:00:00Z' }, { guildId: '999999999999999999' }])('rejects an unauthorized or expired bot session', async (changes) => {
    const response = await handleGateway(request('/api/admin/v1/session', { headers: cookie() }), env, { fetch: async () => Response.json({ ...backendSession(), ...changes }) });
    expect([401, 403]).toContain(response.status);
  });

  it('binds CSRF to the specific session and denies a rotated cookie on logout', async () => {
    const upstream = vi.fn<typeof fetch>(async (url) => String(url).endsWith('/session') ? Response.json(backendSession()) : Response.json({ schemaVersion: '1.0', revoked: true }));
    const sessionResponse = await handleGateway(request('/api/admin/v1/session', { headers: cookie() }), env, { fetch: upstream });
    const { csrfToken } = await sessionResponse.json();
    const response = await handleGateway(request('/api/auth/logout', { method: 'POST', headers: { ...cookie('r'.repeat(43)), Origin: 'https://site.example.com', 'X-CSRF-Token': csrfToken } }), env, { fetch: upstream });
    expect(response.status).toBe(403);
  });

  it('revokes the bot session and clears its cookie on CSRF-protected logout', async () => {
    const upstream = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/session')) return Response.json(backendSession());
      expect(String(url)).toBe('https://backend.example.com/v1/admin/auth/logout');
      expect(new Headers(options?.headers).get('X-WO-Admin-Session')).toBe(sessionToken);
      return Response.json({ schemaVersion: '1.0', revoked: true });
    });
    const sessionResponse = await handleGateway(request('/api/admin/v1/session', { headers: cookie() }), env, { fetch: upstream });
    const { csrfToken } = await sessionResponse.json();
    const response = await handleGateway(request('/api/auth/logout', { method: 'POST', headers: { ...cookie(), Origin: 'https://site.example.com', 'X-CSRF-Token': csrfToken } }), env, { fetch: upstream });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schemaVersion: '1.0', revoked: true });
    expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-admin-session=;');
  });

  it('rejects cross-origin logout before calling the backend', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleGateway(request('/api/auth/logout', { method: 'POST', headers: { ...cookie(), Origin: 'https://evil.example' } }), env, { fetch: upstream });
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('clears the browser cookie but reports failed backend revocation honestly', async () => {
    const upstream = vi.fn<typeof fetch>(async url => String(url).endsWith('/session') ? Response.json(backendSession()) : new Response('private backend failure', { status: 503 }));
    const sessionResponse = await handleGateway(request('/api/admin/v1/session', { headers: cookie() }), env, { fetch: upstream });
    const { csrfToken } = await sessionResponse.json();
    const response = await handleGateway(request('/api/auth/logout', { method: 'POST', headers: { ...cookie(), Origin: 'https://site.example.com', 'X-CSRF-Token': csrfToken } }), env, { fetch: upstream });
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-admin-session=;');
    expect(response.headers.get('X-WO-Browser-Session-Ended')).toBe('true');
    expect(await response.text()).not.toContain('private backend failure');
  });

  it('clears the browser session when backend revocation reaches its timeout', async () => {
    const upstream: typeof fetch = async (url, options) => {
      if (String(url).endsWith('/session')) return Response.json(backendSession());
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      });
    };
    const sessionResponse = await handleGateway(request('/api/admin/v1/session', { headers: cookie() }), env, { fetch: upstream });
    const { csrfToken } = await sessionResponse.json();
    const response = await handleGateway(request('/api/auth/logout', { method: 'POST', headers: { ...cookie(), Origin: 'https://site.example.com', 'X-CSRF-Token': csrfToken } }), env, { fetch: upstream });
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-admin-session=;');
    expect(response.headers.get('X-WO-Browser-Session-Ended')).toBe('true');
  }, 10000);

  it('redirects unauthenticated staff navigation to the login page without serving staff HTML', async () => {
    const next = vi.fn(async () => new Response('private staff HTML'));
    const response = await onRequest({ request: request('/admin/models/'), env, next });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/login/');
    expect(next).not.toHaveBeenCalled();
  });

  it('denies alternate approved production hosts while preserving the canonical login origin', async () => {
    const configuration = { ...env, ALLOWED_HOSTS: 'site.example.com,project.pages.dev' };
    const next = vi.fn(async () => new Response('private staff HTML'));
    const canonical = await onRequest({ request: request('/admin/'), env: configuration, next });
    expect(canonical.status).toBe(303);
    expect(canonical.headers.get('Location')).toBe('/login/');
    for (const path of ['/admin/', '/api/admin/v1/session', '/api/auth/discord/start']) {
      const alternate = await onRequest({ request: new Request('https://project.pages.dev' + path), env: configuration, next });
      expect(alternate.status).toBe(403);
      expect(await alternate.json()).toMatchObject({ code: 'HOST_DENIED' });
      expect(alternate.headers.has('Location')).toBe(false);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('guards staff HTML using the bot session and never trusts the cookie alone', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ code: 'FORBIDDEN' }, { status: 403 }));
    const next = vi.fn(async () => new Response('private staff HTML'));
    const response = await onRequest({ request: request('/admin/', { headers: cookie() }), env, next });
    expect(response.headers.get('Location')).toBe('/login/?error=permission_denied');
    expect(next).not.toHaveBeenCalled();
  });

  it('serves authorized staff HTML only after backend verification with no-cache and security headers', async () => {
    vi.stubGlobal('fetch', async () => Response.json(backendSession()));
    const response = await onRequest({ request: request('/admin/', { headers: cookie() }), env, next: async () => new Response('authorized staff HTML') });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('authorized staff HTML');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('requires preview Access authentication at login and staff auth routes', async () => {
    const next = vi.fn(async () => new Response('login HTML'));
    for (const path of ['/login/', '/api/auth/discord/start', '/api/admin/v1/session']) {
      const response = await onRequest({ request: request(path), env: { ...env, ENVIRONMENT: 'preview', ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUDIENCE: 'preview-audience', PREVIEW_VERIFY_SERVICE_ID: 'preview-verifier' }, next });
      expect(response.status).toBe(401);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a signed preview verifier only on public pages, never login or staff routes', async () => {
    const issuer = 'https://discord-auth-preview-test.cloudflareaccess.com';
    const keys = await generateKeyPair('RS256');
    const jwt = await new SignJWT({ common_name: 'preview-verifier' }).setProtectedHeader({ alg: 'RS256', kid: 'preview-test' })
      .setIssuer(issuer).setAudience('preview-audience').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
    vi.stubGlobal('fetch', async (url: URL | RequestInfo) => {
      expect(String(url)).toBe(issuer + '/cdn-cgi/access/certs');
      return Response.json({ keys: [{ ...await exportJWK(keys.publicKey), alg: 'RS256', kid: 'preview-test' }] });
    });
    const previewEnv = { ...env, ENVIRONMENT: 'preview', ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUDIENCE: 'preview-audience', PREVIEW_VERIFY_SERVICE_ID: 'preview-verifier' };
    const next = vi.fn(async () => new Response('public preview HTML'));
    const signedRequest = (path: string) => request(path, { headers: { 'Cf-Access-Jwt-Assertion': jwt } });
    expect((await onRequest({ request: signedRequest('/'), env: previewEnv, next })).status).toBe(200);
    for (const path of ['/login/', '/api/auth/discord/start', '/api/admin/v1/session', '/admin/']) {
      expect((await onRequest({ request: signedRequest(path), env: previewEnv, next })).status).toBe(401);
    }
    expect(next).toHaveBeenCalledTimes(1);
  });
});
