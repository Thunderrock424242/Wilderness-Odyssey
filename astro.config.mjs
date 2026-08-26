import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://thunderrock424242.github.io',
  base: '/Wilderness-Odyssey',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith('.html') && !page.includes('/admin/'),
    }),
  ],
});
