import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/Wilderness-Odyssey/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        roadmap: resolve(root, 'roadmap.html'),
        gallery: resolve(root, 'gallery.html'),
        news: resolve(root, 'news.html'),
        blog: resolve(root, 'blog.html'),
      },
    },
  },
});
