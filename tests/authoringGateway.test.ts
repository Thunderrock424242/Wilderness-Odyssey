import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { handleGateway } from '../server/gateway';
import { createCsrf } from '../server/csrf';
import type { GatewayEnv } from '../server/env';

const env: GatewayEnv = {
  ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'access', ALLOWED_HOSTS: 'site.example.com',
  ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUDIENCE: 'staff',
  KINETIC_ADMIN_ORIGIN: 'https://backend.example.com', KINETIC_ACCESS_CLIENT_ID: 'machine',
  KINETIC_ACCESS_CLIENT_SECRET: 'private-machine-secret', CSRF_SECRET: 'test-signing-key-of-at-least-32-bytes',
};
let jwt: string;
let jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' }] });
  jwt = await new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(env.ACCESS_TEAM_DOMAIN!).setAudience('staff').setSubject('owner').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
});
const timestamp = '2026-10-07T12:00:00Z';
const content = {
  slug: 'hello', title: 'Hello world',
  description: 'A useful project update.', publishedAt: '2026-10-07', type: 'news', author: 'Owner',
  tags: ['update'], featured: false, draft: true, galleryImages: [], bodyMarkdown: 'A private draft.',
};
export const draft = { id: 'hello', revision: 'draft-1', sourceRevision: null, ...content };
export const configuration = {
  schemaVersion: '1.0', revision: 'config-1',
  settings: { mainOrigin: 'https://main.example.com', intervalMs: 30000, staleSeconds: 120, failures: 3, recoveries: 2, staffChannel: null, publicChannel: null },
  credentials: { read: { configured: true, updatedAt: timestamp }, write: { configured: false, updatedAt: null } },
  verification: { state: 'unverified', checkedAt: null, readVerified: false, writeVerified: false, message: 'Verify the connection before use.' },
  application: { state: 'applied', revision: 'config-1' }, bootstrap: [],
};
async function request(path: string, method = 'GET', body?: unknown, csrf = true) {
  const headers = new Headers({ 'Cf-Access-Jwt-Assertion': jwt });
  if (body !== undefined) {
    headers.set('Origin', 'https://site.example.com'); headers.set('Content-Type', 'application/json');
    headers.set('Idempotency-Key', 'request-1234567890');
    if (csrf) headers.set('X-CSRF-Token', await createCsrf('owner', 'https://site.example.com', env.CSRF_SECRET!));
  }
  return new Request('https://site.example.com/api/admin/v1' + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
function upstream(value: unknown, role = 'administrator', capabilities = ['content:read', 'content:write', 'content:publish', 'configuration:read', 'configuration:write', 'configuration:credentials']): typeof fetch {
  return async url => String(url).endsWith('/session')
    ? Response.json({ schemaVersion: '1.0', user: { id: 'owner', displayName: 'Owner', role }, capabilities })
    : Response.json(value);
}
async function call(req: Request, fetcher: typeof fetch) { return handleGateway(req, env, { fetch: fetcher, jwks }); }

describe('hosted authoring gateway', () => {
  it('authenticates private image uploads and reads, with independent bounds and safe types', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
    const form = new FormData(); form.set('slug', 'hello'); form.set('purpose', 'cover'); form.set('file', new File([bytes], 'cover.png', { type: 'image/png' }));
    const base = await request('/content/media', 'POST', {});
    const headers = new Headers(base.headers); headers.delete('Content-Type');
    const req = new Request(base.url, { method: 'POST', headers, body: form });
    const metadata = { id: 'media-1', src: '/images/transmissions/hello/cover.png', previewUrl: '/api/admin/v1/content/media/media-1', fileName: 'cover.png', mimeType: 'image/png', kind: 'image' };
    let binaryForwarded = false;
    const fetcher: typeof fetch = async (url, init) => {
      if (String(url).endsWith('/session')) return upstream({})(url, init);
      if (init?.method === 'POST') { binaryForwarded = new Headers(init.headers).get('Content-Type') === 'image/png' && init.body instanceof Uint8Array; return Response.json(metadata); }
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    };
    expect((await call(req, fetcher)).status).toBe(200); expect(binaryForwarded).toBe(true);
    const image = await call(await request('/content/media/media-1'), fetcher);
    expect(image.status).toBe(200); expect(image.headers.get('Cache-Control')).toBe('no-store'); expect((await image.arrayBuffer()).byteLength).toBe(bytes.length);
    expect((await call(new Request(base.url + '/media-1'), fetcher)).status).toBe(401);
    expect((await call(await request('/content/media/media-1'), async (url, init) => String(url).endsWith('/session') ? upstream({})(url, init) : new Response('<script>', { headers: { 'Content-Type': 'text/html' } }))).status).toBe(502);
  });
  it('serves only validated content projections to an authorized administrator', async () => {
    const response = await call(await request('/content/transmissions/hello'), upstream({ schemaVersion: '1.0', transmission: { ...draft, privateToken: 'upstream-secret' } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transmission.bodyMarkdown).toBe('A private draft.');
    expect(JSON.stringify(body)).not.toContain('upstream-secret');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('denies moderator content reads even if the backend supplies an administrator capability', async () => {
    const response = await call(await request('/content/transmissions/hello'), upstream({}, 'moderator'));
    expect(response.status).toBe(403);
  });
  it('requires a revision, CSRF, and strict payload before forwarding a private save', async () => {
    const body = { content, revision: 'draft-1', sourceRevision: null };
    const success = { schemaVersion: '1.0', transmission: draft, publishing: { state: 'draft-saved', message: 'Private draft saved.' } };
    expect((await call(await request('/content/transmissions/hello', 'PUT', body), upstream(success))).status).toBe(200);
    expect((await call(await request('/content/transmissions/hello', 'PUT', body, false), upstream(success))).status).toBe(403);
    expect((await call(await request('/content/transmissions/hello', 'PUT', { ...body, command: 'shell' }), upstream(success))).status).toBe(400);
  });
  it('strips accidental backend credential values from a configuration response', async () => {
    const response = await call(await request('/configuration'), upstream({ ...configuration, token: 'private-read-token', credentials: { ...configuration.credentials, read: { ...configuration.credentials.read, value: 'saved-secret' } } }));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/private-read-token|saved-secret/);
  });
  it('rejects misleading successful save/verification/application states and projects local operational messages', async () => {
    const save = await call(await request('/content/transmissions/hello', 'PUT', { content, revision: 'draft-1', sourceRevision: null }), upstream({ schemaVersion: '1.0', transmission: draft, publishing: { state: 'published', message: 'Published.' } }));
    expect(save.status).toBe(502);
    for (const value of [
      { ...configuration, verification: { ...configuration.verification, state: 'wrong-server', readVerified: true, writeVerified: true } },
      { ...configuration, application: { state: 'applied', revision: 'other' } },
    ]) expect((await call(await request('/configuration'), upstream(value))).status).toBe(502);
    const projected = await call(await request('/configuration'), upstream({ ...configuration, verification: { ...configuration.verification, message: 'echoed-private-credential' }, bootstrap: [{ label: 'internal-private-key', ready: false }] }));
    expect(projected.status).toBe(200); expect(await projected.text()).not.toMatch(/echoed-private-credential|internal-private-key/);
    const saved = await call(await request('/content/transmissions/hello', 'PUT', { content, revision: 'draft-1', sourceRevision: null }), upstream({ schemaVersion: '1.0', transmission: draft, publishing: { state: 'draft-saved', message: 'echoed-diagnostic-secret' } }));
    expect(saved.status).toBe(200); expect(await saved.text()).not.toContain('echoed-diagnostic-secret');
  });
  it('does not accept arbitrary environment keys or empty credential replacements', async () => {
    for (const body of [{ scope: 'DISCORD_TOKEN', value: 'x'.repeat(40), revision: 'config-1', reason: 'Replace connection credential.' }, { scope: 'read', value: '', revision: 'config-1', reason: 'Replace connection credential.' }]) {
      expect((await call(await request('/configuration/credentials', 'PUT', body), upstream(configuration))).status).toBe(400);
    }
  });
  it('requires explicit acknowledgement before source enters a public repository', async () => {
    const body = { action: 'publish', revision: 'draft-1', acknowledgePublicSource: false };
    expect((await call(await request('/content/transmissions/hello/publication', 'POST', body), upstream({}))).status).toBe(400);
  });
  it('keeps the 16 KiB limit on credential requests', async () => {
    const response = await call(await request('/configuration/credentials', 'PUT', { scope: 'read', value: 'x'.repeat(18000), revision: 'config-1', reason: 'Replace connection credential.' }), upstream(configuration));
    expect(response.status).toBe(413);
  });
  it('rejects unregistered authoring routes and anonymous access', async () => {
    expect((await call(await request('/configuration/shell'), upstream({}))).status).toBe(404);
    expect((await call(new Request('https://site.example.com/api/admin/v1/configuration'), upstream({}))).status).toBe(401);
  });
});
