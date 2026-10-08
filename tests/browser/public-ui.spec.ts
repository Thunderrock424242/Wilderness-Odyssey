import { expect, test } from '@playwright/test';

test('terminal completes a prefix and lets Tab and Shift+Tab leave the input', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'BUNKER_OS command' });
  await input.fill('hel');
  await input.press('Tab');
  await expect(input).toHaveValue('help');
  await expect(input).toBeFocused();
  await input.press('Tab');
  await expect(page.locator('[data-terminal-form] button')).toBeFocused();
  for (const value of ['', 'no-such-command']) {
    await input.fill(value);
    await input.press('Tab');
    await expect(page.locator('[data-terminal-form] button')).toBeFocused();
  }
  await input.fill('hel');
  await input.press('Shift+Tab');
  await expect(page.locator('[data-terminal-output]')).toBeFocused();
  await expect(input).toHaveValue('hel');
});

for (const width of [320, 390]) {
  test(`survivor logs fit a ${width}px viewport without losing redactions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/logs/');
    await page.locator('.survivor-log').last().scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('.survivor-log__body').filter({ hasText: '████' })).toBeVisible();
  });
}

for (const path of ['/features/', '/blog/', '/devlogs/', '/news/', '/support/troubleshooting/']) {
  for (const width of [320, 390, 1440]) {
    test(`${path} title wraps between words at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const splitWords = await page.locator('.page-title').evaluate((heading) => {
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        const split: string[] = [];
        while (walker.nextNode()) {
          const node = walker.currentNode;
          for (const match of node.textContent?.matchAll(/\S+/g) ?? []) {
            const range = document.createRange();
            range.setStart(node, match.index!);
            range.setEnd(node, match.index! + match[0].length);
            const rows = new Set([...range.getClientRects()].map(rect => Math.round(rect.top)));
            const bounds = heading.getBoundingClientRect();
            if (rows.size > 1 || [...range.getClientRects()].some(rect => rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) split.push(match[0]);
          }
        }
        return split;
      });
      expect(splitWords).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}

for (const width of [901, 1024, 1280, 1440]) {
  test(`navigation links stay on screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await toggle.isVisible()) await toggle.click();
    const bounds = await page.locator('.n-links a').evaluateAll(links => links.map(link => {
      const rect = link.getBoundingClientRect();
      return { text: link.textContent, left: rect.left, right: rect.right, height: rect.height };
    }));
    for (const link of bounds) {
      expect(link.left, link.text ?? '').toBeGreaterThanOrEqual(0);
      expect(link.right, link.text ?? '').toBeLessThanOrEqual(width);
      expect(link.height, link.text ?? '').toBeGreaterThanOrEqual(44);
    }
  });
}

test('mobile menu follows reading order and restores focus on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.locator('.n-links a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.n-links')).toBeHidden();
  await toggle.click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(toggle).toBeHidden();
  await expect(page.locator('.n-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.n-links')).toBeVisible();
  await expect(page.locator('.n-links a').first()).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeFocused();
  await expect(page.locator('.n-links')).toBeHidden();
});

for (const [path, selector, countSelector, itemsSelector] of [
  ['/transmissions/', '[data-filter-query]', '[data-filter-count]', '[data-filter-item]'],
  ['/roadmap/', '[data-roadmap-query]', '[data-roadmap-count]', '[data-roadmap-item]'],
]) {
  test(`${path} search survives Enter and clears correctly`, async ({ page }) => {
    await page.goto(path);
    const initialCount = await page.locator(countSelector).innerText();
    const query = page.locator(selector);
    await query.fill('water');
    const filteredCount = await page.locator(countSelector).innerText();
    expect(Number(filteredCount)).toBeGreaterThan(0);
    expect(Number(filteredCount)).toBeLessThan(Number(initialCount));
    await query.press('Enter');
    await expect(query).toHaveValue('water');
    await expect(page.locator(countSelector)).toHaveText(filteredCount);
    await expect(page.locator(`${itemsSelector}:not([hidden])`)).toHaveCount(Number(filteredCount));
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(query).toHaveValue('');
    await expect(page.locator(countSelector)).toHaveText(initialCount);
  });
}

test('reduced motion leaves the homepage scroll link clickable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('.scroll-cue').click({ timeout: 5000 });
  await expect(page).toHaveURL(/#origin$/);
});

test('an unconfigured status service explains setup without claiming an outage', async ({ page }) => {
  await page.route('**/api/public/v1/status', route => route.fulfill({ status: 503, json: { code: 'NOT_CONFIGURED', message: 'This service has not been connected yet.' } }));
  await page.goto('/status/');
  await expect(page.locator('[data-status-detail]')).toContainText('being set up');
  await expect(page.locator('[data-status-minecraft]')).toHaveText('Unavailable');
  await expect(page.locator('[data-status-aether]')).toHaveText('Unavailable');
});

test('a disconnected status service preserves the last confirmed measurement time', async ({ page }) => {
  let connected = true;
  const observedAt = new Date().toISOString();
  const snapshot = {
    schemaVersion: '1.0', observedAt, staleAfterSeconds: 90,
    minecraft: { state: 'online', players: { online: 3, max: 20 }, tps: 19.8, mspt: 28, minecraftVersion: '1.21.1', modpackVersion: '0.1.0', loader: 'NeoForge' },
    aether: { ollama: 'ready', inference: 'ready', requestsPaused: false, responseLatency: null },
    maintenance: { active: false, message: '', startsAt: null, endsAt: null, services: [] }, incidents: [],
  };
  await page.route('**/api/public/v1/status', route => route.fulfill(connected ? { json: snapshot } : { status: 503, json: { code: 'NOT_CONFIGURED' } }));
  await page.goto('/status/');
  await expect(page.locator('[data-status-minecraft]')).toHaveText('online');
  const detail = await page.locator('[data-status-detail]').innerText();
  const observedTime = detail.replace('Updated ', '');
  connected = false;
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.locator('[data-status-detail]')).toContainText('Last confirmed ' + observedTime);
  await expect(page.locator('[data-status-minecraft]')).toHaveText('Last known: online');
});

test('essential navigation, metadata, and terminal copy use readable type sizes', async ({ page }) => {
  await page.goto('/');
  const smallText = await page.locator('.n-links a, .tn, .terminal-output p, .terminal-input input, .terminal-input button, .fl a, .fc').evaluateAll(elements =>
    elements.filter(element => parseFloat(getComputedStyle(element).fontSize) < 12.8).map(element => element.textContent),
  );
  expect(smallText).toEqual([]);
});

test('long titles stay inside the page when web fonts are unavailable', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/support/troubleshooting/');
  const clipped = await page.locator('.page-title').evaluate(heading => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    const bounds = heading.getBoundingClientRect();
    return [...range.getClientRects()].some(rect => rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
  });
  expect(clipped).toBe(false);
});

test('gallery filter has no stray text and describes pending records honestly', async ({ page }) => {
  await page.goto('/gallery/');
  const stray = await page.locator('[data-gallery]').evaluate(gallery =>
    [...gallery.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent?.trim()).filter(Boolean),
  );
  expect(stray).toEqual([]);
  await page.goto('/');
  await expect(page.locator('.hub-card[href="/gallery/"] .hub-card-copy')).toContainText('pending');
});

for (const width of [390, 1440]) {
  test(`content and primary navigation work without JavaScript at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/');
    await expect(page.locator('.n-links a').first()).toBeVisible();
    const origin = page.locator('#origin .rx').first();
    await origin.scrollIntoViewIfNeeded();
    expect(await origin.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
    expect(await page.locator('body').evaluate(element => getComputedStyle(element).cursor)).not.toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.locator('.n-links a[href="/gallery/"]').click();
    await expect(page).toHaveURL(/\/gallery\/$/);
    await context.close();
  });
}
