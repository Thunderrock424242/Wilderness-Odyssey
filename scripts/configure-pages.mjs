import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { deploymentEnvironment, requireDeploymentSettings } from './deployment-config.mjs';

try {
  if (!process.env.DEPLOY_ENVIRONMENT) throw new Error('DEPLOY_ENVIRONMENT is required: choose production or preview.');
  const environment = deploymentEnvironment();
  const settings = requireDeploymentSettings({ environment });
  const site = new URL(settings.SITE_URL);
  let revision;
  try {
    revision = JSON.parse(readFileSync('dist/revision.json', 'utf8'));
  } catch {
    throw new Error('Could not read dist/revision.json. Build or download the tested Pages artifact before preparing deployment.');
  }
  if (revision.siteOrigin !== site.origin) throw new Error('The tested artifact was built for a different canonical origin. Use the same SITE_URL in config/deployment.jsonc and any GitHub variable overrides, then rebuild.');
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const { SITE_URL, CLOUDFLARE_PAGES_PROJECT, ...vars } = settings;
  vars.ENVIRONMENT = environment;
  if (vars.STAFF_AUTH_MODE !== 'discord') {
    vars.DISCORD_REDIRECT_URI = '';
    vars.DISCORD_GUILD_ID = '';
  }
  if (environment !== 'preview') vars.PREVIEW_VERIFY_SERVICE_ID = '';
  config.name = CLOUDFLARE_PAGES_PROJECT;
  config.env[environment].vars = vars;
  writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, 'CLOUDFLARE_PAGES_PROJECT=' + CLOUDFLARE_PAGES_PROJECT + '\n');
  console.log('Prepared ' + environment + ' Pages configuration from config/deployment.jsonc and nonempty environment overrides; secrets remain in Pages bindings.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
