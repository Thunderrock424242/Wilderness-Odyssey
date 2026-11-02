import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const user = { id: '234567890123456789', displayName: 'Survivor' };
const stats = { recordedSeconds: 5400, sessions: 3, unknownDurationSessions: 1 };
test('public navigation exposes sign-in on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Playtester sign-in' })).toHaveAttribute('href', '/api/participant/start');
});
test('tester home shows own recorded stats, missing durations and history', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/participant/**', route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    const json = action === 'session' ? { schemaVersion: '1.0', user, guildId: '123456789012345678', expiresAt: new Date(Date.now()+800000).toISOString(), csrfToken: 'fixture' }
      : action === 'history' ? { schemaVersion: '1.0', userId: user.id, sessions: [{ id: 's1', campaignId: 'alpha', title: 'Alpha', build: '0.2', startedAt: '2026-11-01T12:00:00Z', durationSeconds: null, state: 'interrupted' }], nextCursor: null }
      : { schemaVersion: '1.0', user, stats, campaigns: [{ id: 'alpha', title: 'Alpha', claimedAt: '2026-11-01T10:00:00Z', collectionActive: false, instructions: 'Use the invited build.', announcement: 'Welcome back.', tasks: ['Explore the rift'], stats }], invitations: [] };
    return route.fulfill({ json });
  });
  await page.goto('/playtester/');
  await expect(page.getByRole('heading', { name: 'Welcome home, Survivor' })).toBeVisible();
  await expect(page.locator('[data-tester-stats]')).toContainText('1h 30m');
  await expect(page.locator('[data-tester-history]')).toContainText('Unavailable');
  await expect(page.getByText('Explore the rift')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('tester-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('tester-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
test('claim clears the private fragment and sends it only after explicit acceptance', async ({ page }) => {
  let claims = 0;
  await page.route('**/api/participant/session', route => route.fulfill({ json: { schemaVersion: '1.0', user, guildId: '123456789012345678', expiresAt: new Date(Date.now()+800000).toISOString(), csrfToken: 'fixture' } }));
  await page.route('**/api/participant/claim', route => {
    claims++; expect(route.request().postDataJSON()).toEqual({ token: 'a'.repeat(43) });
    return route.fulfill({ json: { schemaVersion: '1.0', claimed: true, campaignId: 'alpha' } });
  });
  await page.goto('/playtester/claim/#invitation=' + 'a'.repeat(43));
  await expect(page).toHaveURL(/\/playtester\/claim\/$/);
  await expect(page.getByRole('button', { name: 'Claim my invitation' })).toBeEnabled();
  expect(claims).toBe(0);
  await page.getByRole('button', { name: 'Claim my invitation' }).click();
  await expect(page.getByRole('status')).toContainText('claimed'); expect(claims).toBe(1);
  expect(await page.evaluate(() => sessionStorage.length + localStorage.length)).toBe(0);
});

test('tester home handles sign-in required and offline responses without showing private workspace', async ({ page }) => {
  await page.route('**/api/participant/session', route => route.fulfill({ status:401,json:{ code:'AUTH_REQUIRED' } }));
  await page.goto('/playtester/');
  await expect(page.locator('[data-tester-signin]')).toBeVisible();
  await expect(page.locator('[data-tester-workspace]')).toBeHidden();
  await page.unroute('**/api/participant/session');
  await page.route('**/api/participant/session', route => route.fulfill({ status:503,json:{ code:'UNAVAILABLE' } }));
  await page.getByRole('button',{ name:'Refresh',exact:true }).click();
  await expect(page.getByRole('status')).toContainText('temporarily unavailable');
  await expect(page.locator('[data-tester-workspace]')).toBeHidden();
});
test('expired and wrong-account invitations show safe claim errors', async ({ page }) => {
  await page.route('**/api/participant/session', route => route.fulfill({ json:{ schemaVersion:'1.0',user,guildId:'123456789012345678',expiresAt:new Date(Date.now()+800000).toISOString(),csrfToken:'fixture' } }));
  let status = 410;
  await page.route('**/api/participant/claim', route => route.fulfill({ status,json:{ code:'DENIED' } }));
  await page.goto('/playtester/claim/#invitation=' + 'a'.repeat(43));
  await page.getByRole('button',{name:'Claim my invitation'}).click();
  await expect(page.getByRole('status')).toContainText('expired');
  status = 403;
  await page.getByRole('button',{name:'Claim my invitation'}).click();
  await expect(page.getByRole('status')).toContainText('does not have access');
});
test('staff invitation form reports failed DMs with a validated private fallback', async ({ page }) => {
  await page.route('**/api/admin/v1/session', route => route.fulfill({ json:{ schemaVersion:'1.0',user:{...user,role:'administrator'},capabilities:['server:write'],csrfToken:'fixture',authMethod:'discord' } }));
  await page.route('**/api/admin/v1/participant-staff/invite', route => {
    expect(route.request().postDataJSON()).toEqual({ discordUserId:user.id,campaignId:'alpha',expiresInHours:24 });
    return route.fulfill({ json:{ schemaVersion:'1.0',invitationId:'invite-1',expiresAt:new Date(Date.now()+86400000).toISOString(),delivery:'failed',claimUrl:'http://127.0.0.1:4173/playtester/claim/#invitation=' + 'a'.repeat(43) } });
  });
  await page.goto('/admin/playtester-access/');
  await expect(page.locator('[data-authoring-workspace]')).toBeVisible();
  const form = page.locator('[data-member-invite]');
  await form.getByLabel('Discord account ID').fill(user.id);
  await form.getByLabel('Existing playtest campaign ID').fill('alpha');
  await form.getByRole('button').click();
  await expect(page.locator('[data-invite-receipt]')).toContainText('could not be confirmed');
  await expect(page.locator('[data-invite-fallback]')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});


test('unknown playtime is shown as unavailable rather than zero hours', async ({ page }) => {
  const missing = { recordedSeconds:0,sessions:2,unknownDurationSessions:2 };
  await page.route('**/api/participant/**', route => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    return route.fulfill({ json:action === 'session' ? { schemaVersion:'1.0',user,guildId:'123456789012345678',expiresAt:new Date(Date.now()+800000).toISOString(),csrfToken:'fixture' }
      : action === 'history' ? { schemaVersion:'1.0',userId:user.id,sessions:[],nextCursor:null }
      : { schemaVersion:'1.0',user,stats:missing,campaigns:[],invitations:[] } });
  });
  await page.goto('/playtester/');
  await expect(page.locator('[data-tester-stats]')).toContainText('Unavailable');
  await expect(page.locator('[data-tester-stats]')).not.toContainText('0h 0m');
});
