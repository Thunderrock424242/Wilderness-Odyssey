import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createAetherAgents } from '../src/aether/agents';
import { DisabledMinecraftBridge } from '../src/aether/bridge/disabledBridge';
import type { AetherConfig } from '../src/aether/config';
import { AetherContextBuilder } from '../src/aether/contextBuilder';
import { AetherCore } from '../src/aether/core';
import { PlaceholderLoreSource } from '../src/aether/lore/loreSource';
import { AetherSqliteMemory, DisabledAetherMemory } from '../src/aether/memory';
import { AetherPermissionManager } from '../src/aether/permissionManager';
import { FallbackModelProvider } from '../src/aether/providers/fallbackProvider';
import { ScriptedModelProvider } from '../src/aether/providers/scriptedProvider';
import type { AetherModelProvider } from '../src/aether/providers/types';
import { AetherRateLimiter } from '../src/aether/rateLimiter';
import { AetherRouter } from '../src/aether/router';
import type { AetherContext, AetherRequest } from '../src/aether/types';

test('disabled Aether returns a useful response without initializing memory', async () => {
  const core = createCore(false, new DisabledAetherMemory(), new ScriptedModelProvider());
  core.initialize();

  const response = await core.routeRequest(request());
  assert.equal(core.getStatus().enabled, false);
  assert.equal(response.status, 'error');
  assert.match(response.responseText, /existing Wilderness Odyssey bot features remain online/i);
});

test('AI provider failures fall back to the scripted provider', async () => {
  const provider = new FallbackModelProvider(new ThrowingProvider(), new ScriptedModelProvider());
  const response = await provider.generateResponse(request(), {
    profile: null,
    preferences: {
      conversationMemoryEnabled: false,
      minecraftNotificationsEnabled: false,
      responseDetail: 'standard',
      privacyMode: 'private'
    },
    conversationSummary: null,
    loreDiscoveries: [],
    playerContext: {}
  });
  assert.match(response, /deterministic modules/i);
});

test('core profile access cannot cross user boundaries', () => {
  const database = new DatabaseSync(':memory:');
  const memory = new AetherSqliteMemory(database, {
    clock: () => new Date('2026-07-16T12:00:00.000Z'),
    codeGenerator: () => 'ABCDEFGHJK'
  });
  const core = createCore(true, memory, new ScriptedModelProvider());
  try {
    core.initialize();
    assert.throws(() => core.getProfile({
      requesterUserId: 'user-1',
      targetUserId: 'user-2',
      permissions: ['profile:self']
    }), /only access your own/i);
  } finally {
    core.close();
    database.close();
  }
});

function createCore(
  enabled: boolean,
  memory: DisabledAetherMemory | AetherSqliteMemory,
  provider: AetherModelProvider
): AetherCore {
  const router = new AetherRouter(
    createAetherAgents({
      modelProvider: provider,
      loreSource: new PlaceholderLoreSource()
    }),
    new AetherContextBuilder(memory)
  );
  return new AetherCore(
    config(enabled),
    memory,
    provider,
    new DisabledMinecraftBridge(),
    router,
    new AetherPermissionManager(),
    new AetherRateLimiter(10, 60_000)
  );
}

function config(enabled: boolean): AetherConfig {
  return {
    enabled,
    commandEnabled: enabled,
    aiProvider: 'scripted',
    memoryEnabled: enabled,
    minecraftBridgeEnabled: false,
    linkCodeExpirationMinutes: 15,
    maximumAttachmentSize: 2 * 1024 * 1024,
    allowedDiagnosticFileTypes: ['txt', 'log'],
    rateLimitRequests: 10,
    rateLimitWindowSeconds: 60,
    issues: []
  };
}

function request(): AetherRequest {
  return {
    requestId: 'request-1234',
    sourcePlatform: 'discord',
    userIdentity: { platformUserId: 'user-1' },
    message: 'hello',
    attachments: [],
    permissions: ['profile:self'],
    timestamp: '2026-07-16T12:00:00.000Z'
  };
}

class ThrowingProvider implements AetherModelProvider {
  isAvailable(): boolean {
    return true;
  }

  async generateResponse(_request: AetherRequest, _context: AetherContext): Promise<string> {
    throw new Error('provider failed');
  }

  getProviderName(): string {
    return 'throwing';
  }

  close(): void {}
}

test('Aether core denies generation when no verified identity policy is available', async () => {
  const core = createCore(true, new DisabledAetherMemory(), new ScriptedModelProvider());
  core.initialize();
  const response = await core.routeRequest(request());
  assert.equal(response.status, 'error');
  assert.match(response.responseText, /verified account|identity/i);
});
import { AuthenticatedHttpMinecraftBridge } from '../src/aether/bridge/authenticatedBridge';

test('legacy Minecraft links cannot select Discord context without current ownership, and unlink revokes first', async () => {
  const db = new DatabaseSync(':memory:');
  const memory = new AetherSqliteMemory(db);
  const provider = new ScriptedModelProvider();
  const router = new AetherRouter(createAetherAgents({ modelProvider: provider, loreSource: new PlaceholderLoreSource() }), new AetherContextBuilder(memory));
  let selected = '';
  router.route = async incoming => {
    selected = incoming.userIdentity.platformUserId;
    return { requestId: incoming.requestId, status: 'ok', agentName: 'general', responseText: 'Test', confidence: 'high' };
  };
  let owns = false;
  let unlinked = false;
  const uuid = '12345678-1234-4234-8234-123456789012';
  const core = new AetherCore(config(true), memory, provider, new AuthenticatedHttpMinecraftBridge('s'.repeat(40)), router, new AetherPermissionManager(), new AetherRateLimiter(10, 60000), () => true,
    (discord, minecraft) => discord === 'discord-owner' && minecraft === uuid && owns,
    (discord, minecraft) => { assert.equal(discord, 'discord-owner'); assert.equal(minecraft, uuid); owns = false; unlinked = true; });
  core.initialize();
  const code = core.createLinkCode({ discordUserId: 'discord-owner', username: 'Owner' });
  const linked = core.completeLink({ code: code.code, minecraftUuid: uuid, minecraftName: 'Player' });
  assert.equal(linked.ok, true);
  const incoming = { action: 'player_question' as const, requestId: 'bridge-request-123', serverId: 'official', minecraftUuid: uuid, message: 'Hello', playerContext: {} };
  await core.handleBridgeRequest(incoming);
  assert.equal(selected, 'minecraft:' + uuid);
  owns = true;
  await core.handleBridgeRequest(incoming);
  assert.equal(selected, 'discord-owner');
  assert.equal(core.unlink('discord-owner'), true);
  assert.equal(unlinked, true);
  assert.equal(owns, false);
  core.close(); db.close();
});
