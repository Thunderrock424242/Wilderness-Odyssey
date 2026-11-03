import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const userId = '234567890123456789';
const broadcastId = '08abc53c-80d9-4ccc-a7aa-4cf293ab93a9';
const message = { id: '1', campaignId: 'alpha', userId, authorId: null, direction: 'tester', body: '<img src=x onerror=alert(1)> My game log', createdAt: '2026-11-01T12:00:00Z', status: 'received', attachments: [{ id: broadcastId, name: 'latest.txt', size: 100, kind: 'text' }] };
test('selected staff can read text, reply, approve, revoke and broadcast with delivery receipts', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const approvals: boolean[] = [];
  await page.route('**/api/admin/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown;
    if (path.endsWith('/session')) json = { schemaVersion: '1.0', user: { id: userId, displayName: 'Owner', role: 'administrator' }, capabilities: ['server:write'], csrfToken: 'fixture', authMethod: 'discord' };
    else if (path.endsWith('/access')) { approvals.push(route.request().postDataJSON().approved); expect(route.request().headers()['x-csrf-token']).toBe('fixture'); expect(route.request().headers()['idempotency-key']).toBeTruthy(); json = { schemaVersion: '1.0', saved: true }; }
    else if (path.endsWith('/reply')) { expect(route.request().postDataJSON()).toEqual({ body: 'Thanks, investigating.' }); json = { schemaVersion: '1.0', message: { ...message, id: '2', body: 'Thanks, investigating.', direction: 'staff', status: 'queued', attachments: [] } }; }
    else if (path.endsWith('/broadcasts')) { expect(route.request().postDataJSON()).toEqual({ campaignId: 'alpha', body: 'New build ready' }); json = { schemaVersion: '1.0', broadcastId, recipients: 2 }; }
    else if (path.includes('/broadcasts/')) json = { schemaVersion: '1.0', broadcastId, counts: { queued: 0, sending: 0, sent: 1, failed: 1, unknown: 0, cancelled: 0 } };
    else if (path.includes('/threads/')) json = { schemaVersion: '1.0', messages: [message], nextCursor: null };
    else if (path.includes('/attachments/')) return route.fulfill({ body: 'safe log', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    else json = { schemaVersion: '1.0', owner: true, admins: [{ userId, approvedAt: message.createdAt }], campaigns: [{ id: 'alpha', title: 'Alpha' }], threads: [{ campaignId: 'alpha', userId, lastMessageAt: message.createdAt }], nextCursor: null };
    return route.fulfill({ json });
  });
  await page.goto('/admin/playtester-chat/');
  await page.getByRole('button', { name: 'Alpha · ' + userId }).click();
  await expect(page.locator('[data-chat-messages]')).toContainText(message.body);
  expect(await page.locator('[data-chat-messages] img').count()).toBe(0);
  await page.getByLabel('Reply to tester').focus();
  await page.keyboard.type('Thanks, investigating.');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Queue reply' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-chat-receipt]')).toContainText('queued');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download latest.txt' }).click(); expect((await download).suggestedFilename()).toBe('latest.txt');
  await page.getByLabel('Administrator Discord account ID').fill(userId);
  await page.getByRole('button', { name: 'Approve administrator' }).click();
  await expect(page.locator('[data-access-receipt]')).toContainText('saved');
  await page.getByRole('button', { name: 'Revoke ' + userId }).click();
  await expect.poll(() => approvals).toEqual([true, false]);
  await page.getByLabel('Campaign update').fill('New build ready');
  await page.getByRole('button', { name: 'Queue campaign update' }).click();
  await expect(page.locator('[data-broadcast-receipt]')).toContainText('2 recipients');
  await page.getByRole('button', { name: 'Refresh delivery' }).click();
  await expect(page.locator('[data-broadcast-receipt]')).toContainText('sent: 1');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('inbox-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('inbox-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('denied inbox access clears private workspace and owner controls stay hidden for chosen staff', async ({ page }) => {
  await page.route('**/api/admin/v1/session', route => route.fulfill({ json: { schemaVersion: '1.0', user: { id: userId, displayName: 'Staff', role: 'administrator' }, capabilities: ['server:write'], csrfToken: 'fixture', authMethod: 'discord' } }));
  let denied = false;
  await page.route('**/api/admin/v1/playtester-chat', route => denied ? route.fulfill({ status: 403, json: { message: 'private error' } }) : route.fulfill({ json: { schemaVersion: '1.0', owner: false, admins: [], campaigns: [], threads: [], nextCursor: null } }));
  await page.goto('/admin/playtester-chat/');
  await expect(page.locator('[data-authoring-workspace]')).toBeVisible();
  await expect(page.locator('[data-chat-owner]')).toBeHidden();
  denied = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('[data-authoring-workspace]')).toBeHidden();
  await expect(page.locator('[data-authoring-message]')).not.toContainText('private error');
});
