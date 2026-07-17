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
    'privacy'
  ]);
  assert.deepEqual(withAetherNames, [...existingNames, 'aether']);
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
    'settings'
  ]);
});
