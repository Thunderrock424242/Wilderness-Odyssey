import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ComponentType,
  PermissionsBitField,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type MessageCreateOptions,
  type ModalBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { APIButtonComponentWithCustomId } from 'discord-api-types/v10';

process.env.DISCORD_TOKEN = 'test-token';
process.env.CLIENT_ID = 'test-client';
process.env.CONNECTED_SERVICES_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.SENTRY_DSN = '';

const panelModule = import('../src/commands/supportpanel');
type CapturedPayload = InteractionReplyOptions | InteractionUpdateOptions | MessageCreateOptions;

function embedOf(payload: CapturedPayload) {
  const embed = payload.embeds?.[0];
  assert.ok(embed, 'the player should receive a guide page');
  return 'toJSON' in embed ? embed.toJSON() : embed;
}

function buttonsOf(payload: CapturedPayload): APIButtonComponentWithCustomId[] {
  return (payload.components ?? []).flatMap(component => {
    assert.ok('toJSON' in component, 'support components should use Discord builders');
    const row = component.toJSON();
    return row.type === ComponentType.ActionRow
      ? row.components.filter((item): item is APIButtonComponentWithCustomId =>
        item.type === ComponentType.Button && 'custom_id' in item)
      : [];
  });
}

function guideInteraction(customId = 'supportpanel:category', isButton = false) {
  const state = {
    replies: [] as InteractionReplyOptions[],
    updates: [] as InteractionUpdateOptions[],
    modals: [] as ModalBuilder[],
  };
  const interaction = {
    customId,
    values: ['notsure'],
    user: { id: '234567890123456789', tag: 'guide-player' },
    isButton: () => isButton,
    isStringSelectMenu: () => !isButton,
    reply: async (payload: InteractionReplyOptions) => { state.replies.push(payload); },
    update: async (payload: InteractionUpdateOptions) => { state.updates.push(payload); },
    showModal: async (modal: ModalBuilder) => { state.modals.push(modal); },
    client: { channels: { fetch: async () => { throw new Error('Browsing must not contact another service'); } } },
  } as unknown as ButtonInteraction | StringSelectMenuInteraction;
  return { interaction, state };
}

async function openGuide() {
  const { handleSupportPanelComponent } = await panelModule;
  const { interaction, state } = guideInteraction();
  assert.equal(await handleSupportPanelComponent(interaction), true);
  assert.equal(state.replies[0]?.flags, 'Ephemeral');
  assert.equal(state.updates.length, 0);
  return state.replies[0];
}

async function navigate(customId: string) {
  const { handleSupportPanelComponent } = await panelModule;
  const { interaction, state } = guideInteraction(customId, true);
  assert.equal(await handleSupportPanelComponent(interaction), true);
  assert.equal(state.replies.length, 0, 'arrows should edit the existing private message');
  assert.equal(state.modals.length, 0, 'browsing should not start a report');
  assert.equal(state.updates.length, 1);
  return state.updates[0];
}

test('Help me choose opens a private first page with navigation and the matching action', async () => {
  const payload = await openGuide();
  const embed = embedOf(payload);
  assert.match(embed.footer?.text ?? '', /1\s*(?:of|\/)\s*8/);
  const buttons = buttonsOf(payload);
  assert.equal(buttons.find(button => button.label === 'Previous')?.disabled, true);
  assert.equal(buttons.find(button => button.label === 'Next')?.disabled, false);
  assert.ok(buttons.some(button => button.custom_id === 'supportpanel:category:bug'));
});

test('arrows browse every support action without starting forms or losing the page position', async () => {
  const categories = ['bug', 'crash', 'performance', 'feedback', 'suggestion', 'playtest', 'question', 'other'];
  let payload: CapturedPayload = await openGuide();
  for (const [index, category] of categories.entries()) {
    const embed = embedOf(payload);
    assert.match(embed.footer?.text ?? '', new RegExp(`${index + 1}\\s*(?:of|/)\\s*8`));
    assert.ok((embed.fields?.length ?? 0) >= 3, 'each page should explain the option in depth');
    const buttons = buttonsOf(payload);
    const action = buttons.find(button => button.custom_id.startsWith('supportpanel:category:'));
    assert.equal(action?.custom_id, `supportpanel:category:${category}`);
    const next = buttons.find(button => button.label === 'Next');
    assert.ok(next);
    assert.equal(next.disabled, index === categories.length - 1);
    if (!next.disabled) {
      payload = await navigate(next.custom_id);
    }
  }
});

