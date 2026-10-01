import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { ChatInputCommandInteraction } from 'discord.js';
process.env.DISCORD_TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-client';
process.env.DATABASE_PATH = ':memory:';
process.env.CONNECTED_SERVICES_ENABLED = 'false';
const userId = '123456789012345678';
const guildId = '223456789012345678';
const uuid = '12345678-1234-4234-8234-123456789012';
async function fixture() {
  const runtime = await import('../src/connected/runtime');
  runtime.shutdownConnected();
  const db = new DatabaseSync(':memory:');
  const connected = runtime.initializeConnected(db, { CONNECTED_SERVICES_ENABLED: 'true', GUILD_ID: guildId });
  connected.stop();
  return { db, connected, close() { runtime.shutdownConnected(); db.close(); } };
}
function interaction(subcommand: string, options: Record<string, string | boolean> = {}, choose?: (payload: Record<string, unknown>) => void) {
  const replies: Record<string, unknown>[] = [];
  const input = {
    id: '333456789012345678', user: { id: userId }, guildId,
    options: { getSubcommand: () => subcommand, getString: (key: string) => options[key] ?? null, getBoolean: (key: string) => options[key] ?? null },
    async deferReply(payload: Record<string, unknown>) { replies.push(payload); },
    async reply(payload: Record<string, unknown>) { replies.push(payload); },
    async editReply(payload: Record<string, unknown>) {
      replies.push(payload);
      return { async awaitMessageComponent() {
        choose?.(payload);
        return { user: { id: userId }, customId: 'connected-report:' + input.id + ':submit', async deferUpdate() {} };
      } };
    },
  };
  return { value: input as unknown as ChatInputCommandInteraction, replies, input };
}
test('new staff commands require explicit assignment in the configured guild', async () => {
  const f = await fixture();
  try {
    const { maintenanceCommand, modlogCommand } = await import('../src/commands/connected');
    const denied = interaction('show');
    await maintenanceCommand.execute(denied.value);
    assert.match(JSON.stringify(denied.replies), /explicit staff assignment/);
    assert.equal(denied.replies[0]!.flags, 'Ephemeral');
    f.connected.store.assign('discord', userId, 'viewer', 'Viewer', 'test');
    const viewer = interaction('account', { id: uuid });
    await modlogCommand.execute(viewer.value);
    assert.match(JSON.stringify(viewer.replies), /not permitted/);
    f.connected.store.assign('discord', userId, 'administrator', 'Admin', 'test');
    const elsewhere = interaction('show'); elsewhere.input.guildId = '323456789012345678';
    await maintenanceCommand.execute(elsewhere.value);
    assert.match(JSON.stringify(elsewhere.replies), /explicit staff assignment/);
  } finally { f.close(); }
});
test('maintenance command records one revisioned operation for repeated delivery', async () => {
  const f = await fixture();
  try {
    const { maintenanceCommand } = await import('../src/commands/connected');
    f.connected.store.assign('discord', userId, 'administrator', 'Admin', 'test');
    const values = { active: true, reason: 'Approved maintenance work', revision: 'initial', services: 'both', message: 'Planned maintenance', ends_at: new Date(Date.now() + 3600000).toISOString() };
    await maintenanceCommand.execute(interaction('set', values).value);
    await maintenanceCommand.execute(interaction('set', values).value);
    assert.equal(f.connected.store.operationRows().length, 1);
    assert.equal(f.connected.monitor.maintenance().active, true);
    assert.equal(f.connected.store.records('maintenance_history').length, 1);
  } finally { f.close(); }
});
test('token issue directs to protected website and token list never exposes a credential', async () => {
  const f = await fixture();
  try {
    const { executeToken } = await import('../src/commands/connected/tokens');
    const issue = interaction('issue'); await executeToken(issue.value);
    assert.match(JSON.stringify(issue.replies), /protected website|website/);
    assert.equal(f.connected.store.records('token').length, 0);
    const account = f.connected.identity.account('discord', userId), token = f.connected.identity.issue(account, 'My API');
    const list = interaction('list'); await executeToken(list.value);
    assert.equal(JSON.stringify(list.replies).includes(token.token), false);
    assert.match(JSON.stringify(list.replies), new RegExp(token.id));
    const other = f.connected.identity.issue(f.connected.identity.account('discord', 'other'), 'Other');
    const revokeOther = interaction('revoke', { id: other.id }); await executeToken(revokeOther.value);
    assert.match(JSON.stringify(revokeOther.replies), /not found/i);
    await executeToken(interaction('revoke', { id: token.id }).value);
    assert.throws(() => f.connected.identity.authenticate({ kind: 'account_token', token: token.token }));
  } finally { f.close(); }
});
test('AI report previews redacted selected evidence before persistence and rechecks ownership', async () => {
  const f = await fixture();
  try {
    const { reportCommand } = await import('../src/commands/connected');
    const account = f.connected.identity.account('discord', userId);
    const options = { summary: 'Please review this answer', excerpt: 'Bearer super-secret-value and woa_' + 'a'.repeat(43), speaker: 'aether', sent_at: new Date().toISOString() };
    const unverified = interaction('aether', options); await reportCommand.execute(unverified.value);
    assert.match(JSON.stringify(unverified.replies), /Verify your Minecraft link/);
    f.connected.identity.linkMinecraft(account, uuid, 'Player');
    const report = interaction('aether', options, preview => {
      assert.equal(f.connected.store.records('report').length, 0);
      assert.equal(JSON.stringify(preview).includes('super-secret-value'), false);
      assert.equal(JSON.stringify(preview).includes('woa_'), false);
    });
    await reportCommand.execute(report.value);
    assert.equal(f.connected.store.records('report').length, 1);
    assert.equal(JSON.stringify(f.connected.store.outbox()).includes('Please review this answer'), false);
    const changed = interaction('aether', options, () => f.connected.identity.unlinkMinecraft(account, uuid));
    changed.input.id = '433456789012345678';
    await reportCommand.execute(changed.value);
    assert.match(JSON.stringify(changed.replies), /Verify your Minecraft link|not linked|not owned/i);
    assert.equal(f.connected.store.records('report').length, 1);
  } finally { f.close(); }
});
test('public service commands never infer availability from configured labels', async () => {
  const { playersCommand, connectedStatusEmbed } = await import('../src/commands/connected');
  const status = JSON.stringify(connectedStatusEmbed().toJSON());
  assert.match(status, /unknown/);
  const request = interaction('unused'); await playersCommand.execute(request.value);
  assert.match(JSON.stringify(request.replies), /unavailable/i);
  assert.equal(JSON.stringify(request.replies).includes(userId), false);
});
