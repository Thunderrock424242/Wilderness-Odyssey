import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/_middleware';
import { pageError } from '../server/page-error';

describe('unavailable service pages', () => {
  it('presents a readable document for an unconfigured staff page without serving its shell', async () => {
    const response = await onRequest({ request: new Request('https://site.example.com/admin/', { headers: { Accept: 'text/html' } }), env: {}, next: async () => new Response('private staff shell') });
    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    const document = await response.text();
    expect(document).toContain('<html lang="en">');
    expect(document).toContain('<title>');
    expect(document).toContain('being set up');
    expect(document).toContain('href="/"');
    expect(document).not.toContain('private staff shell');
  });
  it('keeps API failures machine readable even if HTML is requested', async () => {
    const response = await onRequest({ request: new Request('https://site.example.com/api/admin/v1/session', { headers: { Accept: 'text/html' } }), env: {}, next: async () => new Response('private staff shell') });
    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect((await response.json()).code).toMatch(/NOT_CONFIGURED$/);
  });
  it('never includes exception details or backend data in the document', async () => {
    const response = await pageError(new Error('private-backend-token <script>alert(1)</script>'));
    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Security-Policy')).toContain("style-src 'sha256-");
    const document = await response.text();
    expect(document).not.toContain('private-backend-token');
    expect(document).not.toContain('<script>');
    expect(document).toContain('try again later');
  });
  for (const path of ['/api/admin/v1/%FF', '/api/public/v1/%25', '/%61pi/admin/%FF']) {
    it('keeps malformed API URLs machine readable: ' + path, async () => {
      const response = await onRequest({ request: new Request('https://site.example.com' + path, { headers: { Accept: 'text/html' } }), env: {}, next: async () => new Response('private staff shell') });
      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toContain('application/json');
      expect(await response.json()).toMatchObject({ code: 'INVALID_PATH' });
    });
  }
});
