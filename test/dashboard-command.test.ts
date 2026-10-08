import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { ChatInputCommandInteraction, Client } from 'discord.js';

test('dashboard command privately enrolls only the caller and allows disable after Administrator loss', async () => {
  process.env.DISCORD_TOKEN = 'test'; process.env.CLIENT_ID = 'test'; process.env.CONNECTED_SERVICES_ENABLED = 'false';
  const { initializeConnected, shutdownConnected } = await import('../src/connected/runtime');
  const { dashboardCommand } = await import('../src/commands/connected/dashboard');
  shutdownConnected();
  const user = '123456789012345678', guild = '234567890123456789', other = '345678901234567890';
  const db = new DatabaseSync(':memory:');
  const runtime = initializeConnected(db, { CONNECTED_SERVICES_ENABLED: 'true', CONNECTED_ADMIN_ENABLED: 'true', STAFF_AUTH_MODE: 'discord', GUILD_ID: guild, CLIENT_ID: user, DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: 'https://staff.example/api/auth/discord/callback', ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', BACKEND_ACCESS_AUDIENCE: 'backend', GATEWAY_SERVICE_ID: 'gateway' });
  runtime.stop();
  let permitted = true;
  runtime.attachDiscord({ isReady: () => true, rest: { async get(path: string) {
    if (path.endsWith('/roles')) return [{ id: guild, permissions: permitted ? '8' : '32' }];
    if (path.includes('/members/')) return { user: { id: user }, roles: [] };
    return { id: guild, owner_id: other };
  } } } as unknown as Client);
  const call = async (subcommand: string, guildId: string | null = guild) => {
    const replies: Record<string, unknown>[] = [];
    const interaction = { user: { id: user }, guildId, options: { getSubcommand: () => subcommand, getUser: () => ({ id: other }) }, async deferReply(payload: Record<string, unknown>) { replies.push(payload); }, async editReply(payload: Record<string, unknown>) { replies.push(payload); } };
    await dashboardCommand.execute(interaction as unknown as ChatInputCommandInteraction);
    assert.equal(replies[0]!.flags, 'Ephemeral');
    return JSON.stringify(replies);
  };
  try {
    assert.match(await call('enable', null), /configured Wilderness Odyssey server/i);
    assert.match(await call('enable', other), /configured Wilderness Odyssey server/i);
    assert.match(await call('enable'), /https:\/\/staff.example\/login\//);
    assert.equal(db.prepare('SELECT user_id FROM cs_dashboard_enrollments WHERE active=1').get()!.user_id, user);
    assert.match(await call('enable'), /enabled/);
    permitted = false;
    assert.match(await call('disable'), /disabled.*revoked/);
    assert.match(await call('enable'), /Administrator permission/i);
    assert.equal(db.prepare('SELECT active FROM cs_dashboard_enrollments WHERE user_id=?').get(user)!.active, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM cs_dashboard_enrollments WHERE user_id=?').get(other)!.n, 0);
  } finally { shutdownConnected(); db.close(); }
});
