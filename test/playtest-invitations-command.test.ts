import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';
process.env.DISCORD_TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-client';
const directory = mkdtempSync(join(tmpdir(), 'wo-command-'));
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
process.env.CONNECTED_SERVICES_ENABLED = 'false';

test('unlinked testers can accept test builds and create manual fallback sessions', async () => {
  const { playtestCommand, beginPlaytestSessionFromPanel, handlePlaytestPanelModal, handlePlaytestReleaseButton } = await import('../src/commands/playtest');
  const { createPlaytestRelease, countPlaytestReleaseAcceptances } = await import('../src/services/playtestReleaseService');
  const { closeDb } = await import('../src/db');
  const replies: Record<string, unknown>[] = [];
  const fields: Record<string, string> = { tester_name: 'Tester', modpack_version: 'test', test_type: 'singleplayer', expected_duration: '10 minutes', notes: '' };
  const input = {
    user: { id: '123456789012345678', tag: 'Tester' }, client: { channels: { fetch: async () => null } },
    reply: async (payload: Record<string, unknown>) => { replies.push(payload); },
    options: { getSubcommand: () => 'start', getString: (key: string) => fields[key] ?? null },
    fields: { getTextInputValue: (key: string) => fields[key] },
    customId: 'playtest-panel:start', showModal: async () => { replies.push({ modal: true }); },
  };
  try {
    await playtestCommand.execute(input as unknown as ChatInputCommandInteraction);
    assert.match(JSON.stringify(replies), /session.*WO-TEST-/i);
    replies.length = 0;
    await beginPlaytestSessionFromPanel(input as unknown as StringSelectMenuInteraction);
    assert.equal(replies.length, 1);
    assert.equal(replies[0]!.modal, true);
    replies.length = 0;
    await handlePlaytestPanelModal(input as unknown as ModalSubmitInteraction);
    assert.match(JSON.stringify(replies), /session.*WO-TEST-/i);
    const release = createPlaytestRelease({ guildId: '223456789012345678', createdBy: 'staff', createdByUsername: 'Staff', title: 'Test build', modpackVersion: 'test', testFocus: 'test', expectedDuration: '10 minutes', packageName: 'test.zip', packageUrl: 'https://example.com/test.zip', packageSize: null, termsUrl: null, privacyUrl: null, instructions: null });
    input.customId = 'playtest-release:accept:' + release.publicId;
    replies.length = 0;
    await handlePlaytestReleaseButton(input as unknown as ButtonInteraction);
    assert.equal(countPlaytestReleaseAcceptances(release.publicId), 1);
    assert.match(JSON.stringify(replies), /invitation/i);
    assert.ok(replies.every(reply => reply.flags === 'Ephemeral'));
  } finally { closeDb(); rmSync(directory, { recursive: true, force: true }); }
});
