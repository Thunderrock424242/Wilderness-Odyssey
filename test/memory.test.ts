import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AetherSqliteMemory } from '../src/aether/memory';

const UUID_ONE = '123e4567-e89b-12d3-a456-426614174000';

test('link codes are created with creation, expiration, and pending status', () => {
  const { database, memory } = memoryFixture();
  try {
    const code = memory.createLinkCode({
      discordUserId: 'discord-1',
      username: 'Tester',
      expiresInMinutes: 15
    });

    assert.equal(code.code, 'ABCDEFGHJK');
    assert.equal(code.discordUserId, 'discord-1');
    assert.equal(code.status, 'pending');
    assert.equal(code.createdAt, '2026-07-16T12:00:00.000Z');
    assert.equal(code.expiresAt, '2026-07-16T12:15:00.000Z');
  } finally {
    database.close();
  }
});

test('expired link codes cannot be completed', () => {
  let now = new Date('2026-07-16T12:00:00.000Z');
  const { database, memory } = memoryFixture(() => now);
  try {
    const code = memory.createLinkCode({
      discordUserId: 'discord-1',
      username: 'Tester',
      expiresInMinutes: 15
    });
    now = new Date('2026-07-16T12:16:00.000Z');

    assert.equal(memory.getLinkCode(code.code)?.status, 'expired');
    assert.deepEqual(memory.completeLink({
      code: code.code,
      minecraftUuid: UUID_ONE,
      minecraftName: 'PlayerOne'
    }), { ok: false, reason: 'expired' });
  } finally {
    database.close();
  }
});

test('a link code is one-time and profiles use Minecraft UUID identity', () => {
  const { database, memory } = memoryFixture();
  try {
    const code = memory.createLinkCode({
      discordUserId: 'discord-1',
      username: 'Tester',
      expiresInMinutes: 15
    });
    const first = memory.completeLink({
      code: code.code,
      minecraftUuid: UUID_ONE.replace(/-/g, ''),
      minecraftName: 'PlayerOne'
    });
    const second = memory.completeLink({
      code: code.code,
      minecraftUuid: UUID_ONE,
      minecraftName: 'PlayerOne'
    });

    assert.equal(first.ok, true);
    assert.deepEqual(second, { ok: false, reason: 'used' });
    assert.equal(memory.getProfile('discord-1').minecraftLink?.minecraftUuid, UUID_ONE);
  } finally {
    database.close();
  }
});

test('conversation summaries are opt-in and erased when memory is disabled', () => {
  const { database, memory } = memoryFixture();
  try {
    assert.equal(memory.saveConversationSummary('discord-1', 'private summary'), false);
    memory.updatePreferences('discord-1', { conversationMemoryEnabled: true });
    assert.equal(memory.saveConversationSummary('discord-1', 'short summary'), true);
    assert.equal(memory.getConversationSummary('discord-1'), 'short summary');
    memory.updatePreferences('discord-1', { conversationMemoryEnabled: false });
    assert.equal(memory.getConversationSummary('discord-1'), null);
  } finally {
    database.close();
  }
});

function memoryFixture(clock: () => Date = () => new Date('2026-07-16T12:00:00.000Z')) {
  const database = new DatabaseSync(':memory:');
  const memory = new AetherSqliteMemory(database, {
    clock,
    codeGenerator: () => 'ABCDEFGHJK'
  });
  memory.initialize();
  return { database, memory };
}
