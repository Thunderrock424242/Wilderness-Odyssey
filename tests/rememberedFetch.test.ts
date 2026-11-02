import { expect, it, vi } from 'vitest';
import { rememberedFetch } from '../src/services/rememberedFetch';
it('renews an expired read once but never replays a mutation', async () => {
  const calls: string[] = [];
  let valid = false;
  const upstream: typeof fetch = async (input, init) => {
    const path = String(input); calls.push(path + ':' + (init?.method ?? 'GET'));
    if (path.endsWith('/refresh')) { valid = true; return Response.json({ renewed: true }); }
    if (path.endsWith('/session')) return !valid ? new Response(null, { status: 401 }) : Response.json({ user: { id: 'alice', role: 'administrator' }, csrfToken: 'new-csrf' });
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('new-csrf');
    return new Response(null, { status: 401 });
  };
  const response = await rememberedFetch('/api/admin/v1/maintenance', { method: 'POST', headers: { 'X-CSRF-Token': 'expired-csrf' }, body: '{}' }, upstream);
  expect(response.status).toBe(401);
  expect(calls.filter(path => path.includes('maintenance'))).toHaveLength(1);
  expect(calls.filter(path => path.includes('/refresh'))).toHaveLength(1);
});

it('an account change prevents a stale form from executing as a different person', async () => {
  let identity = 'alice', mutations = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/session')) return Response.json({ user: { id: identity, role: 'administrator' }, csrfToken: identity + '-csrf' });
    if (init?.method === 'POST') mutations++;
    return Response.json({});
  };
  await rememberedFetch('/api/admin/v1/session', {}, fetcher);
  identity = 'bob';
  const result = await rememberedFetch('/api/admin/v1/maintenance', { method: 'POST', body: '{}' }, fetcher);
  expect(result.status).toBe(409);
  expect(mutations).toBe(0);
});

it.each([403, 429, 503])('preserves renewal failure %s instead of reporting expired access', async status => {
  const fetcher: typeof fetch = async input => new Response(null, { status: String(input).endsWith('/refresh') ? status : 401 });
  expect((await rememberedFetch('/api/admin/v1/session', {}, fetcher)).status).toBe(status);
});

it('queued tabs reuse the winner after acquiring the renewal lock', async () => {
  let queue = Promise.resolve(), valid = false, rotations = 0;
  vi.stubGlobal('navigator', { locks: { request: (_name: string, callback: () => Promise<number>) => {
    const job = queue.then(callback); queue = job.then(() => undefined); return job;
  } } });
  const fetcher: typeof fetch = async input => {
    if (String(input).endsWith('/refresh')) { rotations++; valid = true; return Response.json({ renewed: true }); }
    return valid ? Response.json({ user: { id: 'alice' }, csrfToken: 'csrf' }) : new Response(null, { status: 401 });
  };
  try {
    await rememberedFetch('/api/admin/v1/session', {}, fetcher);
    // A separate tab has no shared promise, but does share Web Locks and cookies.
    vi.resetModules();
    const other = await import('../src/services/rememberedFetch');
    valid = false;
    await Promise.all([rememberedFetch('/api/admin/v1/session', {}, fetcher), other.rememberedFetch('/api/admin/v1/session', {}, fetcher)]);
    expect(rotations).toBe(2); // First sign-in renewal plus exactly one for the two tabs.
  } finally { vi.unstubAllGlobals(); }
});
