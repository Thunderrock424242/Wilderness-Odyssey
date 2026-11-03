import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('playtester layout remains styled under its deployed Content Security Policy', async ({ page }) => {
  await page.route('**/api/participant/**', route => route.fulfill({status:401,json:{code:'AUTH_REQUIRED'}}));
  await page.route('**/playtester/', async route => {
    const response = await route.fetch();
    await route.fulfill({response,headers:{...response.headers(),'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self';"}});
  });
  await page.goto('/playtester/');
  await expect(page.locator('.tester-main')).toHaveCSS('padding-left','24px');
  await expect(page.getByRole('navigation',{name:'Member navigation'})).toHaveCSS('display','flex');
});
test('owner guide explains and imports website source after acknowledgement', async ({page}) => {
  let imported = false, calls = 0;
  await page.route('**/api/admin/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/session')) return route.fulfill({json:{schemaVersion:'1.0',user:{id:'owner',displayName:'Owner',role:'administrator'},capabilities:['content:read','content:write'],csrfToken:'csrf',authMethod:'discord'}});
    if (path.endsWith('/source')) { expect(route.request().postDataJSON()).toEqual({acknowledgePublicSource:true}); calls++; imported = true; }
    return route.fulfill({json:{schemaVersion:'1.0',imported,sourceRevision:imported?'a'.repeat(40):null,transmissionCount:imported?9:0,pageCount:imported?3:0,publicationConfigured:false}});
  });
  await page.goto('/admin/help/');
  await expect(page.locator('[data-authoring-workspace]')).toBeVisible();
  const button = page.locator('[data-content-import]');
  await expect(button).toBeDisabled();
  await page.locator('[data-content-import-ack]').check();
  await button.click();
  await expect(page.locator('[data-content-setup]')).toContainText('9');
  expect(calls).toBe(1);
  await expect(button).toBeDisabled();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:test.info().outputPath('admin-guide.png'),fullPage:true});
});
