import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { onRequest } from '../../functions/_middleware';

for (const role of ['Playtester', 'Administrator']) {
  test(role + ' form follows the Discord redirect under the production security policy', async ({ page }) => {
    const shell = await onRequest({ request: new Request('https://site.example/login/'), env: { ENVIRONMENT: 'production' }, next: async () => new Response('login') });
    await page.route('**/login/', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': shell.headers.get('Content-Security-Policy')! } });
    });
    await page.route('**/api/**/start*', route => route.fulfill({ status: 302, headers: { Location: 'https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=identify' } }));
    await page.route('https://discord.com/oauth2/authorize*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Discord sign-in</h1>' }));
    await page.goto('/login/');
    await page.getByRole('radio', { name: new RegExp('^' + role) }).check();
    await page.getByRole('button', { name: 'Continue with Discord' }).click();
    await expect(page).toHaveURL(/^https:\/\/discord\.com\/oauth2\/authorize\?/);
  });
}

test('Discord login explains bot enrollment, works with a keyboard and fits mobile', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.goto('/login/');
  await expect(page.getByRole('heading', { name: 'Sign in with Discord', exact: true })).toBeVisible();
  await expect(page.getByLabel('Stay signed in on this device')).not.toBeChecked();
  for (const radio of await page.getByRole('radio').all()) {
    expect(await radio.evaluate(input => input.getBoundingClientRect().width)).toBeLessThanOrEqual(24);
    expect(await radio.evaluate(input => { const label = input.closest('label')!; return label.querySelector('span')!.getBoundingClientRect().right <= label.getBoundingClientRect().right; })).toBe(true);
  }
  await page.getByRole('radio', { name: /^Administrator/ }).check();
  await page.getByText('First time signing in as an administrator?').click();
  await expect(page.getByText('/dashboard enable', { exact: true })).toBeVisible();
  await expect(page.locator('[data-login-form]')).toHaveAttribute('action', '/api/auth/discord/start');
  await page.getByLabel('Stay signed in on this device').check();
  await expect(page.locator('[name="remember"]')).toHaveValue('true');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/login/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to sign-in' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#login-main$/);
  await page.screenshot({ path: testInfo.outputPath('discord-login-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('discord-login-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('role and remember choices submit only approved OAuth query fields', async ({ page }) => {
  await page.route('**/api/auth/discord/start*', route => route.fulfill({ body: 'OAuth started' }));
  await page.goto('/login/');
  await page.getByRole('radio', { name: /^Administrator/ }).check();
  await page.getByLabel('Stay signed in on this device').check();
  await page.getByRole('button', { name: 'Continue with Discord' }).click();
  await expect(page).toHaveURL(/\/api\/auth\/discord\/start\?remember=true$/);
});

test('playtester sign-in form works without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.route('**/api/participant/start*', route => route.fulfill({ body: 'OAuth started' }));
  await page.goto(baseURL + '/login/');
  await page.getByLabel('Stay signed in on this device').check();
  await page.getByRole('button', { name: 'Continue with Discord' }).click();
  await expect(page).toHaveURL(/\/api\/participant\/start\?remember=true$/);
  await context.close();
});

test('a remembered sign-in restores the guarded admin destination', async ({ page }) => {
  let valid = false, renewals = 0;
  await page.route('**/api/auth/discord/refresh', route => { valid = true; renewals++; return route.fulfill({ json: { schemaVersion: '1.0', renewed: true } }); });
  await page.route('**/api/admin/v1/**', route => {
    if (!valid) return route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } });
    return route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/session')
      ? { schemaVersion: '1.0', user: { id: '123456789012345678', displayName: 'Administrator', role: 'administrator' }, capabilities: ['reports:read'], csrfToken: 'fixture-csrf', authMethod: 'discord' }
      : { schemaVersion: '1.0', reports: [], nextCursor: null } });
  });
  await page.goto('/login/?returnTo=%2Fadmin%2Freports%2F');
  await expect(page).toHaveURL(/\/admin\/reports\/$/);
  await expect(page.locator('[data-staff-workspace]')).toBeVisible();
  await expect.poll(() => renewals).toBe(1);
});

