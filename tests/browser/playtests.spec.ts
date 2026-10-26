import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { artifact, campaign, capturedAt, sessionRecord, tester } from '../fixtures/playtests';

const staff = { schemaVersion: '1.0', user: { id: 'owner', displayName: 'Test administrator', role: 'administrator' }, capabilities: ['playtests:read', 'playtests:write'], authMethod: 'discord', csrfToken: 'fixture-csrf' };
async function fixtures(page: Page, options: { unavailable?: boolean; role?: string; spark?: string } = {}) {
  await page.clock.install({ time: new Date('2026-10-25T12:00:10Z') });
  const state = { revoked: false, writes: 0, keys: [] as string[], collect: true, acknowledged: false, failed: false, profile: 'tester-a', permission: 'allowed', notes: 'Alex private note', deleted: false, lastMutation: null as unknown };
  await page.route('**/api/admin/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (state.revoked) return route.fulfill({ status: 401, json: { message: 'private-backend-stack' } });
    if (path.endsWith('/session')) return route.fulfill({ json: { ...staff, user: { ...staff.user, role: options.role ?? 'administrator' } } });
    if (options.unavailable) return route.fulfill({ status: 503, json: { message: 'private-backend-stack' } });
    const currentCampaign = { ...campaign, collect: state.collect, collectionId: state.collect ? 'collection-1' : null, changedAt: state.collect ? capturedAt : '2026-10-25T12:00:10Z' };
    const currentTester = { ...tester, permission: state.permission, acknowledgement: state.acknowledged ? tester.acknowledgement : null };
    if (req.method() !== 'GET') {
      state.writes++; state.keys.push(req.headers()['idempotency-key']); expect(req.headers()['x-csrf-token']).toBe('fixture-csrf');
      state.lastMutation = req.postDataJSON();
      if (state.failed) return route.abort('failed');
      if (path.endsWith('/collection')) { state.collect = req.postDataJSON().collect; return route.fulfill({ json: { schemaVersion: '1.0', campaign: { ...currentCampaign, collect: state.collect, collectionId: state.collect ? 'collection-1' : null, changedAt: '2026-10-25T12:00:10Z', revision: 'c2' } } }); }
      if (path.endsWith('/invitations')) return route.fulfill({ json: { schemaVersion: '1.0', campaignId: 'autumn', invitation: { id: 'invite-1', code: 'private_invitation_code_12345678901234567890', testerLabel: 'New tester', expiresAt: '2026-10-26T12:00:00Z', publicApiOrigin: 'https://diagnostics.example.com' } } });
      if (path.endsWith('/permission')) { state.permission = req.postDataJSON().permission; return route.fulfill({ json: { schemaVersion: '1.0', campaignId: 'autumn', tester: { ...currentTester, permission: state.permission, revision: 't2' } } }); }
      if (path.endsWith('/notes')) { state.notes = req.postDataJSON().notes; return route.fulfill({ json: { schemaVersion: '1.0', campaignId: 'autumn', testerId: 'tester-a', session: { ...sessionRecord, notes: state.notes, revision: 's2' } } }); }
      if (path.endsWith('/data')) { state.deleted = true; return route.fulfill({ json: { schemaVersion: '1.0', campaignId: 'autumn', testerId: 'tester-a', deleted: true } }); }
      return route.fulfill({ json: { schemaVersion: '1.0', campaign: currentCampaign } });
    }
    if (path.endsWith('/download')) return route.fulfill({ contentType: 'application/x-spark-sampler', headers: { 'Content-Disposition': 'attachment; filename="spark-profile.sparkprofile"' }, body: Buffer.from([0, 1, 2, 3, 255]) });
    if (path.includes('/artifacts/')) return route.fulfill({ json: artifact });
    if (path.endsWith('/history')) {
      const selected = path.includes('tester-b') ? 'tester-b' : 'tester-a'; state.profile = selected;
      return route.fulfill({ json: { schemaVersion: '1.0', testerId: selected, groups: [{ campaign: currentCampaign, tester: { ...currentTester, id: selected, label: selected === 'tester-a' ? 'Alex' : 'Bea', permission: selected === 'tester-a' ? state.permission : 'allowed' }, sessions: state.deleted && selected === 'tester-a' ? [] : [{ ...sessionRecord, id: selected === 'tester-a' ? 'session-a' : 'session-b', testerId: selected, notes: selected === 'tester-a' ? state.notes : 'Bea private note', sparkStatus: options.spark ?? 'unavailable', artifacts: options.spark === 'saved' ? [...sessionRecord.artifacts, { id: 'spark-a', kind: 'spark', scope: 'client', capturedAt, durationSeconds: 120, bytes: 5, redacted: false }] : sessionRecord.artifacts }] }], nextCursor: null } });
    }
    if (path.endsWith('/playtests')) return route.fulfill({ json: { schemaVersion: '1.0', campaigns: [currentCampaign], nextCursor: null } });
    return route.fulfill({ json: { schemaVersion: '1.0', campaign: currentCampaign, testers: [currentTester, { ...currentTester, id: 'tester-b', label: 'Bea', permission: 'allowed' }], nextCursor: null } });
  });
  return state;
}
async function openHistory(page: Page) {
  await page.goto('/admin/playtests/');
  await page.getByRole('button', { name: 'Open Autumn playtest', exact: true }).click();
  await page.getByRole('button', { name: 'History for Alex', exact: true }).click();
}

