import { expect, it, vi } from 'vitest';
import { HostedAdminCmsService } from '../src/lib/admin/hostedApi';
const content = { id: 'hello', slug: 'hello', revision: 'draft-1', sourceRevision: 'source-1', title: 'Hello', description: 'An update.', publishedAt: '2026-10-07', type: 'news' as const, author: 'Owner', tags: ['update'], featured: false, draft: true, galleryImages: [], bodyMarkdown: 'Private draft.' };
it('uses the shared session, saves privately with revisions, and publishes only by a separate acknowledged request', async () => {
  const calls: { path: string; body?: unknown; csrf?: string | null }[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input); calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined, csrf: new Headers(init?.headers).get('X-CSRF-Token') });
    if (path.endsWith('/session')) return Response.json({ schemaVersion: '1.0', user: { id: 'owner', displayName: 'Owner', role: 'administrator' }, capabilities: ['content:read', 'content:write', 'content:publish'], csrfToken: 'csrf' });
    if (path.endsWith('/publication')) return Response.json({ state: 'requested', message: 'Review requested.', operationId: 'job-1', pullRequestUrl: 'https://github.com/owner/repo/pull/1' });
    return Response.json({ schemaVersion: '1.0', transmission: content, publishing: { state: 'draft-saved', message: 'Private draft saved.' } });
  });
  const api = new HostedAdminCmsService(fetcher); expect((await api.getSession()).authenticated).toBe(true);
  await api.getTransmission('hello');
  const { id: _id, revision: _revision, sourceRevision: _source, ...input } = content;
  expect((await api.updateTransmission('hello', input)).publishing.state).toBe('draft-saved');
  expect(calls.at(-1)?.body).toEqual({ content: input, revision: 'draft-1', sourceRevision: 'source-1' }); expect(calls.at(-1)?.csrf).toBe('csrf');
  expect(calls.some(call => call.path.endsWith('/publication'))).toBe(false);
  await api.publishTransmission('hello', 'publish', true); expect(calls.at(-1)?.body).toEqual({ action: 'publish', revision: 'draft-1', acknowledgePublicSource: true });
});
it('rejects malformed responses and clears the session on expired access without exposing raw backend errors', async () => {
  const api = new HostedAdminCmsService(async () => Response.json({ stack: 'internal-secret' }));
  await expect(api.getSession()).rejects.toThrow('unsupported');
  const expired = new HostedAdminCmsService(async () => Response.json({ message: 'internal-secret' }, { status: 401 }));
  expect((await expired.getSession()).authenticated).toBe(false);
  await expect(expired.getTransmission('hello')).rejects.toThrow('Sign in again');
});
it('clears private media and rejects late responses after authorization was lost', async () => {
  let deny = false, release!: (value: Response) => void;
  const service = new HostedAdminCmsService(async input => {
    if (String(input).endsWith('/session')) return Response.json({ schemaVersion: '1.0', user: { id: 'owner', displayName: 'Owner', role: 'administrator' }, capabilities: ['content:read', 'content:write'], csrfToken: 'csrf' });
    if (String(input).endsWith('/transmissions/late')) return new Promise<Response>(resolve => { release = resolve; });
    if (deny) return new Response(null, { status: 403 });
    return Response.json({ schemaVersion: '1.0', transmission: content, media: [{ id: 'private', src: '/images/private.png', previewUrl: '/api/admin/v1/content/media/private', fileName: 'private.png', mimeType: 'image/png', kind: 'image' }] });
  });
  await service.getSession(); await service.getTransmission('hello');
  const late = service.getTransmission('late'); deny = true;
  await expect(service.listTransmissions()).rejects.toThrow('permission');
  expect(service.assetPreview('/images/private.png')).toBe('/images/private.png');
  release(Response.json({ schemaVersion: '1.0', transmission: { ...content, id: 'late', slug: 'late' } }));
  await expect(late).rejects.toThrow('Sign in again');
});
