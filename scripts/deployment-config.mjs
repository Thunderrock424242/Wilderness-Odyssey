import { readFileSync } from 'node:fs';

const configFile = 'config/deployment.jsonc';
const defaults = {
  SITE_URL: '',
  CLOUDFLARE_PAGES_PROJECT: '',
  STAFF_AUTH_MODE: 'discord',
  DISCORD_GUILD_ID: '',
  DISCORD_REDIRECT_URI: '',
  ALLOWED_HOSTS: '',
  ACCESS_TEAM_DOMAIN: '',
  ACCESS_AUDIENCE: '',
  PUBLIC_STATUS_URL: '',
  KINETIC_ADMIN_ORIGIN: '',
  PREVIEW_VERIFY_SERVICE_ID: '',
};

function configurationError(messages) {
  return new Error('Fix deployment settings in ' + configFile + ':\n' + messages.map(message => '- ' + message).join('\n'));
}

// Match quoted strings before comments so https:// and comment-like URL text survive.
// No eval or application dependencies: deployment runs in an isolated Node job.
function parseConfig(source) {
  const withoutComments = source.replace(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    token => token.startsWith('"') ? token : token.replace(/[^\r\n]/g, ' '));
  const withoutTrailingCommas = withoutComments.replace(/"(?:\\[\s\S]|[^"\\])*"|,\s*(?=[}\]])/g,
    token => token.startsWith('"') ? token : token.slice(1));
  try {
    return JSON.parse(withoutTrailingCommas);
  } catch {
    throw configurationError(['Invalid JSON with comments. Check quotes, commas, and closing braces.']);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deploymentEnvironment(env = process.env) {
  const environment = env.DEPLOY_ENVIRONMENT?.trim() || 'production';
  if (!['production', 'preview'].includes(environment)) throw configurationError(['DEPLOY_ENVIRONMENT must be production or preview.']);
  return environment;
}

export function readDeploymentSettings({ env = process.env, environment = deploymentEnvironment(env), configPath = configFile } = {}) {
  if (!['production', 'preview'].includes(environment)) throw configurationError(['Environment must be production or preview.']);
  let source;
  try {
    source = readFileSync(configPath, 'utf8');
  } catch {
    throw configurationError(['Could not read the configuration file. Run commands from the website repository root.']);
  }
  const config = parseConfig(source);
  if (!isRecord(config)) throw configurationError(['The file must contain an object with shared, production, and preview sections.']);
  const errors = [];
  for (const section of Object.keys(config)) {
    if (!['shared', 'production', 'preview'].includes(section)) errors.push('Unknown section: ' + section + '. Use shared, production, or preview.');
  }
  for (const section of ['shared', 'production', 'preview']) {
    if (!isRecord(config[section])) {
      errors.push(section + ' must be an object of settings.');
      continue;
    }
    for (const [name, value] of Object.entries(config[section])) {
      if (!Object.hasOwn(defaults, name)) errors.push('Unknown setting ' + section + '.' + name + '. Check the spelling; secret values belong in GitHub or Cloudflare secrets.');
      else if (typeof value !== 'string') errors.push(section + '.' + name + ' must be a string inside double quotes (including IDs).');
    }
  }
  if (errors.length) throw configurationError(errors);
  const selected = { ...defaults, ...config.shared, ...config[environment] };
  for (const name of Object.keys(defaults)) {
    const fileValue = selected[name].trim();
    // Explicitly disabled staff access cannot be re-enabled by stale CI vars.
    selected[name] = name === 'STAFF_AUTH_MODE' && fileValue === 'disabled'
      ? fileValue
      : env[name]?.trim() || fileValue;
  }
  return selected;
}

function httpsUrl(value, originOnly = false) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || /[\r\n\\]/.test(value)) return null;
    if (originOnly && (url.pathname !== '/' || url.search)) return null;
    return url;
  } catch {
    return null;
  }
}

