import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL || 'http://localhost:4321';
export default defineConfig({
  site, base: '/', output: 'static', trailingSlash: 'always',
  integrations: [sitemap({ filter: page => !page.endsWith('.html') && !page.endsWith('/404/') && !page.includes('/admin/') })],
});