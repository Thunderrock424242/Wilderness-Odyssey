import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/_middleware';

describe('staff asset protection', () => {
  for (const path of ['/admin', '/admin/', '/admin/index.html', '/%61dmin/', '/%2561dmin/', '//admin/', '/ADMIN/', '/api/admin/v1/session']) {
    it('denies unconfigured staff access through ' + path, async () => {
      const response = await onRequest({ request: new Request('https://site.example.com' + path), env: {}, next: async () => new Response('private staff shell') });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private staff shell');
    });
  }
  it('does not block ordinary public pages in production', async () => {
    const response = await onRequest({ request: new Request('https://site.example.com/roadmap/'), env: { ENVIRONMENT: 'production' }, next: async () => new Response('public roadmap') });
    expect(await response.text()).toBe('public roadmap');
  });
  it('protects every asset in an unconfigured preview', async () => {
    const response = await onRequest({ request: new Request('https://preview.example.com/images/logo.png'), env: { ENVIRONMENT: 'preview' }, next: async () => new Response('asset') });
    expect(response.status).toBe(503);
  });
});
