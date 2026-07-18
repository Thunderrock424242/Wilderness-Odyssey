import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const base = '/Wilderness-Odyssey/';
const required = [
  'index.html', 'roadmap/index.html', 'features/index.html', 'gallery/index.html', 'news/index.html',
  'devlogs/index.html', 'patches/index.html', 'lore/index.html', 'blog/index.html', 'logs/index.html',
  'transmissions/index.html', 'roadmap.html', 'gallery.html', 'news.html', 'patch-notes.html', 'patches.html',
  'logs.html', 'blog.html', 'rss.xml', 'sitemap-index.xml', 'images/logo.png',
];
const errors = [];

for (const path of required) {
  if (!existsSync(join(dist, path))) errors.push(`Missing required build output: ${path}`);
}

const files = existsSync(dist) ? walk(dist) : [];
const htmlFiles = files.filter((file) => extname(file) === '.html');
const linkPattern = /(?:href|src)="([^"]+)"/g;

for (const file of htmlFiles) {
  const source = readFileSync(file, 'utf8');
  if (/Example (?:News|Blog|Development|Patch|Recovered|Priority)/.test(source)) {
    errors.push(`Draft example leaked into production: ${relative(dist, file)}`);
  }
  for (const [, value] of source.matchAll(linkPattern)) {
    if (/^(?:https?:|mailto:|tel:|data:|#)/.test(value)) continue;
    if (value.startsWith('/') && !value.startsWith(base)) {
      errors.push(`Non-base-aware URL in ${relative(dist, file)}: ${value}`);
      continue;
    }
    const target = toDistTarget(value, file);
    if (target && !existsSync(target)) errors.push(`Broken local reference in ${relative(dist, file)}: ${value}`);
  }
}

if (errors.length) {
  console.error([...new Set(errors)].map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${htmlFiles.length} HTML files, required routes, GitHub Pages base paths, local links, assets, and draft exclusion.`);
}

function toDistTarget(value, sourceFile) {
  const clean = value.split(/[?#]/)[0];
  if (!clean) return undefined;
  let path;
  if (clean.startsWith(base)) path = clean.slice(base.length);
  else if (clean.startsWith('/')) return undefined;
  else path = relative(dist, resolve(dirname(sourceFile), clean)).replaceAll('\\', '/');
  const absolute = join(dist, path);
  if (/\.[a-z0-9]+$/i.test(path)) return absolute;
  return join(absolute, 'index.html');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
