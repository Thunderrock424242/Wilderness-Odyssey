import assert from 'node:assert/strict';
import test from 'node:test';

test('Aether registration preserves every existing slash command', async () => {
  process.env.DISCORD_TOKEN = 'test-token';
  process.env.CLIENT_ID = 'test-client';
  const { createCommandList } = await import('../src/commands');
  const existingNames = createCommandList(false).map((command) => command.data.name);
  const withAetherNames = createCommandList(true).map((command) => command.data.name);

  assert.deepEqual(existingNames, [
    'help',
    'bugreport',
    'crash',
    'performance',
    'perfreport',
    'minecraft',
    'knownissues',
    'changelog',
    'playtest',
    'feedback',
    'installhelp',
    'status',
    'suggest',
    'sparkreport',
    'supportpanel',
    'shutdown',
    'staff',
    'privacy',
    'players',
    'report',
    'maintenance',
    'modlog',
    'dashboard',
    'setup'
  ]);
  assert.deepEqual(withAetherNames, [...existingNames, 'aether']);
});

test('dashboard registration has caller-only subcommands and permits self-revocation after demotion', async () => {
  process.env.DISCORD_TOKEN = 'test-token'; process.env.CLIENT_ID = 'test-client';
  const { createCommandList } = await import('../src/commands');
  const command = createCommandList(false).find(item => item.data.name === 'dashboard');
  assert.ok(command);
  const data = command.data.toJSON();
  assert.deepEqual(data.options?.map(item => item.name), ['enable', 'disable']);
  assert.ok(data.default_member_permissions == null);
  assert.equal(data.dm_permission, false);
  assert.ok(data.options?.every(item => !('options' in item) || !item.options?.length));
});

test('Aether command registers the required subcommands', async () => {
  process.env.DISCORD_TOKEN = 'test-token';
  process.env.CLIENT_ID = 'test-client';
  const { createCommandList } = await import('../src/commands');
  const aether = createCommandList(true).find((command) => command.data.name === 'aether');
  assert.ok(aether);

  const json = aether.data.toJSON();
  assert.deepEqual(json.options?.map((option) => option.name), [
    'help',
    'ask',
    'status',
    'lore',
    'diagnose',
    'link',
    'unlink',
    'profile',
    'settings',
    'token'
  ]);
});
