import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ChannelType, Collection, PermissionsBitField } from 'discord.js';
import type { ButtonInteraction, Client, Message, MessageCreateOptions, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';

const testDirectory = mkdtempSync(path.join(tmpdir(), 'wo-bot-experience-'));
process.env.DISCORD_TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-client';
process.env.DATABASE_PATH = path.join(testDirectory, 'test.sqlite');
process.env.CONNECTED_SERVICES_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.SENTRY_DSN = '';

const modules = Promise.all([
  import('../src/commands/supportpanel'),
  import('../src/services/reportIntakeService'),
  import('../src/services/reportService'),
  import('../src/config'),
]);

after(async () => {
  const { closeDb } = await import('../src/db');
  closeDb();
  rmSync(testDirectory, { recursive: true, force: true });
});

function panelInteraction(customId: string, value: string) {
  const state = { deferred: false, payloads: [] as MessageCreateOptions[], fetches: 0 };
  const permissions = new PermissionsBitField(PermissionsBitField.All);
  const interaction = {
    customId,
    values: [value],
    memberPermissions: permissions,
    appPermissions: permissions,
    guild: { id: 'test-guild', members: { me: { id: 'bot', permissions } } },
    guildId: 'test-guild',
    channel: { permissionsFor: () => permissions, isThread: () => false },
    isButton: () => false,
    isStringSelectMenu: () => true,
    deferReply: async () => { state.deferred = true; },
    reply: async (payload: MessageCreateOptions) => { state.payloads.push(payload); },
    editReply: async (payload: MessageCreateOptions) => { state.payloads.push(payload); },
    followUp: async (payload: MessageCreateOptions) => { state.payloads.push(payload); },
    client: { channels: { fetch: async () => {
      state.fetches++;
      return {
        id: 'forum', guildId: 'test-guild', type: ChannelType.GuildText,
        isSendable: () => true, isThreadOnly: () => false,
        permissionsFor: () => permissions,
      };
    } } },
  } as unknown as StringSelectMenuInteraction;
  return { interaction, state };
}

function embedText(payloads: MessageCreateOptions[]): string {
  return payloads.flatMap(payload => payload.embeds ?? []).map(embed =>
    JSON.stringify('toJSON' in embed ? embed.toJSON() : embed)).join('\n');
}

test('setup section acknowledges Discord before fetching channels', async () => {
  const [panel, , , { config }] = await modules;
  config.forumChannels.issues = 'forum';
  const { interaction, state } = panelInteraction('panel:setup', 'channels');
  interaction.client.channels.fetch = (async () => {
    assert.equal(state.deferred, true, 'setup must acknowledge before network work');
    return null;
  }) as typeof interaction.client.channels.fetch;
  await panel.handleSupportPanelComponent(interaction);
  assert.equal(state.deferred, true);
});

test('setup permission section does not fetch unrelated configured channels', async () => {
  const [panel, , , { config }] = await modules;
  config.forumChannels.issues = 'forum';
  const { interaction, state } = panelInteraction('panel:setup', 'permissions');
  await panel.handleSupportPanelComponent(interaction);
  assert.equal(state.fetches, 0);
});

test('setup includes the staff log and rejects a text channel configured as a forum', async () => {
  const [panel, , , { config }] = await modules;
  config.forumChannels.issues = 'forum';
  config.channelIds.staffLog = undefined;
  const { interaction, state } = panelInteraction('panel:setup', 'full');
  await panel.handleSupportPanelComponent(interaction);
  const text = embedText(state.payloads);
  assert.match(text, /STAFF_LOG_CHANNEL_ID/);
  assert.match(text, /must be a Discord forum/i);
});

test('info panel reports observed service state instead of claiming systems are online', async () => {
  const [panel] = await modules;
  const { interaction, state } = panelInteraction('panel:info', 'status');
  await panel.handleSupportPanelComponent(interaction);
  const text = embedText(state.payloads);
  assert.match(text, /Minecraft/);
  assert.doesNotMatch(text, /systems online/i);
});

test('failed Discord archive delivery returns saved-but-not-posted rather than failing submission', async () => {
  const [, , reports] = await modules;
  const client = { channels: { fetch: async () => ({
    isThreadOnly: () => false, isSendable: () => true,
    send: async () => { throw new Error('secret backend response'); },
  }) } } as unknown as Client;
  const result = await reports.postToConfiguredChannel(client, 'channel', { content: 'report' });
  assert.equal(result.posted, false);
});

test('attachment reader stops an oversized streamed response before buffering the whole file', async () => {
  const [, , reports, { config }] = await modules;
  const originalFetch = globalThis.fetch;
  const originalLimit = config.maxLogBytes;
  let cancelled = false;
  let sent = false;
  config.maxLogBytes = 10;
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) { controller.close(); } else { sent = true; controller.enqueue(new Uint8Array(11)); }
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }));
  try {
    await assert.rejects(reports.readTextAttachmentUrl('latest.log', 1,
      'https://cdn.discordapp.com/attachments/1/2/latest.log'), /too large|exceeds/i);
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = originalFetch;
    config.maxLogBytes = originalLimit;
  }
});