export function validateDeploymentSettings(settings, environment) {
  const errors = [];
  const requireValue = (name, valid, explanation) => {
    if (!settings[name] || !valid) errors.push(name + ': ' + explanation);
  };
  if (!['production', 'preview'].includes(environment)) errors.push('Environment must be production or preview.');
  const site = httpsUrl(settings.SITE_URL, true);
  requireValue('SITE_URL', site, 'enter the approved HTTPS website origin, without a path, credentials, port, query, or fragment.');
  requireValue('CLOUDFLARE_PAGES_PROJECT', /^[a-z0-9-]+$/.test(settings.CLOUDFLARE_PAGES_PROJECT), 'enter the exact lowercase Cloudflare Pages project name.');
  requireValue('STAFF_AUTH_MODE', ['disabled', 'discord', 'access'].includes(settings.STAFF_AUTH_MODE), 'choose disabled for the public website, discord, or access.');
  const staffEnabled = settings.STAFF_AUTH_MODE !== 'disabled';
  const accessRequired = staffEnabled || environment === 'preview';
  if (settings.STAFF_AUTH_MODE === 'discord') {
    requireValue('DISCORD_GUILD_ID', /^\d{17,22}$/.test(settings.DISCORD_GUILD_ID), 'enter your 17-22 digit Discord server ID in quotes, matching backend GUILD_ID. Enable Developer Mode, then right-click your server -> Copy Server ID.');
    const callback = httpsUrl(settings.DISCORD_REDIRECT_URI);
    requireValue('DISCORD_REDIRECT_URI', callback && callback.pathname === '/api/auth/discord/callback' && !callback.search,
      'enter the registered HTTPS callback ending in /api/auth/discord/callback, without credentials, port, query, or fragment.');
    if (environment === 'production' && site && callback && site.origin !== callback.origin) errors.push('DISCORD_REDIRECT_URI must use the same origin as SITE_URL in production.');
  }
  const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  const hosts = settings.ALLOWED_HOSTS.split(',').map(value => value.trim());
  if (accessRequired || settings.ALLOWED_HOSTS) requireValue('ALLOWED_HOSTS', hosts.every(host => hostname.test(host) || (environment === 'preview' && host === '*.' + settings.CLOUDFLARE_PAGES_PROJECT + '.pages.dev')),
    'enter comma-separated hostnames without schemes or paths; *.PROJECT.pages.dev is permitted only in preview.');
  const team = httpsUrl(settings.ACCESS_TEAM_DOMAIN, true);
  if (accessRequired || settings.ACCESS_TEAM_DOMAIN) requireValue('ACCESS_TEAM_DOMAIN', team && /^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team.hostname), 'enter your Access team HTTPS origin, e.g. https://TEAM.cloudflareaccess.com (required for protected previews and connected staff modes).');
  if (accessRequired || settings.ACCESS_AUDIENCE) requireValue('ACCESS_AUDIENCE', !/[\r\n]/.test(settings.ACCESS_AUDIENCE), 'enter the Access application audience (AUD) tag.');
  if (staffEnabled || settings.PUBLIC_STATUS_URL) requireValue('PUBLIC_STATUS_URL', httpsUrl(settings.PUBLIC_STATUS_URL), 'enter the sanitized public-status HTTPS endpoint, including its path and without credentials.');
  if (staffEnabled || settings.KINETIC_ADMIN_ORIGIN) requireValue('KINETIC_ADMIN_ORIGIN', httpsUrl(settings.KINETIC_ADMIN_ORIGIN, true), 'enter the approved backend HTTPS origin, without a path, credentials, port, query, or fragment.');
  if (environment === 'preview') requireValue('PREVIEW_VERIFY_SERVICE_ID', !/[\r\n]/.test(settings.PREVIEW_VERIFY_SERVICE_ID), "enter the staging verifier service token's exact signed common_name identity, not its secret.");
  return errors;
}

export function requireDeploymentSettings(options = {}) {
  const environment = options.environment ?? deploymentEnvironment(options.env);
  const settings = readDeploymentSettings({ ...options, environment });
  const errors = validateDeploymentSettings(settings, environment);
  if (errors.length) throw configurationError(errors);
  return settings;
}

export function getSiteUrl(options = {}) {
  return readDeploymentSettings(options).SITE_URL || 'http://localhost:4321';
}
