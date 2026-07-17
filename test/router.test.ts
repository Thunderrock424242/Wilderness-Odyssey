import assert from 'node:assert/strict';
import test from 'node:test';
import { createAetherAgents } from '../src/aether/agents';
import { AetherContextBuilder } from '../src/aether/contextBuilder';
import { PlaceholderLoreSource } from '../src/aether/lore/loreSource';
import { DisabledAetherMemory } from '../src/aether/memory';
import { ScriptedModelProvider } from '../src/aether/providers/scriptedProvider';
import { AetherRouter } from '../src/aether/router';
import type { AetherRequest } from '../src/aether/types';

const router = new AetherRouter(
  createAetherAgents({
    modelProvider: new ScriptedModelProvider(),
    loreSource: new PlaceholderLoreSource()
  }),
  new AetherContextBuilder(new DisabledAetherMemory())
);

test('router selects specialized agents deterministically', () => {
  assert.equal(router.selectAgent(request('What is the story behind the rifts?')), 'lore');
  assert.equal(router.selectAgent(request('My latest.log has a mixin exception')), 'diagnostics');
  assert.equal(router.selectAgent(request('How do I install this in CurseForge?')), 'support');
  assert.equal(router.selectAgent(request('What quest objective comes next?')), 'quest');
  assert.equal(router.selectAgent(request('Where should I submit a bug report?')), 'reports');
  assert.equal(router.selectAgent(request('Tell me something useful.')), 'general');
});

test('explicit agent hints and attachments override keyword routing', () => {
  assert.equal(router.selectAgent({ ...request('general question'), agentHint: 'lore' }), 'lore');
  assert.equal(router.selectAgent({
    ...request('tell me lore'),
    attachments: [{ name: 'latest.log', size: 10, content: 'error' }]
  }), 'diagnostics');
});

function request(message: string): AetherRequest {
  return {
    requestId: 'request-1234',
    sourcePlatform: 'discord',
    userIdentity: { platformUserId: 'user-1' },
    message,
    attachments: [],
    permissions: ['profile:self'],
    timestamp: '2026-07-16T00:00:00.000Z'
  };
}
