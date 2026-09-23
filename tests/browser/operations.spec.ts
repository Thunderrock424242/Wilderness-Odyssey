import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sample = {
  schemaVersion: '1.0', observedAt: new Date().toISOString(), staleAfterSeconds: 90,
  minecraft: { state: 'online', players: { online: 3, max: 20 }, tps: 19.8, mspt: 28, minecraftVersion: '1.21.1', modpackVersion: '0.1.0', loader: 'NeoForge' },
  aether: { ollama: 'ready', inference: 'ready', requestsPaused: false, responseLatency: null },
  maintenance: { active: false, message: '', startsAt: null, endsAt: null, services: [] }, incidents: [],
};

test('status distinguishes an API failure from a confirmed server outage', async ({ page }) => {
  await page.route('**/api/public/v1/status', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"STATUS_UNAVAILABLE","message":"Unavailable"}' }));
  await page.goto('/status/');
  await expect(page.getByRole('heading', { name: 'Server Status' })).toBeVisible();
  await expect(page.locator('[data-status-minecraft]')).toHaveText('Unavailable');
  await expect(page.locator('[data-metric="players"]')).toHaveText('Unavailable');
  expect((await new AxeBuilder({ page }).include('[data-live-status]').analyze()).violations).toEqual([]);
});

test('stale metrics retain their measurement timestamp and stop claiming live status', async ({ page }) => {
  await page.route('**/api/public/v1/status', route => route.fulfill({ json: { ...sample, observedAt: '2020-01-01T00:00:00Z' } }));
  await page.goto('/status/');
  await expect(page.locator('[data-status-minecraft]')).toHaveText('Last known: online');
  await expect(page.locator('[data-status-detail]')).toContainText('Last confirmed');
});

test('a viewer sees read-only server information without action forms', async ({ page }) => {
  await page.route('**/api/public/v1/status', route => route.fulfill({ json: sample }));
  await page.route('**/api/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/session')
      ? { schemaVersion: '1.0', user: { id: 'viewer-test', displayName: 'Test viewer', role: 'viewer' }, capabilities: ['status:read', 'models:read'], csrfToken: 'test-fixture-only' }
      : path.endsWith('/overview')
        ? { schemaVersion: '1.0', status: sample, maintenanceRevision: 'r1', aiRequestsRevision: 'r1', performance: [], operations: [], allowedServiceOperations: [] }
        : { schemaVersion: '1.0', incidents: [] };
    return route.fulfill({ json: data });
  });
  await page.goto('/admin/');
  await expect(page.locator('[data-staff-identity]')).toContainText('Test viewer');
  await expect(page.locator('[data-write="server:write"]').first()).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Staff sections' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to dashboard' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#staff-main$/);
});

