import { expect, it } from 'vitest';
import { handleGateway } from '../server/gateway';
import type { GatewayEnv } from '../server/env';
import { selectRoute } from '../workers/bot-gateway/routes';

const env: GatewayEnv = { ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'discord', ALLOWED_HOSTS: 'site.example', DISCORD_REDIRECT_URI: 'https://site.example/api/auth/discord/callback', DISCORD_GUILD_ID: '123456789012345678', KINETIC_ADMIN_ORIGIN: 'https://bot.example', KINETIC_ACCESS_CLIENT_ID: 'machine', KINETIC_ACCESS_CLIENT_SECRET: 'test-secret', CSRF_SECRET: 'test-secret-at-least-thirty-two-bytes' };
it('the intermediate bot gateway permits only validated refresh and forget payloads', () => {
  for (const path of ['/auth/discord/refresh', '/auth/discord/forget', '/participant/refresh', '/participant/forget']) {
    const route = selectRoute('POST', '/v1/admin' + path);
    expect(route).toBeDefined();
    expect(route?.input?.safeParse({ rememberToken: 'r'.repeat(43) }).success).toBe(true);
    expect(route?.input?.safeParse({ rememberToken: 'bad', role: 'admin' }).success).toBe(false);
    expect(selectRoute('GET', '/v1/admin' + path)).toBeUndefined();
  }
});
it('renewal requires same-origin intent and never returns browser-visible credentials', async () => {
  const upstream: typeof fetch = async () => Response.json({ schemaVersion: '1.0', sessionToken: 's'.repeat(43), rememberToken: 'n'.repeat(43), userId: '234567890123456789', guildId: env.DISCORD_GUILD_ID, expiresAt: new Date(Date.now() + 850000).toISOString(), rememberExpiresAt: new Date(Date.now() + 600000000).toISOString() });
  const make = (origin: string) => new Request('https://site.example/api/auth/discord/refresh', { method: 'POST', headers: { Origin: origin, 'X-WO-Auth-Intent': 'renew', Cookie: '__Host-wo-admin-remember=' + 'r'.repeat(43) } });
  expect((await handleGateway(make('https://evil.example'), env, { fetch: upstream })).status).toBe(403);
  const result = await handleGateway(make('https://site.example'), env, { fetch: upstream });
  expect(result.status).toBe(200);
  const cookies = result.headers.get('Set-Cookie');
  expect(cookies).toContain('__Host-wo-admin-remember=');
  expect(cookies).toContain('HttpOnly; Secure; SameSite=Lax');
  expect(await result.json()).toEqual({ schemaVersion: '1.0', renewed: true });
});
it('concurrent renewal conflict does not clear the winning cookies', async () => {
  const request = new Request('https://site.example/api/participant/refresh', { method: 'POST', headers: { Origin: 'https://site.example', 'X-WO-Auth-Intent': 'renew', Cookie: '__Host-wo-participant-remember=' + 'r'.repeat(43) } });
  const result = await handleGateway(request, env, { fetch: async () => Response.json({ error: { code: 'REMEMBER_ROTATED', message: 'Rotated' } }, { status: 409 }) });
  expect(result.status).toBe(409);
  expect(result.headers.has('Set-Cookie')).toBe(false);
});

it('logout revokes both credentials when cookies are out of sync', async () => {
  const calls: string[] = [];
  const request = new Request('https://site.example/api/auth/logout', { method: 'POST', headers: { Origin: 'https://site.example', 'X-WO-Auth-Intent': 'renew', Cookie: '__Host-wo-admin-remember=' + 'r'.repeat(43) + '; __Host-wo-admin-session=' + 's'.repeat(43) } });
  const result = await handleGateway(request, env, { fetch: async input => { calls.push(String(input)); return Response.json({ schemaVersion: '1.0', revoked: true }); } });
  expect(result.status).toBe(200);
  expect(calls.some(path => path.endsWith('/forget'))).toBe(true);
  expect(calls.some(path => path.endsWith('/auth/logout'))).toBe(true);
});

it('failed logout clears this browser but does not claim server revocation on retry without credentials', async () => {
  const make = (cookie: string) => new Request('https://site.example/api/participant/logout', { method: 'POST', headers: { Origin: 'https://site.example', 'X-WO-Auth-Intent': 'renew', Cookie: cookie } });
  const upstream: typeof fetch = async () => Response.json({}, { status: 503 });
  const result = await handleGateway(make('__Host-wo-participant-remember=' + 'r'.repeat(43)), env, { fetch: upstream });
  expect(result.status).toBe(503);
  expect(result.headers.get('Set-Cookie')).toContain('Max-Age=0');
  expect(result.headers.get('X-WO-Browser-Session-Ended')).toBe('true');
  const retry = await handleGateway(make(''), env, { fetch: upstream });
  expect(retry.status).toBe(401);
  expect(await retry.json()).toMatchObject({ code: 'REVOCATION_UNCONFIRMED' });
});

it('participant renewal restores the existing admin remember credential without minting participant membership', async () => {
  const calls: string[] = [];
  const request = new Request('https://site.example/api/participant/refresh', { method: 'POST', headers: { Origin: 'https://site.example', 'X-WO-Auth-Intent': 'renew', Cookie: '__Host-wo-admin-remember=' + 'r'.repeat(43) } });
  const result = await handleGateway(request, env, { fetch: async input => {
    calls.push(String(input));
    return Response.json({ schemaVersion: '1.0', sessionToken: 's'.repeat(43), rememberToken: 'n'.repeat(43), userId: '234567890123456789', guildId: env.DISCORD_GUILD_ID, expiresAt: new Date(Date.now() + 850000).toISOString(), rememberExpiresAt: new Date(Date.now() + 600000000).toISOString() });
  } });
  expect(result.status).toBe(200);
  expect(calls).toEqual(['https://bot.example/v1/admin/auth/discord/refresh']);
  expect(result.headers.get('Set-Cookie')).toContain('__Host-wo-admin-session=');
  expect(result.headers.get('Set-Cookie')).not.toContain('__Host-wo-participant-session=');
});

it('shared admin sign-out revokes both remembered and active admin credentials', async () => {
  const calls: string[] = [];
  const request = new Request('https://site.example/api/auth/logout', { method: 'POST', headers: { Origin: 'https://site.example', 'X-WO-Auth-Intent': 'renew', Cookie: '__Host-wo-admin-remember=' + 'r'.repeat(43) + '; __Host-wo-admin-session=' + 's'.repeat(43) + '; __Host-wo-participant-session=' + 'p'.repeat(43) } });
  const result = await handleGateway(request, env, { fetch: async (input, init) => {
    calls.push(String(input));
    if (String(input).endsWith('/logout')) expect(new Headers(init?.headers).get('X-WO-Admin-Session')).toBe('s'.repeat(43));
    return Response.json({ schemaVersion: '1.0', revoked: true });
  } });
  expect(result.status).toBe(200);
  expect(calls.sort()).toEqual(['https://bot.example/v1/admin/auth/discord/forget', 'https://bot.example/v1/admin/auth/logout']);
  expect(result.headers.get('Set-Cookie')).toContain('__Host-wo-admin-session=;');
  expect(result.headers.get('Set-Cookie')).toContain('__Host-wo-admin-remember=;');
  expect(result.headers.get('Set-Cookie')).not.toContain('__Host-wo-participant-session=');
});