test('remembered administrator sessions renew automatically while the panel is open', async ({ page }) => {
  await page.clock.install();
  let valid = true, renewals = 0;
  await page.route('**/api/auth/discord/refresh', route => { valid = true; renewals++; return route.fulfill({ json: { schemaVersion: '1.0', renewed: true } }); });
  await page.route('**/api/admin/v1/**', route => !valid ? route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } }) : route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/session')
    ? { schemaVersion: '1.0', user: { id: '123456789012345678', displayName: 'Administrator', role: 'administrator' }, capabilities: ['reports:read'], csrfToken: 'fixture-csrf', authMethod: 'discord' }
    : { schemaVersion: '1.0', reports: [], nextCursor: null } }));
  await page.goto('/admin/reports/');
  await expect(page.locator('[data-staff-workspace]')).toBeVisible();
  valid = false;
  await page.clock.fastForward(61000);
  await expect(page.locator('[data-staff-workspace]')).toBeVisible();
  await expect.poll(() => renewals).toBe(1);
});

test('login errors use safe messages and discard supplied URL text', async ({ page }) => {
  await page.goto('/login/?error=enrollment_required&message=%3Cimg%20src=x%20onerror=alert(1)%3E');
  await expect(page.locator('[data-login-message]')).toContainText('Run /dashboard enable');
  await expect(page.locator('[data-login-message] img')).toHaveCount(0);
  await expect(page).toHaveURL(/\/login\/$/);
  await page.goto('/login/?error=logout_unconfirmed');
  await expect(page.locator('[data-login-message]')).toContainText('could not confirm session revocation');
});

test('dashboard signs out with the current session CSRF and clears staff content', async ({ page }) => {
  let logoutHeaders: Record<string, string> | undefined;
  await page.route('**/api/admin/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/session')
    ? { schemaVersion: '1.0', user: { id: '123456789012345678', displayName: 'Discord administrator', role: 'administrator' }, capabilities: ['reports:read'], csrfToken: 'fixture-csrf', authMethod: 'discord' }
    : { schemaVersion: '1.0', reports: [], nextCursor: null } }));
  await page.route('**/api/auth/logout', async route => {
    expect(route.request().method()).toBe('POST');
    logoutHeaders = await route.request().allHeaders();
    return route.fulfill({ json: { schemaVersion: '1.0', revoked: true } });
  });
  await page.goto('/admin/reports/');
  await expect(page.locator('[data-staff-workspace]')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: 'Sign in with Discord', exact: true })).toBeVisible();
  await expect(page.locator('[data-login-message]')).toContainText('signed out');
  expect(logoutHeaders?.['x-csrf-token']).toBe('fixture-csrf');
});

test('sign-out waits for the gateway timeout and explains unconfirmed revocation', async ({ page }) => {
  await page.route('**/api/admin/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/session')
    ? { schemaVersion: '1.0', user: { id: '123456789012345678', displayName: 'Discord administrator', role: 'administrator' }, capabilities: ['reports:read'], csrfToken: 'fixture-csrf', authMethod: 'discord' }
    : { schemaVersion: '1.0', reports: [], nextCursor: null } }));
  await page.route('**/api/auth/logout', async route => {
    await new Promise(resolve => setTimeout(resolve, 8500));
    await route.fulfill({ status: 503, headers: { 'X-WO-Browser-Session-Ended': 'true' }, json: { code: 'UNAVAILABLE' } });
  });
  await page.goto('/admin/reports/');
  await expect(page.locator('[data-staff-workspace]')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('[data-login-message]')).toContainText('could not confirm session revocation', { timeout: 12000 });
  await expect(page.locator('[data-staff-workspace]')).toHaveCount(0);
});
