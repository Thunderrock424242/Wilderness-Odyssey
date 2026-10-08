import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConnectedConfig } from '../src/connected/config';
const settings = {
  CONNECTED_SERVICES_ENABLED: 'true', CONNECTED_ADMIN_ENABLED: 'true', STAFF_AUTH_MODE: 'discord',
  ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', BACKEND_ACCESS_AUDIENCE: 'backend', GATEWAY_SERVICE_ID: 'gateway',
  GUILD_ID: '123456789012345678', CLIENT_ID: '234567890123456789', DISCORD_CLIENT_SECRET: 'test-secret',
  DISCORD_REDIRECT_URI: 'https://staff.example/api/auth/discord/callback',
};
test('staff mode is explicit and Discord requires fixed machine trust, guild and exact HTTPS callback', () => {
  assert.equal(loadConnectedConfig(settings).staffAuthMode, 'discord');
  for (const key of ['STAFF_AUTH_MODE', 'GUILD_ID', 'CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'GATEWAY_SERVICE_ID', 'ACCESS_TEAM_DOMAIN']) assert.throws(() => loadConnectedConfig({ ...settings, [key]: '' }));
  for (const uri of ['http://staff.example/api/auth/discord/callback', 'https://staff.example/callback', 'https://user:pass@staff.example/api/auth/discord/callback', settings.DISCORD_REDIRECT_URI + '?next=evil', settings.DISCORD_REDIRECT_URI + '#part']) assert.throws(() => loadConnectedConfig({ ...settings, DISCORD_REDIRECT_URI: uri }));
  assert.throws(() => loadConnectedConfig({ ...settings, STAFF_AUTH_MODE: 'unknown' }));
  assert.throws(() => loadConnectedConfig({ ...settings, ACCESS_TEAM_DOMAIN: 'https://untrusted.example' }));
  assert.throws(() => loadConnectedConfig({ ...settings, STAFF_AUTH_MODE: 'access', WEBSITE_ACCESS_AUDIENCE: '' }));
  assert.equal(loadConnectedConfig({ ...settings, STAFF_AUTH_MODE: 'access', WEBSITE_ACCESS_AUDIENCE: 'website' }).staffAuthMode, 'access');
});
