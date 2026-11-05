import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { ChatInputCommandInteraction } from 'discord.js';

test('existing ask command defers privately before inference and suppresses generated mentions', async () => {
  Object.assign(process.env, {
    DISCORD_TOKEN: 'test-token', CLIENT_ID: 'test-client', LOG_LEVEL: 'silent',
    AETHER_ENABLED: 'true', AETHER_COMMAND_ENABLED: 'true', AETHER_MEMORY_ENABLED: 'false',
    AETHER_MINECRAFT_BRIDGE_ENABLED: 'false', AETHER_AI_PROVIDER: 'remote',
    AETHER_INFERENCE_ORIGIN: 'https://approved.example', AETHER_INFERENCE_SERVER_ID: 'official-server',
    AETHER_INFERENCE_MODEL: 'qwen3.5:4b', AETHER_INFERENCE_TOKEN: 'test-inference-token-00000000000000000001',
  });
  const events: string[] = [];
  const replies: Record<string, unknown>[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    events.push('inference');
    assert.equal(events[0], 'defer');
    assert.equal(String(url), 'https://approved.example/v1/aether/chat');
    const body = JSON.parse(String(options?.body));
    return Response.json({schemaVersion: '1.0', requestId: body.requestId, serverId: body.serverId,
      model: 'qwen3.5:4b', success: true, response: 'Hello @everyone <@123456789012345678>.'});
  };
  const db = new DatabaseSync(':memory:');
  const connected = await import('../src/connected/runtime');
  const aether = await import('../src/aether');
  try {
    connected.initializeConnected(db, {CONNECTED_SERVICES_ENABLED: 'true', GUILD_ID: '223456789012345678'}).stop();
    aether.initializeAether();
    const { aetherCommand } = await import('../src/aether/discord/aetherCommand');
    const interaction = {
      user: {id: '123456789012345678', tag: 'Test'}, guildId: '223456789012345678',
      options: {getSubcommandGroup: () => null, getSubcommand: () => 'ask', getString: () => 'Hello'},
      async deferReply(payload: Record<string, unknown>) { events.push('defer'); replies.push(payload); },
      async editReply(payload: Record<string, unknown>) { events.push('edit'); replies.push(payload); },
    } as unknown as ChatInputCommandInteraction;
    await aetherCommand.execute(interaction);
    assert.deepEqual(events, ['defer', 'inference', 'edit']);
    assert.equal(replies[0].flags, 'Ephemeral');
    assert.deepEqual(replies[1].allowedMentions, {parse: []});
    assert.match(JSON.stringify(replies[1]), /Hello @everyone/);
  } finally {
    aether.shutdownAether(); connected.shutdownConnected(); db.close(); globalThis.fetch = oldFetch;
  }
});
