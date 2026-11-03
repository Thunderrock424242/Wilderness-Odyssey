import { describe, expect, it } from 'vitest';
import { handleGateway } from '../server/gateway';
import { createCsrf } from '../server/csrf';
import { discordCsrfSubject } from '../server/staff-cookies';
import type { GatewayEnv } from '../server/env';

const userId = '234567890123456789';
const token = 's'.repeat(43);
const env: GatewayEnv = { ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'discord', ALLOWED_HOSTS: 'site.example.com', DISCORD_REDIRECT_URI: 'https://site.example.com/api/auth/discord/callback', DISCORD_GUILD_ID: '123456789012345678', KINETIC_ADMIN_ORIGIN: 'https://backend.example.com', KINETIC_ACCESS_CLIENT_ID: 'machine', KINETIC_ACCESS_CLIENT_SECRET: 'machine-private', CSRF_SECRET: 'test-signing-key-of-at-least-32-bytes' };
const home = { schemaVersion: '1.0', owner: false, admins: [], campaigns: [], threads: [], nextCursor: null };
const message = { id: '1', campaignId: 'alpha', userId, authorId: null, direction: 'tester', body: 'Private message', createdAt: '2026-11-01T12:00:00Z', status: 'received', attachments: [] };
const attachment = '08abc53c-80d9-4ccc-a7aa-4cf293ab93a9';
function upstream(value: unknown = home, options: { capabilities?: string[]; withdraw?: boolean; withdrawApproval?:boolean; denied?: boolean; binary?: boolean } = {}): typeof fetch {
  let checks = 0;
  return async (url, init) => {
    const headers = new Headers(init?.headers);
    expect(headers.get('X-WO-Admin-Session')).toBe(token);
    expect(headers.get('CF-Access-Client-Secret')).toBe('machine-private');
    if (String(url).endsWith('/session')) {
      if (++checks > 1 && options.withdraw) return Response.json({}, { status: 403 });
      return Response.json({ schemaVersion: '1.0', user: { id: userId, displayName: 'Admin', role: 'administrator' }, capabilities: options.capabilities ?? ['server:write'], guildId: env.DISCORD_GUILD_ID, expiresAt: new Date(Date.now() + 800000).toISOString() });
    }
    if (options.denied) return new Response('private upstream error', { status: 403 });
    if (options.binary && String(url).endsWith('/playtester-chat')) return Response.json(home,{status:options.withdrawApproval ? 403:200});
    if (options.binary) return new Response(new Uint8Array([0, 1, 255]), { headers: { 'Content-Type': 'application/x-spark-sampler', 'Content-Disposition': 'attachment; filename="private.sparkprofile"' } });
    return Response.json(value);
  };
}
async function request(path = '', payload?: unknown, override: Record<string, string> = {}) {
  const headers = new Headers({ Cookie: '__Host-wo-admin-session=' + token, 'X-WO-Admin-Session': 'forged', ...override });
  if (payload !== undefined) {
    headers.set('Origin', override.Origin ?? 'https://site.example.com'); headers.set('Content-Type', 'application/json');
    headers.set('X-CSRF-Token', override['X-CSRF-Token'] ?? await createCsrf(await discordCsrfSubject(token), 'https://site.example.com', env.CSRF_SECRET!));
    headers.set('Idempotency-Key', override['Idempotency-Key'] ?? 'request-1234567890');
  }
  return new Request('https://site.example.com/api/admin/v1/playtester-chat' + path, { headers, method: payload === undefined ? 'GET' : 'POST', body: payload === undefined ? undefined : JSON.stringify(payload) });
}
describe('selected staff playtester inbox gateway', () => {
  it('requires Discord, current permission and backend selection; projects private responses', async () => {
    const result = await handleGateway(await request(), env, { fetch: upstream({ ...home, secret: 'private-secret' }) });
    expect(result.status).toBe(200); expect(await result.text()).not.toContain('private-secret'); expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect((await handleGateway(await request(), env, { fetch: upstream(home, { capabilities: [] }) })).status).toBe(403);
    expect((await handleGateway(await request(), env, { fetch: upstream(home, { denied: true }) })).status).toBe(403);
    expect((await handleGateway(await request(), { ...env, STAFF_AUTH_MODE: 'access' }, { fetch: upstream() })).status).toBe(403);
    expect((await handleGateway(await request(), env, { fetch: upstream({ ...home, admins: [{ userId, approvedAt: message.createdAt }] }) })).status).toBe(502);
  });
  it('validates same-origin CSRF, strict payload, query and idempotency before forwarding', async () => {
    const path = '/threads/alpha/' + userId + '/reply';
    expect((await handleGateway(await request(path, { body: 'Reply' }), env, { fetch: upstream({ schemaVersion: '1.0', message: { ...message, direction: 'staff', status: 'queued' } }) })).status).toBe(200);
    const overrides: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { 'X-CSRF-Token': 'wrong' }, { 'Idempotency-Key': 'short' }];
    for (const override of overrides) expect((await handleGateway(await request(path, { body: 'Reply' }, override), env, { fetch: upstream() })).status).toBeGreaterThanOrEqual(400);
    expect((await handleGateway(await request(path, { body: 'Reply', extra: true }), env, { fetch: upstream() })).status).toBe(400);
    for (const query of ['?cursor=1&cursor=2', '?unknown=true']) expect((await handleGateway(await request(query), env, { fetch: upstream() })).status).toBe(400);
  });
  it('rejects messages returned from another campaign or tester', async () => {
    expect((await handleGateway(await request('/threads/alpha/' + userId), env, { fetch: upstream({ schemaVersion: '1.0', messages: [{ ...message, campaignId: 'other' }], nextCursor: null }) })).status).toBe(502);
  });
  it('returns bounded private attachments with generated download names and rechecks session', async () => {
    const result = await handleGateway(await request('/attachments/' + attachment), env, { fetch: upstream(null, { binary: true }) });
    expect(result.status).toBe(200); expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([0, 1, 255]);
    expect(result.headers.get('Cache-Control')).toBe('no-store'); expect(result.headers.get('Content-Disposition')).toContain(attachment + '.sparkprofile'); expect(result.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect((await handleGateway(await request('/attachments/' + attachment), env, { fetch: upstream(null, { binary: true, withdraw: true }) })).status).toBe(403);
    expect((await handleGateway(await request('/attachments/' + attachment), env, { fetch: upstream(null, { binary: true, withdrawApproval:true }) })).status).toBe(403);
    expect((await handleGateway(await request('/attachments/' + attachment + '?url=private'), env, { fetch: upstream(null, { binary: true }) })).status).toBe(400);
    const oversized: typeof fetch = async (url, init) => String(url).endsWith('/session') ? upstream()(url, init) : new Response('x', { headers: { 'Content-Type': 'text/plain', 'Content-Length': String(5 * 1024 * 1024 + 1) } });
    expect((await handleGateway(await request('/attachments/' + attachment), env, { fetch: oversized })).status).toBe(413);
  });
});
