import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyAccess } from '../server/access';
import { handleGateway } from '../server/gateway';
import { createCsrf, verifyCsrf } from '../server/csrf';
import { publicStatusSchema } from '../contracts/v1/status';
import type { GatewayEnv } from '../server/env';

const env: GatewayEnv = {
  ENVIRONMENT: 'production', ALLOWED_HOSTS: 'site.example.com', ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUDIENCE: 'production-audience',
  KINETIC_ADMIN_ORIGIN: 'https://backend.example.com', PUBLIC_STATUS_URL: 'https://status.example.com/v1/status',
  KINETIC_ACCESS_CLIENT_ID: 'machine-id', KINETIC_ACCESS_CLIENT_SECRET: 'machine-secret', CSRF_SECRET: 'test-only-secret-with-at-least-32-bytes',
};
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  keys = await generateKeyPair('RS256');
  jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' }] });
});
async function token(audience = 'production-audience', expires = '5m', subject = 'staff-1') {
  return new SignJWT({ email: 'staff@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(env.ACCESS_TEAM_DOMAIN!).setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime(expires).sign(keys.privateKey);
}
async function request(path: string, init: RequestInit = {}, jwt?: string) {
  return new Request(`https://site.example.com${path}`, { ...init, headers: { 'Cf-Access-Jwt-Assertion': jwt ?? await token(), ...Object.fromEntries(new Headers(init.headers)) } });
}
const session = (role = 'administrator', capabilities = ['status:read', 'server:write']) => ({ schemaVersion: '1.0', user: { id: 'staff-1', displayName: 'Staff', role }, capabilities });
const deps = (upstream: typeof fetch) => ({ fetch: upstream, jwks });

describe('Access identity', () => {
  it('verifies a signed identity for the exact application', async () => {
    expect((await verifyAccess(await request('/admin/'), env, jwks)).sub).toBe('staff-1');
  });
  it('rejects a preview token at the production application', async () => {
    await expect(verifyAccess(await request('/admin/', {}, await token('preview-audience')), env, jwks)).rejects.toThrow();
  });
  it('rejects expired and missing tokens', async () => {
    await expect(verifyAccess(await request('/admin/', {}, await token('production-audience', '-1m')), env, jwks)).rejects.toThrow();
    await expect(verifyAccess(new Request('https://site.example.com/admin/'), env, jwks)).rejects.toThrow();
  });
  it('denies unknown hosts and incomplete configuration', async () => {
    await expect(verifyAccess(new Request('https://bypass.pages.dev/admin/', { headers: { 'Cf-Access-Jwt-Assertion': await token() } }), env, jwks)).rejects.toThrow();
    await expect(verifyAccess(await request('/admin/'), { ...env, ACCESS_AUDIENCE: '' }, jwks)).rejects.toThrow();
  });
});

describe('CSRF tokens', () => {
  it('binds tokens to the staff identity and origin', async () => {
    const csrf = await createCsrf('staff-1', 'https://site.example.com', env.CSRF_SECRET!);
    await expect(verifyCsrf(csrf, 'staff-1', 'https://site.example.com', env.CSRF_SECRET!)).resolves.toBeUndefined();
    await expect(verifyCsrf(csrf, 'staff-2', 'https://site.example.com', env.CSRF_SECRET!)).rejects.toThrow();
    await expect(verifyCsrf(csrf, 'staff-1', 'https://preview.example.com', env.CSRF_SECRET!)).rejects.toThrow();
  });
});

describe('administration gateway', () => {
  it('does not contact an upstream for unauthenticated requests', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleGateway(new Request('https://site.example.com/api/admin/v1/session'), env, deps(upstream));
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rejects an arbitrary command route', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleGateway(await request('/api/admin/v1/ollama/pull', { method: 'POST' }), env, deps(upstream));
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('keeps the upstream identity and credentials out of session responses', async () => {
    const upstream = vi.fn<typeof fetch>(async (_url, options) => {
      expect(new Headers(options?.headers).get('CF-Access-Client-Secret')).toBe('machine-secret');
      expect(new Headers(options?.headers).get('X-WO-User-Assertion')).toBeTruthy();
      return Response.json({ ...session(), backendAddress: 'private-host' });
    });
    const response = await handleGateway(await request('/api/admin/v1/session'), env, deps(upstream));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.csrfToken).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/machine-secret|private-host/);
  });
  it('denies viewer writes even if the backend accidentally returns a write capability', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json(session('viewer')));
    const response = await handleGateway(await request('/api/admin/v1/maintenance', { method: 'PUT' }), env, deps(upstream));
    expect(response.status).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('rejects missing CSRF before forwarding a mutation', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json(session()));
    const response = await handleGateway(await request('/api/admin/v1/maintenance', { method: 'PUT', headers: { Origin: 'https://site.example.com', 'Content-Type': 'application/json' }, body: '{}' }), env, deps(upstream));
    expect(response.status).toBe(403);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('does not pass upstream errors, HTML login redirects, or cookies through to browsers', async () => {
    const upstream = vi.fn<typeof fetch>(async () => new Response('private failure', { status: 302, headers: { Location: 'https://private.example.com/login', 'Set-Cookie': 'secret=value' } }));
    const response = await handleGateway(await request('/api/admin/v1/session'), env, deps(upstream));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/private|secret=value/);
    expect(response.headers.has('Set-Cookie')).toBe(false);
  });
  it('fails closed without backend configuration', async () => {
    const response = await handleGateway(await request('/api/admin/v1/session'), { ...env, KINETIC_ADMIN_ORIGIN: '' }, deps(vi.fn<typeof fetch>()));
    expect(response.status).toBe(503);
  });
});

