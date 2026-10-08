import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Discord login explains bot enrollment, works with a keyboard and fits mobile', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.goto('/login/');
  await expect(page.getByRole('heading', { name: 'Sign in with Discord', exact: true })).toBeVisible();
  await expect(page.getByText('/dashboard enable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with Discord', exact: true })).toHaveAttribute('href', '/api/auth/discord/start');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
