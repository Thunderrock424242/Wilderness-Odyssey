import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { getDb } from '../db';
import type { SuggestionRecord, SuggestionStatus, SuggestionVoteCounts, SuggestionVoteValue } from '../types';
import { suggestionEmbed } from '../utils/embeds';
import { formatPublicId, normalizePublicId } from '../utils/ids';

interface SuggestionDraft {
  userId: string;
  category: string;
  modpackVersion: string | null;
}

interface SuggestionRow {
  id: number;
  public_id: string;
  user_id: string;
  username: string;
  category: string;
  modpack_version: string | null;
  title: string;
  details: string;
  status: SuggestionStatus;
  message_channel_id: string | null;
  message_id: string | null;
  created_at: string;
  updated_at: string;
}

const suggestionDrafts = new Map<string, SuggestionDraft>();

export async function beginSuggestion(interaction: ChatInputCommandInteraction): Promise<void> {
  const draftId = randomUUID().slice(0, 10);
  suggestionDrafts.set(draftId, {
    userId: interaction.user.id,
    category: interaction.options.getString('category', true),
    modpackVersion: interaction.options.getString('modpack_version')
  });

  const modal = new ModalBuilder()
    .setCustomId(`suggest:${draftId}`)
    .setTitle('Wilderness Oddesy Suggestion')
    .addComponents(
      textInputRow('title', 'Suggestion title', TextInputStyle.Short, true, 'Short, clear title.'),
      textInputRow('details', 'Suggestion details', TextInputStyle.Paragraph, true, 'What should be added or changed, and why?')
    );

  await interaction.showModal(modal);
}

export async function handleSuggestionModal(interaction: ModalSubmitInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = suggestionDrafts.get(draftId);

  if (!draft || draft.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'That suggestion form expired. Please run `/suggest` again.',
      ephemeral: true
    });
    return;
  }

  suggestionDrafts.delete(draftId);
  await interaction.deferReply({ ephemeral: true });

  const suggestion = createSuggestion({
    userId: interaction.user.id,
    username: interaction.user.tag,
    category: draft.category,
    modpackVersion: draft.modpackVersion,
    title: interaction.fields.getTextInputValue('title'),
    details: interaction.fields.getTextInputValue('details')
  });

  const posted = await postSuggestion(interaction, suggestion);

  await interaction.editReply({
    content: `Suggestion received. The archive has been updated. Your suggestion ID is **${suggestion.publicId}**.${posted ? '' : ' Suggestions channel posting is not configured yet, but the suggestion was saved locally.'}`
  });
}

export function createSuggestion(input: {
  userId: string;
  username: string;
  category: string;
  modpackVersion: string | null;
  title: string;
  details: string;
}): SuggestionRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO suggestions (user_id, username, category, modpack_version, title, details)
    VALUES (@userId, @username, @category, @modpackVersion, @title, @details)
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('suggestion', id);
  database.prepare('UPDATE suggestions SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const suggestion = getSuggestion(publicId);
  if (!suggestion) {
    throw new Error(`Failed to read created suggestion ${publicId}`);
  }

  return suggestion;
}

export function getSuggestion(publicId: string): SuggestionRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM suggestions WHERE public_id = ?')
    .get(normalizePublicId(publicId)) as SuggestionRow | undefined;

  return row ? mapSuggestion(row) : null;
}

export function updateSuggestionStatus(publicId: string, status: SuggestionStatus): SuggestionRecord | null {
  const normalized = normalizePublicId(publicId);
  const result = getDb()
    .prepare('UPDATE suggestions SET status = @status, updated_at = datetime(\'now\') WHERE public_id = @publicId')
    .run({ status, publicId: normalized });

  return result.changes > 0 ? getSuggestion(normalized) : null;
}

export function updateSuggestionMessageReference(publicId: string, channelId: string, messageId: string): void {
  getDb().prepare(`
    UPDATE suggestions
    SET message_channel_id = @channelId,
        message_id = @messageId,
        updated_at = datetime('now')
    WHERE public_id = @publicId
  `).run({ publicId: normalizePublicId(publicId), channelId, messageId });
}

export function getSuggestionVoteCounts(publicId: string): SuggestionVoteCounts {
  const rows = getDb().prepare(`
    SELECT vote, COUNT(*) AS count
    FROM suggestion_votes
    WHERE suggestion_public_id = ?
    GROUP BY vote
  `).all(normalizePublicId(publicId)) as unknown as Array<{ vote: SuggestionVoteValue; count: number }>;

  return rows.reduce<SuggestionVoteCounts>((counts, row) => {
    counts[row.vote] = row.count;
    return counts;
  }, { up: 0, down: 0, discussion: 0 });
}

export function suggestionVoteButtons(publicId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggestvote:${publicId}:up`)
      .setLabel('Upvote')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`suggestvote:${publicId}:down`)
      .setLabel('Downvote')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`suggestvote:${publicId}:discussion`)
      .setLabel('Needs discussion')
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function handleSuggestionVoteButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('suggestvote:')) {
    return false;
  }

  const parts = interaction.customId.split(':');
  const publicId = parts[1];
  const vote = parts[2] as SuggestionVoteValue | undefined;
  if (!publicId || !vote) {
    await interaction.reply({
      content: 'That suggestion vote button is malformed.',
      ephemeral: true
    });
    return true;
  }

  const suggestion = getSuggestion(publicId);

  if (!suggestion) {
    await interaction.reply({
      content: `No suggestion found for ${publicId}.`,
      ephemeral: true
    });
    return true;
  }

  await interaction.deferUpdate();
  getDb().prepare(`
    INSERT INTO suggestion_votes (suggestion_public_id, user_id, vote)
    VALUES (@publicId, @userId, @vote)
    ON CONFLICT(suggestion_public_id, user_id)
    DO UPDATE SET vote = excluded.vote, updated_at = datetime('now')
  `).run({
    publicId: suggestion.publicId,
    userId: interaction.user.id,
    vote
  });

  const counts = getSuggestionVoteCounts(suggestion.publicId);
  await interaction.message.edit({
    embeds: [suggestionEmbed(suggestion, counts)],
    components: [suggestionVoteButtons(suggestion.publicId)]
  }).catch(() => undefined);

  await interaction.followUp({
    content: `Vote recorded for **${suggestion.publicId}**.`,
    ephemeral: true
  });

  return true;
}

async function postSuggestion(interaction: ModalSubmitInteraction, suggestion: SuggestionRecord): Promise<boolean> {
  if (!config.channelIds.suggestions) {
    return false;
  }

  const channel = await interaction.client.channels.fetch(config.channelIds.suggestions).catch(() => null);
  if (!channel || !channel.isSendable()) {
    return false;
  }

  const message = await channel.send({
    embeds: [suggestionEmbed(suggestion, getSuggestionVoteCounts(suggestion.publicId))],
    components: [suggestionVoteButtons(suggestion.publicId)]
  });

  updateSuggestionMessageReference(suggestion.publicId, message.channelId, message.id);
  return true;
}

function mapSuggestion(row: SuggestionRow): SuggestionRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    username: row.username,
    category: row.category,
    modpackVersion: row.modpack_version,
    title: row.title,
    details: row.details,
    status: row.status,
    messageChannelId: row.message_channel_id,
    messageId: row.message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function textInputRow(
  customId: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  placeholder?: string
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);

  if (placeholder) {
    input.setPlaceholder(placeholder);
  }

  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}
