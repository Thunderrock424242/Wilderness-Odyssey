import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { getSiteUrl } from './scripts/deployment-config.mjs';

const site = getSiteUrl();
export default defineConfig({
  site, base: '/', output: 'static', trailingSlash: 'always',
  integrations: [sitemap({ filter: page => !page.endsWith('.html') && !page.endsWith('/404/') && !page.endsWith('/login/') && !page.includes('/admin/') })],
});