test('the left arrow returns to the previous page and disables at the beginning', async () => {
  const first = await openGuide();
  const next = buttonsOf(first).find(button => button.label === 'Next');
  assert.ok(next);
  const second = await navigate(next.custom_id);
  const previous = buttonsOf(second).find(button => button.label === 'Previous');
  assert.ok(previous);
  assert.equal(previous.disabled, false);
  const returned = await navigate(previous.custom_id);
  assert.equal(embedOf(returned).title, embedOf(first).title);
  assert.equal(buttonsOf(returned).find(button => button.label === 'Previous')?.disabled, true);
});

test('unavailable guide pages receive a private recovery message without editing another message', async () => {
  const { handleSupportPanelComponent } = await panelModule;
  for (const customId of ['supportpanel:guide:missing', 'supportpanel:guide:', 'supportpanel:guide:crash:extra']) {
    const { interaction, state } = guideInteraction(customId, true);
    assert.equal(await handleSupportPanelComponent(interaction), true);
    assert.equal(state.replies[0]?.flags, 'Ephemeral');
    assert.match(state.replies[0]?.content ?? '', /Help me choose/i);
    assert.equal(state.updates.length, 0);
    assert.equal(state.modals.length, 0);
  }
});

test('guide actions preserve the known-issues check before bug and crash reporting', async () => {
  const { handleSupportPanelComponent } = await panelModule;
  for (const category of ['bug', 'crash']) {
    const page = category === 'bug' ? await openGuide() : await navigate('supportpanel:guide:crash');
    const action = buttonsOf(page).find(button => button.custom_id === `supportpanel:category:${category}`);
    assert.ok(action);
    const { interaction, state } = guideInteraction(action.custom_id, true);
    assert.equal(await handleSupportPanelComponent(interaction), true);
    assert.equal(state.replies[0]?.flags, 'Ephemeral');
    assert.ok(buttonsOf(state.replies[0]).some(button => button.custom_id === `supportpanel:continue:${category}`));
  }
});

test('guide actions open the existing feedback, suggestion, and private-ticket forms', async () => {
  const { handleSupportPanelComponent } = await panelModule;
  for (const [category, prefix] of [['feedback', 'feedback:'], ['suggestion', 'suggest:'], ['other', 'support-ticket:']] as const) {
    const page = await navigate(`supportpanel:guide:${category}`);
    const action = buttonsOf(page).find(button => button.custom_id === `supportpanel:category:${category}`);
    assert.ok(action);
    const { interaction, state } = guideInteraction(action.custom_id, true);
    assert.equal(await handleSupportPanelComponent(interaction), true);
    assert.equal(state.modals.length, 1);
    assert.ok(state.modals[0].toJSON().custom_id.startsWith(prefix));
  }
});

test('the permanent panel tells players about detailed pages and arrow navigation', async () => {
  const { supportPanelCommand } = await panelModule;
  const { config } = await import('../src/config');
  config.channelIds.staffLog = undefined;
  let sent: MessageCreateOptions | undefined;
  const permissions = new PermissionsBitField(PermissionsBitField.All);
  await supportPanelCommand.execute({
    memberPermissions: permissions,
    appPermissions: permissions,
    channel: { isSendable: () => true, isThread: () => false, send: async (payload: MessageCreateOptions) => { sent = payload; } },
    options: { getString: () => null },
    deferReply: async () => {},
    editReply: async () => {},
    user: { id: '234567890123456789', tag: 'guide-player' },
    channelId: '345678901234567890',
    client: {},
  } as unknown as ChatInputCommandInteraction);
  assert.ok(sent);
  const description = embedOf(sent).description ?? '';
  assert.match(description, /Help me choose/);
  assert.match(description, /pages?|every option/i);
  assert.match(description, /left.*right.*arrows/i);
});

test('previously posted support chooser menus still start the existing report flow', async () => {
  const { handleSupportPanelComponent } = await panelModule;
  const { interaction, state } = guideInteraction('supportpanel:triage');
  (interaction as StringSelectMenuInteraction).values = ['bug'];
  assert.equal(await handleSupportPanelComponent(interaction), true);
  assert.ok(buttonsOf(state.replies[0]).some(button => button.custom_id === 'supportpanel:continue:bug'));
});
