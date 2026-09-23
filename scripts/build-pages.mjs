import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync('dist/revision.json', JSON.stringify({ commit, siteOrigin: new URL(process.env.SITE_URL || 'http://localhost:4321').origin, builtAt: new Date().toISOString() }) + '\n');
execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'pages', 'functions', 'build', 'functions', '--outdir', 'dist/_worker.js', '--output-routes-path', 'dist/_routes.json'], { stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
for (const file of readdirSync('dist/_astro')) {
  if (!file.endsWith('.js')) continue;
  const source = readFileSync(join('dist/_astro', file), 'utf8');
  if (/KINETIC_ACCESS_CLIENT_SECRET|KINETIC_ADMIN_ORIGIN|CSRF_SECRET|X-WO-User-Assertion/.test(source)) throw new Error('Server-only integration code leaked into a browser bundle: ' + file);
}
console.log('Compiled Pages Functions and checked browser bundles for server-only integration code.');