describe('public gateway', () => {
  it('returns unavailable rather than invented measurements when disconnected', async () => {
    const response = await handleGateway(new Request('https://site.example.com/api/public/v1/status'), {}, deps(vi.fn<typeof fetch>()));
    expect(response.status).toBe(503);
    expect(publicStatusSchema.safeParse(await response.json()).success).toBe(false);
  });
});

describe('mutation validation and forwarding', () => {
  const path = '/api/admin/v1/players/b3b9e793-7846-4670-9571-d321a0913843/warnings';
  async function mutation(body: unknown) {
    return request(path, { method: 'POST', headers: { Origin: 'https://site.example.com', 'Content-Type': 'application/json', 'Idempotency-Key': 'test-request-123456789', 'X-CSRF-Token': await createCsrf('staff-1', 'https://site.example.com', env.CSRF_SECRET!), 'X-WO-User-Assertion': 'forged-browser-header' }, body: JSON.stringify(body) });
  }
  it('forwards an authorized warning with its verified actor and idempotency key', async () => {
    const upstream = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).endsWith('/session')) return Response.json(session('moderator', ['status:read', 'players:write']));
      const headers = new Headers(options?.headers);
      expect(headers.get('Idempotency-Key')).toBe('test-request-123456789');
      expect(headers.get('X-WO-User-Assertion')).not.toBe('forged-browser-header');
      expect(JSON.parse(String(options?.body))).toEqual({ reason: 'Repeated documented rule violation.' });
      return Response.json({ schemaVersion: '1.0', operation: { id: 'op-1', kind: 'warning', state: 'succeeded', summary: 'Warning recorded.', requestedAt: '2026-09-22T12:00:00Z', updatedAt: '2026-09-22T12:00:00Z', privateNote: 'do not forward' } });
    });
    const response = await handleGateway(await mutation({ reason: 'Repeated documented rule violation.' }), env, deps(upstream));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('privateNote');
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('rejects extra command fields instead of forwarding them', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json(session('moderator', ['players:write'])));
    const response = await handleGateway(await mutation({ reason: 'A documented reason.', command: 'unrestricted' }), env, deps(upstream));
    expect(response.status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized bodies before mutation forwarding', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json(session('moderator', ['players:write'])));
    const response = await handleGateway(await mutation({ reason: 'x'.repeat(20000) }), env, deps(upstream));
    expect(response.status).toBe(413);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('rejects an incorrectly linked staff subject', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ ...session(), user: { id: 'another-person', displayName: 'Other', role: 'administrator' } }));
    const response = await handleGateway(await request('/api/admin/v1/session'), env, deps(upstream));
    expect(response.status).toBe(403);
  });
  it('does not reveal upstream network exceptions', async () => {
    const upstream = vi.fn<typeof fetch>(async () => { throw new Error('private upstream address and token'); });
    const response = await handleGateway(await request('/api/admin/v1/session'), env, deps(upstream));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/private|token/);
  });
});

describe('preview verification identity', () => {
  it('allows only the configured service for public preview checks, never staff access', async () => {
    const serviceToken = await new SignJWT({ common_name: 'preview-verifier' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(env.ACCESS_TEAM_DOMAIN!).setAudience('preview-audience').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
    const previewEnv = { ...env, ENVIRONMENT: 'preview', ACCESS_AUDIENCE: 'preview-audience', PREVIEW_VERIFY_SERVICE_ID: 'preview-verifier' };
    const req = await request('/revision.json', {}, serviceToken);
    expect((await verifyAccess(req, previewEnv, jwks, true)).sub).toBe('service:preview-verifier');
    await expect(verifyAccess(req, previewEnv, jwks)).rejects.toThrow();
    await expect(verifyAccess(req, { ...previewEnv, PREVIEW_VERIFY_SERVICE_ID: 'other-service' }, jwks, true)).rejects.toThrow();
  });
});
