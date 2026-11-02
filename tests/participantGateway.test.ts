import { describe, expect, it, vi } from 'vitest';
import { handleGateway } from '../server/gateway';
import type { GatewayEnv } from '../server/env';

const env: GatewayEnv = { ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'discord', ALLOWED_HOSTS: 'site.example', DISCORD_REDIRECT_URI: 'https://site.example/api/auth/discord/callback', DISCORD_GUILD_ID: '123456789012345678', KINETIC_ADMIN_ORIGIN: 'https://bot.example', KINETIC_ACCESS_CLIENT_ID: 'machine', KINETIC_ACCESS_CLIENT_SECRET: 'test-secret', CSRF_SECRET: 'test-secret-at-least-thirty-two-bytes' };
const userId = '234567890123456789', session = 's'.repeat(43);
const user = { id: userId, displayName: 'Tester' };
const request = (path: string, init: RequestInit = {}) => new Request('https://site.example' + path, init);
const headers = { Cookie: '__Host-wo-participant-session=' + session };
const sessionData = () => ({ schemaVersion: '1.0', user, guildId: env.DISCORD_GUILD_ID, expiresAt: new Date(Date.now() + 850000).toISOString() });
const stats = { recordedSeconds: 120, sessions: 1, unknownDurationSessions: 0 };
describe('participant gateway', () => {
  it('requires a distinct tester session and never uses an admin cookie', async () => {
    const upstream = vi.fn<typeof fetch>();
    const result = await handleGateway(request('/api/participant/home', { headers: { Cookie: '__Host-wo-admin-session=' + session } }), env, { fetch: upstream });
    expect(result.status).toBe(401); expect(upstream).not.toHaveBeenCalled();
  });
  it('returns only the authenticated tester home and forwards a distinct session header', async () => {
    const upstream = vi.fn<typeof fetch>(async (url, init) => {
      const sent = new Headers(init?.headers);
      expect(sent.get('X-WO-Participant-Session')).toBe(session);
      expect(sent.has('X-WO-Admin-Session')).toBe(false);
      return Response.json(String(url).endsWith('/session') ? sessionData() : { schemaVersion: '1.0', user, stats, campaigns: [], invitations: [], private: 'secret' });
    });
    const result = await handleGateway(request('/api/participant/home', { headers }), env, { fetch: upstream });
    expect(result.status).toBe(200); expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.json()).toEqual({ schemaVersion: '1.0', user, stats, campaigns: [], invitations: [] });
  });
  it('rejects another account’s home', async () => {
    const upstream = vi.fn<typeof fetch>(async url => Response.json(String(url).endsWith('/session') ? sessionData() : { schemaVersion: '1.0', user: { ...user, id: '345678901234567890' }, stats, campaigns: [], invitations: [] }));
    expect((await handleGateway(request('/api/participant/home', { headers }), env, { fetch: upstream })).status).toBe(502);
  });
  it('requires CSRF and same-origin for claiming', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json(sessionData()));
    const result = await handleGateway(request('/api/participant/claim', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ token: 'x'.repeat(43) }) }), env, { fetch: upstream });
    expect(result.status).toBe(403);
  });
  it('fails closed on duplicate query parameters and unapproved operations', async () => {
    for (const path of ['/api/participant/history?cursor=0&cursor=1', '/api/participant/home?userId=other', '/api/participant/anything']) {
      const result = await handleGateway(request(path, { headers }), env, { fetch: vi.fn() });
      expect([400,404]).toContain(result.status);
    }
  });
});

it('preserves expired invitation status for a helpful claim error', async () => {
  const upstream = vi.fn<typeof fetch>(async url => String(url).endsWith('/session') ? Response.json(sessionData()) : Response.json({ code: 'EXPIRED' }, { status: 410 }));
  const signed = await handleGateway(request('/api/participant/session', { headers }), env, { fetch: upstream });
  const value = await signed.json() as { csrfToken: string };
  const response = await handleGateway(request('/api/participant/claim', { method: 'POST', headers: { ...headers, Origin: 'https://site.example', 'Content-Type': 'application/json', 'X-CSRF-Token': value.csrfToken }, body: JSON.stringify({ token: 'x'.repeat(43) }) }), env, { fetch: upstream });
  expect(response.status).toBe(410);
});


it('uses purpose-bound participant flow and the existing registered Discord callback', async () => {
  const token = 'f'.repeat(43), state = 'n'.repeat(43);
  const authUrl = 'https://discord.com/oauth2/authorize?client_id=345678901234567890&response_type=code&scope=identify&redirect_uri=' + encodeURIComponent(env.DISCORD_REDIRECT_URI!) + '&state=' + state;
  const upstream = vi.fn<typeof fetch>(async url => Response.json(String(url).endsWith('/start')
    ? { schemaVersion: '1.0', authorizationUrl: authUrl, flowToken: token, expiresAt: new Date(Date.now()+290000).toISOString() }
    : { schemaVersion: '1.0', sessionToken: session, userId, guildId: env.DISCORD_GUILD_ID, expiresAt: new Date(Date.now()+850000).toISOString() }));
  const start = await handleGateway(request('/api/participant/start'),env,{ fetch:upstream });
  expect(start.status).toBe(302);
  expect(start.headers.get('Set-Cookie')).toContain('__Host-wo-participant-flow=');
  expect(start.headers.get('Set-Cookie')).toContain('__Host-wo-admin-flow=;');
  const response = await handleGateway(request('/api/auth/discord/callback?code=code&state=' + state + '&iss=https%3A%2F%2Fdiscord.com',{ headers:{ Cookie:'__Host-wo-participant-flow=' + token } }),env,{ fetch:upstream });
  expect(response.headers.get('Location')).toBe('/playtester/');
  expect(String(upstream.mock.calls.at(-1)![0])).toContain('/participant/callback');
  expect(response.headers.get('Set-Cookie')).toContain('__Host-wo-participant-session=');
  expect(response.headers.get('Set-Cookie')).not.toContain('__Host-wo-admin-session=');
});
it('withholds a slow home response if membership was revoked during the read', async () => {
  let sessions = 0;
  const upstream = vi.fn<typeof fetch>(async url => {
    if(String(url).endsWith('/session')) return Response.json({ ...sessionData(), campaignIds: ++sessions === 1 ? ['alpha'] : [] });
    return Response.json({ schemaVersion:'1.0', user, stats, invitations:[], campaigns:[{ id:'alpha',title:'Alpha',claimedAt:'2026-11-01T12:00:00Z',collectionActive:false,instructions:'Private',announcement:'',tasks:[],stats }] });
  });
  const response = await handleGateway(request('/api/participant/home',{ headers }),env,{ fetch:upstream });
  expect(response.status).toBe(403); expect(await response.text()).not.toContain('Private');
});
