import { readFileSync, writeFileSync } from 'node:fs';
const environment = process.env.DEPLOY_ENVIRONMENT;
if (!['production', 'preview'].includes(environment ?? '')) throw new Error('Invalid deployment environment.');
const site = new URL(process.env.SITE_URL || '');
if (site.protocol !== 'https:' || site.username || site.password || site.port || site.pathname !== '/' || site.search || site.hash) throw new Error('SITE_URL must be an approved HTTPS origin.');
const revision = JSON.parse(readFileSync('dist/revision.json', 'utf8'));
if (revision.siteOrigin !== site.origin) throw new Error('The tested artifact was built for a different canonical origin. Set the same SITE_URL repository and environment variables before building.');
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const vars = { ENVIRONMENT: environment };
for (const name of ['ALLOWED_HOSTS', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUDIENCE', 'PUBLIC_STATUS_URL', 'KINETIC_ADMIN_ORIGIN']) {
  if (!process.env[name]?.trim()) throw new Error('Missing required environment configuration: ' + name);
  vars[name] = process.env[name].trim();
}
vars.PREVIEW_VERIFY_SERVICE_ID = environment === 'preview' ? process.env.PREVIEW_VERIFY_SERVICE_ID || '' : '';
if (environment === 'preview' && !vars.PREVIEW_VERIFY_SERVICE_ID) throw new Error('Preview verification service identity is missing.');
if (!/^[a-z0-9-]+$/.test(process.env.CLOUDFLARE_PAGES_PROJECT || '')) throw new Error('Invalid Pages project name.');
config.name = process.env.CLOUDFLARE_PAGES_PROJECT;
config.env[environment].vars = vars;
writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
console.log('Prepared environment-specific Pages configuration; secrets remain in Pages bindings.');