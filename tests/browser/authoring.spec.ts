import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const site = JSON.parse(readFileSync(new URL('../../src/data/editable/site.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const roadmap = JSON.parse(readFileSync(new URL('../../src/data/editable/roadmap.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
const gallery = JSON.parse(readFileSync(new URL('../../src/data/editable/gallery.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
const session = { schemaVersion: '1.0', user: { id: 'owner', displayName: 'Test administrator', role: 'administrator' }, capabilities: ['content:read', 'content:write', 'content:publish', 'configuration:read', 'configuration:write', 'configuration:credentials'], csrfToken: 'fixture-csrf' };
const settings = { schemaVersion: '1.0', revision: 'config-1', settings: { mainOrigin: 'https://main.example', intervalMs: 30000, staleSeconds: 120, failures: 3, recoveries: 2, staffChannel: null, publicChannel: null }, credentials: { read: { configured: true, updatedAt: null }, write: { configured: false, updatedAt: null } }, verification: { state: 'unverified', checkedAt: null, readVerified: false, writeVerified: false, message: 'Verify this saved connection.' }, application: { state: 'applied', revision: 'config-1' }, bootstrap: [{ label: 'Encryption key', ready: true }] };
test('settings are keyboard accessible, credentials clear after submission, and revoked access hides the workspace', async ({ page }, info) => {
  let revoked = false, submitted: unknown;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/admin/v1/**', async route => {
    if (revoked) return route.fulfill({ status: 403, json: { code: 'FORBIDDEN' } });
    if (route.request().url().endsWith('/session')) return route.fulfill({ json: session });
    if (route.request().method() === 'PUT') { submitted = route.request().postDataJSON(); expect((await route.request().allHeaders())['x-csrf-token']).toBe('fixture-csrf'); return route.fulfill({ json: { ...settings, revision: 'config-2', application: { state: 'restart-required', revision: 'config-1' } } }); }
    return route.fulfill({ json: settings });
  });
  await page.goto('/admin/settings/'); await expect(page.locator('[data-authoring-workspace]')).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to dashboard' })).toBeFocused();
  await page.getByLabel('New credential').fill('synthetic-fixture-secret-of-at-least-32-chars'); await page.locator('[data-credential-form] textarea').fill('Replace the staging connection credential.'); await page.getByRole('button', { name: 'Replace credential' }).click();
  await expect(page.getByLabel('New credential')).toHaveValue(''); await expect(page.locator('[data-settings-state]')).toContainText('restart required'); expect(submitted).toMatchObject({ scope: 'read', revision: 'config-1' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('settings-desktop.png'), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('settings-mobile.png'), fullPage: true });
  revoked = true; await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await expect(page.locator('[data-authoring-workspace]')).toBeHidden(); expect(errors).toEqual([]);
});
test('structured site content saves privately and publication needs explicit public-source acknowledgment', async ({ page }, info) => {
  const calls: string[] = []; let saved: unknown;
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname; calls.push(path);
    if (path.endsWith('/session')) return route.fulfill({ json: session });
    if (path.endsWith('/publication')) return route.fulfill({ json: { state: 'requested', message: 'Source submitted for review.', operationId: 'job-1' } });
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
    return route.fulfill({ json: { schemaVersion: '1.0', kind: 'site', revision: 'draft-1', sourceRevision: 'source-1', data: site } });
  });
  await page.goto('/admin/content/pages/'); await expect(page.getByLabel('Tagline', { exact: true })).toBeVisible(); await page.getByLabel('Tagline', { exact: true }).fill('A new public tagline'); await page.getByRole('button', { name: 'Save private draft' }).click(); await expect(page.locator('[data-authoring-message]')).toContainText('Private draft saved'); expect(saved).toMatchObject({ revision: 'draft-1', document: { data: { tagline: 'A new public tagline' } } });
  expect(calls.some(path => path.endsWith('/publication'))).toBe(false);
  await page.getByRole('button', { name: 'Submit saved draft for review' }).click(); await expect(page.locator('[data-authoring-message]')).toContainText('Acknowledge');
  await page.locator('[data-page-public-ack]').check(); await page.getByRole('button', { name: 'Submit saved draft for review' }).click(); await expect(page.locator('[data-page-publication]')).toContainText('requested'); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.locator('[data-authoring-message]')).not.toContainText('Acknowledge');
  await page.screenshot({ path: info.outputPath('pages-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('pages-mobile.png'), fullPage: true }); expect(errors).toEqual([]);
});
test('the hosted transmission editor reads the shared session and keeps saving separate from publication', async ({ page }, info) => {
  const record = { id: 'hello', slug: 'hello', revision: 'r1', sourceRevision: null, title: 'Hello', description: 'A useful project update.', publishedAt: '2026-10-07', type: 'news', author: 'Owner', tags: ['update'], featured: false, draft: true, galleryImages: [], bodyMarkdown: 'A private update.' };
  let saves = 0, publications = 0; const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/session')) return route.fulfill({ json: session });
    if (path.endsWith('/transmissions')) return route.fulfill({ json: { schemaVersion: '1.0', records: [{ ...record, galleryImageCount: 0 }] } });
    if (path.endsWith('/publication')) { publications++; return route.fulfill({ json: { state: 'requested', message: 'Review requested.', operationId: 'job-1' } }); }
    if (route.request().method() === 'PUT') saves++;
    return route.fulfill({ json: { schemaVersion: '1.0', transmission: record, publishing: { state: 'draft-saved', message: 'Private draft saved.' } } });
  });
  await page.goto('/admin/content/'); await expect(page.locator('[data-admin-user]')).toHaveText('Test administrator'); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Title', { exact: true }).fill('Updated title'); await page.getByRole('button', { name: 'Save record' }).click(); await expect(page.locator('[data-admin-publishing]')).toContainText('Private draft saved'); expect(saves).toBe(1); expect(publications).toBe(0);
  await page.screenshot({ path: info.outputPath('content-desktop.png'), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('content-mobile.png'), fullPage: true }); expect(errors).toEqual([]);
});
test('dashboard navigation and roadmap/gallery private saves work with the keyboard', async ({ page }) => {
  const documents: Record<string, unknown> = { site, roadmap, gallery }, saved: Record<string, unknown> = {};
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/session')) return route.fulfill({ json: session });
    if (path.endsWith('/configuration')) return route.fulfill({ json: settings });
    if (path.endsWith('/transmissions')) return route.fulfill({ json: { schemaVersion: '1.0', records: [] } });
    const kind = path.split('/').at(-1)!;
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON() as { document: { data: unknown } };
      documents[kind] = input.document.data; saved[kind] = input.document.data;
    }
    return route.fulfill({ json: { schemaVersion: '1.0', kind, revision: 'draft-1', sourceRevision: 'source-1', data: documents[kind] } });
  });
  await page.goto('/admin/settings/'); await expect(page.locator('[data-authoring-workspace]')).toBeVisible();
  await page.getByRole('link', { name: 'Site content', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/content\/pages\/$/); await expect(page.getByLabel('Tagline', { exact: true })).toBeVisible();
  const section = page.getByLabel('Content section');
  await section.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(section).toHaveValue('roadmap'); await expect(page.locator('[data-page-fields] > fieldset').first().getByLabel('Title', { exact: true })).toBeVisible();
  await page.locator('[data-page-fields] > fieldset').first().getByLabel('Title', { exact: true }).fill('Reviewed roadmap title');
  await page.getByRole('button', { name: 'Save private draft', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-authoring-message]')).toContainText('Private draft saved'); expect(saved.roadmap).toMatchObject(roadmap.map((item, index) => index === 0 ? { ...item, title: 'Reviewed roadmap title' } : item));
  await section.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(section).toHaveValue('gallery'); await expect(page.locator('[data-page-fields] > fieldset').first().getByLabel('Caption', { exact: true })).toBeVisible();
  await page.locator('[data-page-fields] > fieldset').first().getByLabel('Caption', { exact: true }).fill('Reviewed gallery caption');
  await page.getByRole('button', { name: 'Save private draft', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect.poll(() => saved.gallery).toMatchObject(gallery.map((item, index) => index === 0 ? { ...item, caption: 'Reviewed gallery caption' } : item));
  await page.getByRole('link', { name: 'Transmissions', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/content\/$/); await expect(page.locator('[data-admin-user]')).toHaveText('Test administrator');
  expect(errors).toEqual([]);
});