test('expired sessions clear sensitive record panels', async ({ page }) => {
  await page.route('**/api/admin/v1/session', route => route.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED', message: 'Sign in again.' } }));
  await page.goto('/admin/reports/');
  await expect(page.locator('[data-staff-message]')).toContainText('Sign in again');
  await expect(page.locator('[data-staff-workspace]')).toBeHidden();
});

test('support and status remain usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/support/troubleshooting/');
  await expect(page.getByRole('heading', { name: 'Troubleshooting' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
const fixturePlayer = { uuid: '11111111-1111-4111-8111-111111111111', username: 'FixturePlayer', verifiedAt: '2026-01-01T00:00:00Z' };

test('moderator warnings use verified UUIDs, CSRF and tracked operation results', async ({ page }) => {
  let action: { url: string; body: unknown; headers: Record<string, string> } | undefined;
  await page.route('**/api/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST') {
      action = { url: path, body: request.postDataJSON(), headers: await request.allHeaders() };
      return route.fulfill({ json: { schemaVersion: '1.0', operation: { id: 'operation_fixture', kind: 'warning', state: 'requested', summary: 'Awaiting backend processing.', requestedAt: sample.observedAt, updatedAt: sample.observedAt } } });
    }
    const data = path.endsWith('/session')
      ? { schemaVersion: '1.0', user: { id: 'moderator-fixture', displayName: 'Test moderator', role: 'moderator' }, capabilities: ['players:read', 'players:write'], csrfToken: 'fixture-csrf' }
      : path.endsWith('/players')
        ? { schemaVersion: '1.0', players: [fixturePlayer], nextCursor: null }
        : { schemaVersion: '1.0', player: fixturePlayer, history: [], restrictions: [], appeals: [] };
    return route.fulfill({ json: data });
  });
  await page.goto('/admin/players/');
  await page.getByLabel('Verified Minecraft player').fill('FixturePlayer');
  await page.getByRole('button', { name: 'Search players', exact: true }).click();
  await page.getByRole('button', { name: 'Review FixturePlayer' }).click();
  await page.locator('[data-form="warning"] textarea').fill('Repeated violation documented in report.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Issue warning', exact: true }).click();
  await expect(page.locator('[data-operation-result]')).toContainText('requested');
  expect(action?.url).toBe('/api/admin/v1/players/' + fixturePlayer.uuid + '/warnings');
  expect(action?.body).toEqual({ reason: 'Repeated violation documented in report.' });
  expect(action?.headers['x-csrf-token']).toBe('fixture-csrf');
  expect(action?.headers['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
});

test('reported excerpts are plain text and disappear after session revocation', async ({ page }) => {
  await page.clock.install();
  let revoked = false;
  const report = { id: 'fixture_report', player: fixturePlayer, summary: 'Synthetic test report', state: 'open', submittedAt: sample.observedAt, revision: 'r1' };
  await page.route('**/api/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/session')) return route.fulfill(revoked
      ? { status: 401, json: { code: 'AUTH_REQUIRED', message: 'Sign in again.' } }
      : { json: { schemaVersion: '1.0', user: { id: 'moderator-fixture', displayName: 'Test moderator', role: 'moderator' }, capabilities: ['reports:read', 'reports:write'], csrfToken: 'fixture-only' } });
    return route.fulfill({ json: path.endsWith('/reports')
      ? { schemaVersion: '1.0', reports: [report], nextCursor: null }
      : { schemaVersion: '1.0', report, excerpts: [{ speaker: 'player', text: '<img src=x onerror=alert(1)> fixture excerpt', sentAt: sample.observedAt }], provenance: 'Player submitted only this excerpt.', retentionUntil: '2026-12-01T00:00:00Z', actions: [] } });
  });
  await page.goto('/admin/reports/');
  await page.getByRole('button', { name: 'Review report fixture_report' }).click();
  await expect(page.locator('[data-report-excerpts]')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('[data-report-excerpts] img')).toHaveCount(0);
  revoked = true;
  await page.clock.fastForward(60000);
  await expect(page.locator('[data-staff-workspace]')).toBeHidden();
  await expect(page.locator('[data-report-excerpts]')).toBeEmpty();
});

test('capture the public and staff layouts for visual review', async ({ page }, testInfo) => {
  await page.route('**/api/public/v1/status', route => route.fulfill({ status: 503, json: { code: 'STATUS_UNAVAILABLE' } }));
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
  await page.goto('/status/');
  await page.screenshot({ path: testInfo.outputPath('status-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('status-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('administrators can request only a ready approved model from the presented list', async ({ page }, testInfo) => {
  let action: unknown;
  await page.route('**/api/admin/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST') {
      action = request.postDataJSON();
      return route.fulfill({ json: { schemaVersion: '1.0', operation: { id: 'model_fixture', kind: 'model-change', state: 'requested', summary: 'Model request queued.', requestedAt: sample.observedAt, updatedAt: sample.observedAt } } });
    }
    return route.fulfill({ json: path.endsWith('/session')
      ? { schemaVersion: '1.0', user: { id: 'admin-fixture', displayName: 'Test administrator', role: 'administrator' }, capabilities: ['models:read', 'models:write'], csrfToken: 'fixture-only' }
      : { schemaVersion: '1.0', activeModelId: 'approved_one', revision: 'r1', models: [
        { id: 'approved_one', name: 'Approved model one', approved: true, readiness: 'ready', detail: 'Synthetic test model.' },
        { id: 'approved_two', name: 'Approved model two', approved: true, readiness: 'loading', detail: 'Synthetic loading state.' },
      ], settings: { temperature: 0.7, numPredict: 512, numCtx: 4096 }, permittedSettings: { temperature: { min: 0.2, max: 1 }, numPredict: { min: 32, max: 1024 }, numCtx: { min: 1024, max: 8192 } } } });
  });
  await page.goto('/admin/models/');
  await expect(page.locator('[data-active-model]')).toContainText('Approved model one');
  await expect(page.locator('option[value="approved_two"]')).toHaveJSProperty('disabled', true);
  await expect(page.getByLabel('Temperature')).toHaveAttribute('max', '1');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('models-desktop.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('approved_one');
  await page.locator('[data-form="model"] textarea').fill('Approved model rollout after readiness review.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Request model change' }).click();
  await expect(page.locator('[data-operation-result]')).toContainText('requested');
  expect(action).toEqual({ modelId: 'approved_one', reason: 'Approved model rollout after readiness review.', revision: 'r1' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('models-mobile.png'), fullPage: true });
});
