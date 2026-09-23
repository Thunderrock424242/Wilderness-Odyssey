import { expect, test } from '@playwright/test';

test('compiled Pages middleware serves public pages and fails closed for staff', async ({ request }) => {
  expect((await request.get('/')).status()).toBe(200);
  for (const path of ['/admin', '/admin/', '/admin/models/', '/admin/content/', '/%61dmin/', '/%2561dmin/', '//admin/', '/api/admin/v1/session']) {
    const response = await request.get('http://127.0.0.1:8788' + path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(503);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.text()).not.toContain('data-staff-workspace');
  }
  const status = await request.get('/api/public/v1/status');
  expect(status.status()).toBe(503);
  expect(await status.json()).toMatchObject({ code: 'NOT_CONFIGURED' });
});

test('runtime preserves old URLs and does not publish its compiled worker', async ({ request }) => {
  const legacy = await request.get('/Wilderness-Odyssey/roadmap/', { maxRedirects: 0 });
  expect(legacy.status()).toBe(301);
  expect(new URL(legacy.headers().location, 'http://127.0.0.1:8788').pathname).toBe('/roadmap/');
  expect((await request.get('/_worker.js')).status()).toBe(404);
});