test('attachment reader rejects untrusted URLs without making a request', async () => {
  const [, , reports] = await modules;
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return new Response('log'); };
  try {
    await assert.rejects(reports.readTextAttachmentUrl('latest.log', 1, 'http://localhost/private'), /Discord|HTTPS/i);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('old review submit controls cannot submit a report while the player is answering', async () => {
  const [, intake, , { config }] = await modules;
  config.channelIds.supportTicketCategory = undefined;
  config.channelIds.staffLog = undefined;
  const permissions = new PermissionsBitField(PermissionsBitField.All);
  const channel = { id: 'intake-channel', send: async () => undefined };
  const state = { deferred: false, replies: [] as MessageCreateOptions[], updates: 0 };
  const interaction = {
    channelId: channel.id, channel: { parentId: null },
    guild: {
      members: { me: { id: 'bot', permissions } }, roles: { everyone: { id: 'everyone' } },
      channels: { create: async () => { assert.equal(state.deferred, true); return channel; } },
    },
    client: { user: { id: 'bot' } }, user: { id: 'player', username: 'Player', tag: 'Player' },
    deferReply: async () => { state.deferred = true; },
    reply: async (payload: MessageCreateOptions) => { state.replies.push(payload); },
    editReply: async (payload: MessageCreateOptions) => { state.replies.push(payload); },
  } as unknown as ButtonInteraction;
  await intake.beginBugReportIntakeFromPanel(interaction);
  const control = {
    ...interaction, customId: 'reportintake:submit',
    isStringSelectMenu: () => false,
    update: async () => { state.updates++; },
  } as unknown as ButtonInteraction;
  await intake.handleReportIntakeComponent(control);
  assert.equal(state.updates, 0);
  assert.match(JSON.stringify(state.replies.at(-1)), /answer|finish|review/i);
});

test('unrecognized old components receive a useful private response', async () => {
  await modules;
  const { handleInteraction } = await import('../src/events/interactionCreate');
  const replies: MessageCreateOptions[] = [];
  const interaction = {
    id: 'old-component', type: 3, customId: 'retired:button',
    isChatInputCommand: () => false, isModalSubmit: () => false,
    isStringSelectMenu: () => false, isButton: () => true, isRepliable: () => true,
    reply: async (payload: MessageCreateOptions) => { replies.push(payload); },
  } as unknown as ButtonInteraction;
  await handleInteraction(interaction, new Collection());
  assert.equal(replies.length, 1);
  assert.match(JSON.stringify(replies[0]), /help|support/i);
});

test('long bug report cards remain within Discord total embed limits', async () => {
  const [, , reports] = await modules;
  const { bugReportEmbed } = await import('../src/utils/embeds');
  const long = 'Player supplied detail '.repeat(100);
  const report = reports.createBugReport({
    userId: 'player', username: 'Player', modpackVersion: '1.0', minecraftVersion: '1.21',
    loaderVersion: '21.1', playMode: 'Singleplayer', happened: long, expected: long,
    steps: long, bugContext: long, location: long, anomalyContext: long, repeatable: long,
    sparkLink: 'https://spark.lucko.me/' + 'a'.repeat(400), attachmentUrl: null, attachmentName: null,
    screenshotUrl: 'https://cdn.discordapp.com/' + 'a'.repeat(400), screenshotName: 'a'.repeat(200),
    logFileName: 'a'.repeat(200) + '.log', redactedLog: long,
  });
  const embed = bugReportEmbed(report);
  assert.ok(embed.length <= 6000, `embed contains ${embed.length} characters`);
  assert.ok(embed.data.fields?.every(field => field.value.length <= 1024));
});

test('follow-up report details are delivered to configured forums after acknowledgment', async () => {
  const [, , reports, { config }] = await modules;
  config.forumChannels.issues = 'forum';
  config.channelIds.bugReports = undefined;
  config.channelIds.staffLog = undefined;
  const reportId = String(reports.searchReports('Player supplied')[0].publicId);
  let deferred = false;
  let posts = 0;
  const interaction = {
    customId: 'reportinfo:bug:' + reportId,
    user: { id: 'player', tag: 'Player' },
    fields: { getTextInputValue: () => 'Additional reproduction details.' },
    deferReply: async () => { deferred = true; },
    editReply: async () => undefined,
    reply: async () => undefined,
    client: { channels: { fetch: async () => ({
      isThreadOnly: () => true, availableTags: [],
      threads: { create: async () => {
        assert.equal(deferred, true);
        posts++;
        return { id: 'thread', fetchStarterMessage: async () => ({ id: 'message' }) };
      } },
    }) } },
  } as unknown as ModalSubmitInteraction;
  await reports.handleReportUpdateModal(interaction);
  assert.equal(posts, 1);
});

async function completeBugIntake(channelId: string) {
  const [, intake, , { config }] = await modules;
  config.channelIds.supportTicketCategory = undefined;
  config.channelIds.staffLog = undefined;
  const payloads: MessageCreateOptions[] = [];
  let failReceipt = false;
  const send = async (payload: string | MessageCreateOptions) => {
    if (failReceipt) { failReceipt = false; throw new Error('Receipt send failed with a secret'); }
    payloads.push(typeof payload === 'string' ? { content: payload } : payload);
  };
  const permissions = new PermissionsBitField(PermissionsBitField.All);
  const channel = { id: channelId, parentId: null, send };
  const user = { id: 'player', username: 'Player', tag: 'Player', bot: false };
  const client = { user: { id: 'bot' }, channels: { fetch: async () => null } };
  const interaction = {
    channelId, channel, client, user,
    guild: { id: 'guild', members: { me: { id: 'bot', permissions } }, roles: { everyone: { id: 'everyone' } },
      channels: { create: async () => channel } },
    deferReply: async () => undefined,
    editReply: send,
    reply: send,
    update: async () => undefined,
    isStringSelectMenu: () => false,
    customId: 'reportintake:submit',
  } as unknown as ButtonInteraction;
  await intake.beginBugReportIntakeFromPanel(interaction);
  const long = 'Reproduction detail '.repeat(80);
  const answers = ['1.0', 'n/a', 'n/a', 'singleplayer', long, long, long,
    long, long, long, 'n/a', 'n/a', 'n/a', 'n/a', long];
  for (const content of answers) {
    await intake.handleReportIntakeMessage({ channelId, content, channel, client, author: user,
      guild: interaction.guild, attachments: new Collection(), reply: send } as unknown as Message);
  }
  const review = payloads.at(-1)?.embeds?.[0];
  assert.ok(review && 'toJSON' in review);
  assert.match(String(review.toJSON().title), /Review/);
  assert.ok(JSON.stringify(review.toJSON()).length > 0);
  return { interaction, payloads, failNextReceipt: () => { failReceipt = true; } };
}

test('concurrent review submissions save one report', async () => {
  const [, intake] = await modules;
  const { getDb } = await import('../src/db');
  const fixture = await completeBugIntake('concurrent-intake');
  const before = getDb().prepare('SELECT count(*) AS n FROM bug_reports').get()!.n;
  await Promise.all([
    intake.handleReportIntakeComponent(fixture.interaction),
    intake.handleReportIntakeComponent(fixture.interaction),
  ]);
  const after = getDb().prepare('SELECT count(*) AS n FROM bug_reports').get()!.n;
  assert.equal(Number(after) - Number(before), 1);
});

test('receipt failure after saving a report cannot reopen it for duplicate submission', async () => {
  const [, intake] = await modules;
  const { getDb } = await import('../src/db');
  const fixture = await completeBugIntake('receipt-failure-intake');
  const before = getDb().prepare('SELECT count(*) AS n FROM bug_reports').get()!.n;
  fixture.failNextReceipt();
  await intake.handleReportIntakeComponent(fixture.interaction);
  assert.match(embedText(fixture.payloads) + JSON.stringify(fixture.payloads.at(-1)), /saved as/);
  await intake.handleReportIntakeComponent(fixture.interaction);
  const after = getDb().prepare('SELECT count(*) AS n FROM bug_reports').get()!.n;
  assert.equal(Number(after) - Number(before), 1);
});

test('failed deferred public button updates preserve the original card', async () => {
  await modules;
  const { createSuggestion } = await import('../src/services/suggestionService');
  const { handleInteraction } = await import('../src/events/interactionCreate');
  const { getDb } = await import('../src/db');
  const suggestion = createSuggestion({ userId: 'player', username: 'Player', category: 'Other',
    modpackVersion: '1.0', title: 'Test suggestion', details: 'Suggestion details' });
  let edits = 0;
  const followUps: MessageCreateOptions[] = [];
  const interaction = {
    id: 'vote', type: 3, customId: `suggestvote:${suggestion.publicId}:up`,
    user: { id: 'player' }, ephemeral: null, deferred: false, replied: false,
    isChatInputCommand: () => false, isModalSubmit: () => false,
    isStringSelectMenu: () => false, isButton: () => true, isRepliable: () => true,
    deferUpdate: async () => { interaction.deferred = true; },
    editReply: async () => { edits++; },
    followUp: async (payload: MessageCreateOptions) => { followUps.push(payload); },
  } as unknown as ButtonInteraction;
  getDb().exec('PRAGMA query_only = ON');
  try {
    await handleInteraction(interaction, new Collection());
    assert.equal(edits, 0);
    assert.equal(followUps.length, 1);
    assert.equal(followUps[0].flags, 'Ephemeral');
  } finally { getDb().exec('PRAGMA query_only = OFF'); }
});

test('Q&A setup detects missing permissions to send answers', async () => {
  const [panel, , , { config }] = await modules;
  config.qa.forumChannelId = 'qa-forum';
  config.qa.channelIds = ['qa-text'];
  const { interaction, state } = panelInteraction('panel:setup', 'qa');
  const permissions = new PermissionsBitField([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]);
  interaction.client.channels.fetch = (async (id: string) => ({
    id, guildId: 'test-guild', type: id === 'qa-forum' ? ChannelType.GuildForum : ChannelType.GuildText,
    permissionsFor: () => permissions,
  })) as unknown as typeof interaction.client.channels.fetch;
  await panel.handleSupportPanelComponent(interaction);
  const text = embedText(state.payloads);
  assert.match(text, /Send Messages in Threads/);
  assert.match(text, /Send Messages/);
  assert.match(text, /Embed Links/);
});

test('large setup results preserve every finding within Discord message limits', async () => {
  const [panel, , , { config }] = await modules;
  config.qa.channelIds = Array.from({ length: 70 }, (_, i) => 'qa-' + i);
  const { interaction, state } = panelInteraction('panel:setup', 'qa');
  interaction.client.channels.fetch = (async () => null) as typeof interaction.client.channels.fetch;
  await panel.handleSupportPanelComponent(interaction);
  const text = embedText(state.payloads);
  assert.equal((text.match(/QA_CHANNEL_IDS:/g) ?? []).length, 70);
  for (const payload of state.payloads) {
    for (const embed of payload.embeds ?? []) {
      assert.ok('toJSON' in embed);
      const data = embed.toJSON();
      assert.ok(data.fields!.every(field => field.value.length <= 1024));
      const count = (data.title?.length ?? 0) + (data.description?.length ?? 0) + (data.footer?.text.length ?? 0)
        + data.fields!.reduce((n, field) => n + field.name.length + field.value.length, 0);
      assert.ok(count <= 6000);
    }
  }
});

test('setup command denies players before running checks', async () => {
  await modules;
  const { setupCommand } = await import('../src/commands/setup');
  const data = setupCommand.data.toJSON();
  assert.equal(data.dm_permission, false);
  let checked = false;
  let denied = false;
  await setupCommand.execute({ memberPermissions: new PermissionsBitField(),
    reply: async () => { denied = true; }, deferReply: async () => { checked = true; },
  } as unknown as import('discord.js').ChatInputCommandInteraction);
  assert.equal(denied, true);
  assert.equal(checked, false);
});

test('long known issue lists keep every issue within one valid Discord card', async () => {
  const { knownIssuesEmbed } = await import('../src/utils/embeds');
  const issues = Array.from({ length: 10 }, (_, id) => ({
    id, title: 'Issue ' + id, description: 'Issue details '.repeat(100), status: 'confirmed', severity: 'medium',
    affectedVersions: null, fixedInVersion: null, externalKey: null, externalUrl: null,
    addedBy: 'staff', sourceReportType: null, sourceReportPublicId: null, createdAt: 'now', updatedAt: 'now',
  }));
  const embed = knownIssuesEmbed(issues);
  assert.equal(embed.data.fields?.length, 10);
  assert.ok(embed.length <= 6000, `known issues card contains ${embed.length} characters`);
});

test('staff search results stay within Discord total embed limits', async () => {
  const { searchResultsEmbed } = await import('../src/utils/embeds');
  const results = Array.from({ length: 10 }, (_, id) => ({
    type: 'bug' as const, publicId: 'WO-BUG-' + id, title: 'Search result detail '.repeat(100), status: 'open', createdAt: 'now',
  }));
  const embed = searchResultsEmbed('detail', results);
  assert.equal(embed.data.fields?.length, 10);
  assert.ok(embed.length <= 6000, `search card contains ${embed.length} characters`);
});
