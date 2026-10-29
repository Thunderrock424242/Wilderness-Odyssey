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

  it.each(['/admin/', '/%2561dmin/', '/login/', '/api/admin/v1/session', '/api/auth/discord/start', '/api/auth/logout'])(
    'blocks disabled staff access through %s before serving any staff content', async path => {
      const response = await onRequest({ request: new Request('https://site.example.com' + path), env: { ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'disabled', ALLOWED_HOSTS: 'site.example.com' }, next: async () => new Response('private staff shell') });
      expect(response.status).toBe(503);
      expect(response.headers.get('x-wo-staff-mode')).toBe('disabled');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).not.toContain('private staff shell');
    },
  );

  it('does not expose a disabled preview without Access configuration', async () => {
    const response = await onRequest({ request: new Request('https://preview.example.com/'), env: { ENVIRONMENT: 'preview', STAFF_AUTH_MODE: 'disabled' }, next: async () => new Response('private preview content') });
    expect(response.status).toBe(503);
    expect(response.headers.get('x-wo-staff-mode')).toBe('disabled');
    expect(await response.text()).not.toContain('private preview content');
  });

  it('serves disabled production only on approved public hosts, blocking generated deployment aliases', async () => {
    const env = { ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'disabled', ALLOWED_HOSTS: 'site.example.com,test-site.pages.dev' };
    for (const host of ['site.example.com', 'test-site.pages.dev', 'hash.test-site.pages.dev', 'website.test-site.pages.dev']) {
      const response = await onRequest({ request: new Request('https://' + host + '/'), env, next: async () => new Response('public production site') });
      if (host === 'site.example.com' || host === 'test-site.pages.dev') {
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('public production site');
      } else {
        expect(response.status).toBe(403);
        expect(await response.text()).not.toContain('public production site');
      }
    }
  });
});
