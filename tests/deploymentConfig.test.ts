import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repository = resolve('.');
const settings = {
  SITE_URL: 'https://site.example.com',
  CLOUDFLARE_PAGES_PROJECT: 'test-site',
  STAFF_AUTH_MODE: 'discord',
  DISCORD_GUILD_ID: '123456789012345678',
  DISCORD_REDIRECT_URI: 'https://site.example.com/api/auth/discord/callback',
  ALLOWED_HOSTS: 'site.example.com,test-site.pages.dev',
  ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
  ACCESS_AUDIENCE: 'staff-audience',
  PUBLIC_STATUS_URL: 'https://status.example.com/api/status',
  KINETIC_ADMIN_ORIGIN: 'https://backend.example.com',
  PREVIEW_VERIFY_SERVICE_ID: '',
};
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wo-config-'));
  mkdirSync(join(directory, 'config'));
  mkdirSync(join(directory, 'scripts'));
  mkdirSync(join(directory, 'dist'));
  for (const script of ['configure-pages.mjs', 'deployment-config.mjs', 'check-deployment-config.mjs']) {
    if (existsSync(join(repository, 'scripts', script))) copyFileSync(join(repository, 'scripts', script), join(directory, 'scripts', script));
  }
  copyFileSync(join(repository, 'wrangler.jsonc'), join(directory, 'wrangler.jsonc'));
  writeFileSync(join(directory, 'dist/revision.json'), JSON.stringify({ siteOrigin: 'https://site.example.com' }));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function configure(shared: Record<string, unknown> = settings, production = {}, preview = {}) {
  writeFileSync(join(directory, 'config/deployment.jsonc'), JSON.stringify({ shared, production, preview }));
}

function run(script: string, extraEnv: Record<string, string | undefined> = {}, args: string[] = []) {
  const env = { ...process.env };
  for (const key of [...Object.keys(settings), 'DEPLOY_ENVIRONMENT', 'GITHUB_ENV', 'GITHUB_OUTPUT']) delete env[key];
  return spawnSync(process.execPath, [script, ...args], { cwd: directory, env: { ...env, ...extraEnv }, encoding: 'utf8' });
}

function load(expression: string, extraEnv: Record<string, string | undefined> = {}) {
  return run('--input-type=module', extraEnv, ['--eval', `import { readDeploymentSettings, getSiteUrl } from ${JSON.stringify(pathToFileURL(join(repository, 'scripts/deployment-config.mjs')).href)}; console.log(JSON.stringify(${expression}));`]);
}