test('collection distinguishes waiting, acknowledged recording and stop requested; duplicate clicks submit once', async ({ page }) => {
  const state = await fixtures(page); await openHistory(page);
  await expect(page.locator('[data-observed-state]').first()).toHaveText('Waiting for game');
  state.acknowledged = true; await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Open Autumn playtest', exact: true }).click(); await page.getByRole('button', { name: 'History for Alex', exact: true }).click();
  await expect(page.locator('[data-observed-state]').last()).toHaveText('Recording');
  const toggle = page.getByRole('switch', { name: 'Collect playtest diagnostics', exact: true });
  await toggle.focus(); await page.keyboard.press('Space'); await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked(); expect(state.writes).toBe(1);
  await expect(page.locator('[data-observed-state]').first()).toHaveText('Stop requested');
  await page.clock.fastForward(61000); await expect(page.locator('[data-observed-state]').first()).toHaveText('Stopped');
});
test('histories separate testers and artifact kinds; logs stay text and Spark absence is explicit', async ({ page }) => {
  await fixtures(page); await openHistory(page);
  for (const heading of ['Logs', 'Crash reports', 'Spark recordings', 'Session details']) await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(page.getByText('Alex private note', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Staff notes')).toHaveValue('Alex private note');
  await expect(page.getByText('Spark is unavailable in this session.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View redacted log' }).click();
  await expect(page.locator('[data-log-text]')).toHaveText(artifact.content); expect(await page.locator('[data-log-text] script').count()).toBe(0);
  await page.getByRole('button', { name: 'History for Bea', exact: true }).click();
  await expect(page.getByLabel('Staff notes')).toHaveValue('Bea private note'); await expect(page.locator('[data-log-text]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).toBe('{}');
});
test('private Spark downloads preserve a real profile file', async ({ page }) => {
  await fixtures(page, { spark: 'saved' }); await openHistory(page);
  const pending = page.waitForEvent('download'); await page.getByRole('link', { name: 'Download client .sparkprofile' }).click();
  const download = await pending; expect(download.suggestedFilename()).toBe('spark-a.sparkprofile');
});
test('busy Spark, empty crash reports and manual launch support stay understandable', async ({ page }) => {
  await fixtures(page, { spark: 'busy' }); await openHistory(page);
  await expect(page.getByText('Spark is busy with another recording.', { exact: true })).toBeVisible();
  await expect(page.getByText('No crash report was uploaded.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Help when the game cannot launch' })).toBeVisible();
});
test('expired staff access clears private histories and ignores late results', async ({ page }) => {
  const state = await fixtures(page); await openHistory(page); await page.getByRole('button', { name: 'View redacted log' }).click();
  state.revoked = true; await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('[data-authoring-workspace]')).toBeHidden(); expect(await page.content()).not.toContain('Alex private note'); await expect(page.locator('[data-log-text]')).toHaveCount(0);
  await expect(page.locator('[data-authoring-message]')).not.toContainText('private-backend-stack');
});
test('nonstaff and missing backend cannot operate a fake dashboard', async ({ page }) => {
  await fixtures(page, { role: 'moderator' }); await page.goto('/admin/playtests/'); await expect(page.locator('[data-authoring-message]')).toContainText('not enabled'); await expect(page.locator('[data-authoring-workspace]')).toBeHidden();
  await page.unrouteAll(); await fixtures(page, { unavailable: true }); await page.goto('/admin/playtests/');
  await expect(page.locator('[data-authoring-message]')).toContainText('unavailable'); await expect(page.locator('[data-authoring-workspace]')).toBeHidden();
});
test('private invitations expire, remain out of storage, and the page supports keyboard and mobile', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixtures(page); await openHistory(page);
  await page.getByLabel('Tester name').fill('New tester'); await page.getByRole('button', { name: 'Create private invitation' }).click();
  await expect(page.getByLabel('Private invitation link')).toHaveValue(/\/playtest\/#/); await expect(page.locator('[data-invitation]')).toContainText('Expires');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).toBe('{}');
  await page.getByRole('button', { name: 'Clear invitation from this page' }).click();
  await page.getByLabel('Staff notes').fill('Review the launch delay.'); await page.getByRole('button', { name: 'Save staff notes' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Staff notes')).toHaveValue('Review the launch delay.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('playtests-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('playtests-mobile.png'), fullPage: true }); expect(errors).toEqual([]);
});
test('per-tester pause, notes, revocation and retained-data deletion stay separate', async ({ page }) => {
  const state = await fixtures(page); await openHistory(page);
  const permission = page.getByLabel('Collection permission for Alex in Autumn playtest');
  await permission.selectOption('paused'); await expect(permission).toHaveValue('paused');
  await expect(page.getByRole('switch', { name: 'Collect playtest diagnostics', exact: true })).toBeChecked();
  page.on('dialog', dialog => dialog.accept());
  await permission.selectOption('revoked'); await expect(permission).toBeDisabled();
  await page.getByRole('button', { name: 'Delete retained data for Alex in Autumn playtest' }).click();
  await expect(page.getByText('No sessions have been uploaded for this playtest.', { exact: true })).toBeVisible();
  expect(state.lastMutation).toMatchObject({ revision: 't1', confirmDelete: true });
  await page.getByRole('button', { name: 'History for Bea', exact: true }).click(); await expect(page.getByLabel('Staff notes')).toHaveValue('Bea private note');
});
test('switching with an expired session clears the private page without confirming a change', async ({ page }) => {
  const state = await fixtures(page); await openHistory(page); state.revoked = true;
  await page.getByRole('switch', { name: 'Collect playtest diagnostics', exact: true }).click();
  await expect(page.locator('[data-authoring-workspace]')).toBeHidden(); expect(state.collect).toBe(true);
  await expect(page.locator('[data-authoring-message]')).toContainText('Sign in again');
});
test('a backend marking text unredacted cannot display it as a private log', async ({ page }) => {
  await fixtures(page); await openHistory(page);
  await page.route('**/artifacts/log-a', route => route.fulfill({ json: { ...artifact, redacted: false, content: 'unredacted-private-token' } }));
  await page.getByRole('button', { name: 'View redacted log' }).click(); await expect(page.locator('[data-authoring-message]')).toContainText('unsupported response');
  await expect(page.locator('[data-log-text]')).toHaveCount(0); expect(await page.content()).not.toContain('unredacted-private-token');
});
test('returning testers use an explicit profile link in private invitations', async ({ page }) => {
  const state = await fixtures(page); await openHistory(page);
  await page.getByLabel('Existing tester (optional)').selectOption('tester-a');
  await expect(page.getByLabel('Tester name')).toHaveValue('Alex');
  await page.getByRole('button', { name: 'Create private invitation' }).click(); await expect(page.getByLabel('Private invitation link')).toBeVisible();
  expect(state.lastMutation).toMatchObject({ testerId: 'tester-a', testerLabel: 'Alex' });
});
test('ambiguous writes reuse the request key; stale records require refresh', async ({ page }) => {
  const state = await fixtures(page); await openHistory(page); state.failed = true;
  await page.getByRole('switch', { name: 'Collect playtest diagnostics', exact: true }).click();
  await expect(page.locator('[data-authoring-message]')).toContainText('could not be confirmed');
  await page.getByRole('switch', { name: 'Collect playtest diagnostics', exact: true }).click();
  await expect.poll(() => state.keys.length).toBe(2); expect(state.keys[0]).toBe(state.keys[1]);
  state.failed = false; await page.route('**/collection', route => route.fulfill({ status: 409, json: {} }));
  await page.getByRole('switch', { name: 'Collect playtest diagnostics', exact: true }).click(); await expect(page.locator('[data-authoring-message]')).toContainText('Refresh');
});
test('tester invitation guide keeps the code private and supports enrollment without a gated download', async ({ page }) => {
  const calls: string[] = []; page.on('request', request => calls.push(request.url()));
  await page.goto('/playtest/#invitation=private_invitation_code_12345678901234567890&api=https%3A%2F%2Fdiagnostics.example.com');
  await expect(page.getByRole('heading', { name: 'Join an invited playtest' })).toBeVisible();
  await expect(page.getByLabel('Private invitation code')).toHaveValue('private_invitation_code_12345678901234567890');
  await expect(page).toHaveURL(/\/playtest\/$/);
  expect(calls.some(value => value.includes('private_invitation_code'))).toBe(false);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).toBe('{}');
  await expect(page.getByText('Stop and leave', { exact: false })).toBeVisible();
});
