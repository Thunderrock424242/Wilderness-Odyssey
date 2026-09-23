import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: true, retries: 0,
  use: { headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'ui', testIgnore: 'runtime.spec.ts', use: { baseURL: 'http://127.0.0.1:4173' } },
    { name: 'runtime', testMatch: 'runtime.spec.ts', use: { baseURL: 'http://127.0.0.1:8788' } },
  ],
  webServer: [
    { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
    { command: 'npm run preview:pages -- --port 8788', url: 'http://127.0.0.1:8788', reuseExistingServer: false, timeout: 60000, env: { WRANGLER_SEND_METRICS: 'false' } },
  ],
  reporter: [['list']],
});