describe('editable deployment configuration', () => {
  it('prepares Pages using only the editable file', () => {
    configure();
    const result = run('scripts/configure-pages.mjs', { DEPLOY_ENVIRONMENT: 'production', GITHUB_ENV: join(directory, 'github-env') });
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(readFileSync(join(directory, 'wrangler.jsonc'), 'utf8'));
    expect(config.name).toBe('test-site');
    expect(config.env.production.vars).toMatchObject({ DISCORD_GUILD_ID: '123456789012345678', ENVIRONMENT: 'production' });
    expect(config.env.preview.vars.DISCORD_GUILD_ID).toBe('');
    expect(config.env.production.vars).not.toHaveProperty('SITE_URL');
    expect(readFileSync(join(directory, 'github-env'), 'utf8')).toContain('CLOUDFLARE_PAGES_PROJECT=test-site\n');
  });

  it('reads JSON comments and trailing commas without changing URL strings', () => {
    writeFileSync(join(directory, 'config/deployment.jsonc'), `{
      // Your website origin
      "shared": { "SITE_URL": "https://site.example.com", "PUBLIC_STATUS_URL": "https://status.example.com//status?q=/*text*/,}", },
      "production": { /* normal comment */ },
      "preview": {},
    }`);
    const result = load('readDeploymentSettings({ env: {} })');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ SITE_URL: 'https://site.example.com', PUBLIC_STATUS_URL: 'https://status.example.com//status?q=/*text*/,}' });
  });

  it('keeps production and preview overrides separate and ignores blank environment overrides', () => {
    configure(settings, { DISCORD_GUILD_ID: '234567890123456789' }, { DISCORD_GUILD_ID: '345678901234567890' });
    const production = load('readDeploymentSettings()', { DEPLOY_ENVIRONMENT: 'production', DISCORD_GUILD_ID: ' ' });
    const preview = load('readDeploymentSettings()', { DEPLOY_ENVIRONMENT: 'preview' });
    const override = load('readDeploymentSettings()', { DISCORD_GUILD_ID: ' 456789012345678901 ', CSRF_SECRET: 'never-return-this' });
    expect(production.status, production.stderr).toBe(0);
    expect(preview.status, preview.stderr).toBe(0);
    expect(override.status, override.stderr).toBe(0);
    expect(JSON.parse(production.stdout).DISCORD_GUILD_ID).toBe('234567890123456789');
    expect(JSON.parse(preview.stdout).DISCORD_GUILD_ID).toBe('345678901234567890');
    expect(JSON.parse(override.stdout).DISCORD_GUILD_ID).toBe('456789012345678901');
    expect(override.stdout).not.toContain('never-return-this');
  });

  it('reports missing settings together without requiring a build or changing Wrangler', () => {
    configure({});
    rmSync(join(directory, 'dist'), { recursive: true });
    const before = readFileSync(join(directory, 'wrangler.jsonc'), 'utf8');
    const result = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'production']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('config/deployment.jsonc');
    expect(result.stderr).toContain('DISCORD_GUILD_ID');
    expect(result.stderr).toContain('Copy Server ID');
    expect(result.stderr).toContain('SITE_URL');
    expect(result.stderr).toContain('KINETIC_ADMIN_ORIGIN');
    expect(result.stderr).not.toContain('at file:');
    expect(readFileSync(join(directory, 'wrangler.jsonc'), 'utf8')).toBe(before);
  });

  it('accepts a complete production config and requires the preview verification identity only for preview', () => {
    configure(settings, {}, { ALLOWED_HOSTS: '*.test-site.pages.dev' });
    const production = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'production']);
    const preview = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'preview']);
    expect(production.status, production.stderr).toBe(0);
    expect(preview.status).toBe(1);
    expect(preview.stderr).toContain('PREVIEW_VERIFY_SERVICE_ID');
    const complete = run('scripts/check-deployment-config.mjs', { PREVIEW_VERIFY_SERVICE_ID: 'staging-verifier' }, ['--environment', 'preview']);
    expect(complete.status, complete.stderr).toBe(0);
  });

  it('allows explicit Access mode without a Discord callback or guild ID', () => {
    configure({ ...settings, STAFF_AUTH_MODE: 'access', DISCORD_GUILD_ID: '', DISCORD_REDIRECT_URI: '' });
    const result = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'production']);
    expect(result.status, result.stderr).toBe(0);
  });

  it('deploys the public production website without staff, Access, or backend setup', () => {
    configure({ SITE_URL: 'https://site.example.com', CLOUDFLARE_PAGES_PROJECT: 'test-site', STAFF_AUTH_MODE: 'disabled' });
    const checked = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'production']);
    expect(checked.status, checked.stderr).toBe(0);
    const prepared = run('scripts/configure-pages.mjs', { DEPLOY_ENVIRONMENT: 'production' });
    expect(prepared.status, prepared.stderr).toBe(0);
    const vars = JSON.parse(readFileSync(join(directory, 'wrangler.jsonc'), 'utf8')).env.production.vars;
    expect(vars).toMatchObject({ ENVIRONMENT: 'production', STAFF_AUTH_MODE: 'disabled', ALLOWED_HOSTS: 'site.example.com,test-site.pages.dev', KINETIC_ADMIN_ORIGIN: '', PUBLIC_STATUS_URL: '' });
  });

  it.each(['discord', 'access'])(
    'keeps explicitly disabled staff off when a stale environment override selects %s', mode => {
      configure({ SITE_URL: 'https://site.example.com', CLOUDFLARE_PAGES_PROJECT: 'test-site', STAFF_AUTH_MODE: ' disabled ' });
      const extraEnv = { DEPLOY_ENVIRONMENT: 'production', STAFF_AUTH_MODE: mode };
      const checked = run('scripts/check-deployment-config.mjs', extraEnv);
      expect(checked.status, checked.stderr).toBe(0);
      expect(checked.stdout).toContain('Staff access is disabled');
      const prepared = run('scripts/configure-pages.mjs', extraEnv);
      expect(prepared.status, prepared.stderr).toBe(0);
      const vars = JSON.parse(readFileSync(join(directory, 'wrangler.jsonc'), 'utf8')).env.production.vars;
      expect(vars.STAFF_AUTH_MODE).toBe('disabled');
      expect(vars.KINETIC_ADMIN_ORIGIN).toBe('');
    },
  );

  it('permits an explicit environment-section choice to enable staff after shared defaults disable it', () => {
    configure({ ...settings, STAFF_AUTH_MODE: 'disabled' }, { STAFF_AUTH_MODE: 'discord' });
    const result = load('readDeploymentSettings({ env: {} })');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).STAFF_AUTH_MODE).toBe('discord');
  });

  it('keeps previews protected when stale environment settings try to enable disabled staff', () => {
    configure({ SITE_URL: 'https://site.example.com', CLOUDFLARE_PAGES_PROJECT: 'test-site', STAFF_AUTH_MODE: 'disabled' });
    const result = run('scripts/check-deployment-config.mjs', { DEPLOY_ENVIRONMENT: 'preview', STAFF_AUTH_MODE: 'discord' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ACCESS_TEAM_DOMAIN');
    expect(result.stderr).toContain('ACCESS_AUDIENCE');
    expect(result.stderr).not.toContain('KINETIC_ADMIN_ORIGIN:');
    expect(result.stderr).not.toContain('DISCORD_GUILD_ID:');
  });

  it('clears unused administrative settings when preparing disabled mode', () => {
    configure({ ...settings, STAFF_AUTH_MODE: 'disabled' });
    const result = run('scripts/configure-pages.mjs', { DEPLOY_ENVIRONMENT: 'production' });
    expect(result.status, result.stderr).toBe(0);
    const vars = JSON.parse(readFileSync(join(directory, 'wrangler.jsonc'), 'utf8')).env.production.vars;
    expect(vars).toMatchObject({ DISCORD_GUILD_ID: '', DISCORD_REDIRECT_URI: '', KINETIC_ADMIN_ORIGIN: '', PUBLIC_STATUS_URL: 'https://status.example.com/api/status' });
  });

  it('keeps Access protection mandatory for disabled previews', () => {
    configure({ SITE_URL: 'https://site.example.com', CLOUDFLARE_PAGES_PROJECT: 'test-site', STAFF_AUTH_MODE: 'disabled' });
    const result = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'preview']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ACCESS_TEAM_DOMAIN');
    expect(result.stderr).toContain('ACCESS_AUDIENCE');
    expect(result.stderr).toContain('PREVIEW_VERIFY_SERVICE_ID');
    expect(result.stderr).not.toContain('KINETIC_ADMIN_ORIGIN:');
    expect(result.stderr).not.toContain('DISCORD_GUILD_ID:');
  });

  it('allows an optional valid public status endpoint while keeping staff disabled', () => {
    configure({ SITE_URL: 'https://site.example.com', CLOUDFLARE_PAGES_PROJECT: 'test-site', STAFF_AUTH_MODE: 'disabled', PUBLIC_STATUS_URL: 'https://status.example.com/v1/public/status' });
    const result = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'production']);
    expect(result.status, result.stderr).toBe(0);
  });

  it('validates supplied optional endpoints in disabled mode', () => {
    configure({ SITE_URL: 'https://site.example.com', CLOUDFLARE_PAGES_PROJECT: 'test-site', STAFF_AUTH_MODE: 'disabled', PUBLIC_STATUS_URL: 'http://status.example.com/status' });
    const result = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'production']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PUBLIC_STATUS_URL');
  });

  it('lets a valid environment override replace a stale file value while validating the effective value', () => {
    configure({ ...settings, DISCORD_GUILD_ID: 'stale-server-id' });
    const stale = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'production']);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('DISCORD_GUILD_ID');
    const overridden = run('scripts/check-deployment-config.mjs', { DISCORD_GUILD_ID: '123456789012345678' }, ['--environment', 'production']);
    expect(overridden.status, overridden.stderr).toBe(0);
  });

  it.each([
    { value: { ...settings, DISCORD_GUILD_ID: Number(settings.DISCORD_GUILD_ID) }, expected: /DISCORD_GUILD_ID.*string/ },
    { value: { ...settings, DISCORD_GUILD: '123456789012345678' }, expected: /DISCORD_GUILD.*unknown|unknown.*DISCORD_GUILD/i },
    { value: { ...settings, CSRF_SECRET: 'never-print-this-value' }, expected: /CSRF_SECRET/ },
  ])('rejects mistakes in the file even when environment variables could mask them: $expected', ({ value, expected }) => {
    configure(value);
    const result = run('scripts/check-deployment-config.mjs', { DISCORD_GUILD_ID: '123456789012345678' }, ['--environment', 'production']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expected);
    expect(result.stderr).not.toContain('never-print-this-value');
  });

  it.each([
    ['SITE_URL', 'http://site.example.com'],
    ['DISCORD_REDIRECT_URI', 'https://other.example.com/api/auth/discord/callback'],
    ['ALLOWED_HOSTS', '*.test-site.pages.dev'],
    ['ACCESS_TEAM_DOMAIN', 'https://team.example.com'],
    ['KINETIC_ADMIN_ORIGIN', 'https://backend.example.com/private'],
    ['PUBLIC_STATUS_URL', 'https://user:password@status.example.com/status'],
    ['CLOUDFLARE_PAGES_PROJECT', 'project\nINJECTED=value'],
  ])('rejects unsafe %s before writing deployment files', (key, value) => {
    configure({ ...settings, [key]: value });
    const before = readFileSync(join(directory, 'wrangler.jsonc'), 'utf8');
    const result = run('scripts/configure-pages.mjs', { DEPLOY_ENVIRONMENT: 'production' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(key);
    expect(result.stderr).not.toContain('password');
    expect(readFileSync(join(directory, 'wrangler.jsonc'), 'utf8')).toBe(before);
  });

  it('rejects an artifact built for a different canonical origin', () => {
    configure();
    writeFileSync(join(directory, 'dist/revision.json'), JSON.stringify({ siteOrigin: 'https://different.example.com' }));
    const result = run('scripts/configure-pages.mjs', { DEPLOY_ENVIRONMENT: 'production' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('different canonical origin');
  });

  it('provides a shared build URL with the existing local fallback', () => {
    configure({});
    const local = load('getSiteUrl({ env: {} })');
    expect(local.status, local.stderr).toBe(0);
    expect(JSON.parse(local.stdout)).toBe('http://localhost:4321');
    configure(settings, {}, { SITE_URL: 'https://staging.example.com' });
    const preview = load('getSiteUrl()', { DEPLOY_ENVIRONMENT: 'preview', SITE_URL: '' });
    expect(preview.status, preview.stderr).toBe(0);
    expect(JSON.parse(preview.stdout)).toBe('https://staging.example.com');
  });

  it('uses the editable canonical URL in Astro and the revision URL resolver', () => {
    configure(settings, {}, { SITE_URL: 'https://staging.example.com' });
    const astroUrl = pathToFileURL(join(repository, 'astro.config.mjs')).href;
    const result = load(`({ site: (await import(${JSON.stringify(astroUrl)})).default.site, revisionSite: new URL(getSiteUrl()).origin })`, { DEPLOY_ENVIRONMENT: 'preview' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ site: 'https://staging.example.com', revisionSite: 'https://staging.example.com' });
  });

  it('reports malformed JSON and unsupported environments without echoing file values', () => {
    writeFileSync(join(directory, 'config/deployment.jsonc'), '{ "shared": "never-print-this-value",');
    const malformed = run('scripts/check-deployment-config.mjs');
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain('config/deployment.jsonc');
    expect(malformed.stderr).not.toContain('never-print-this-value');
    configure();
    const invalid = run('scripts/check-deployment-config.mjs', {}, ['--environment', 'staging']);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toMatch(/production.*preview/);
  });
});
