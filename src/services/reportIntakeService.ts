import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  StringSelectMenuBuilder
} from 'discord.js';
import type {
  Attachment,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
  MessageCreateOptions,
  StringSelectMenuInteraction,
  User
} from 'discord.js';
import { LRUCache } from 'lru-cache';
import { config } from '../config';
import { baseEmbed, bugReportEmbed, performanceReportEmbed } from '../utils/embeds';
import { redactLog } from './logParser';
import { linkReportToSession } from './playtestSessionService';
import { archiveCrashAttachment } from './crashReportService';
import { isSparkReportUrl } from './sparkReportService';
import {
  bugStatusButtons,
  createBugReport,
  createPerformanceReport,
  readTextAttachment,
  reportClaimButtons,
  reportDestinationForType,
  reportForumTagsForType,
  reportForumTitle,
  reportReceiptButtons,
  sendToConfiguredChannel
} from './reportService';
import {
  resolveSupportTicketParentId,
  ticketChannelName,
  ticketControlRows,
  ticketPermissionOverwrites
} from './supportTicketService';
import {
  supportTeamAllowedMentions,
  supportTeamPing,
  teamAlertAllowedMentions,
  teamAlertContent
} from '../utils/supportTeam';
import { postStaffLog } from './staffLogService';
import { maybeReplyWithKnownAnswer } from './qaService';
import {
  addDuplicateHintsField,
  duplicateHintsText,
  findDuplicateHints
} from './duplicateDetectionService';

type ReportIntakeType = 'bug' | 'crash' | 'performance';
type IntakeMode = 'answering' | 'review' | 'submitted';
type IntakeStartInteraction = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;
type SendPayload = string | MessageCreateOptions;
type SendResult = (content: SendPayload) => Promise<void>;
type SendableChannel = { send(content: SendPayload): Promise<unknown> };

type QuestionKind =
  | 'text'
  | 'integer'
  | 'spark'
  | 'screenshot'
  | 'bug-log'
  | 'crash-log';

interface IntakeQuestion {
  key: string;
  label: string;
  prompt: string;
  kind?: QuestionKind;
  optional?: boolean;
  defaultValue?: string | null;
  min?: number;
  max?: number;
}

interface IntakeSession {
  type: ReportIntakeType;
  channelId: string;
  userId: string;
  username: string;
  mode: IntakeMode;
  currentKey: string | null;
  editingKey: string | null;
  answers: Record<string, string | null>;
  attachments: Record<string, Attachment | undefined>;
}

const intakeTtlMs = 60 * 60_000;
const reportIntakes = new LRUCache<string, IntakeSession>({
  max: 200,
  ttl: intakeTtlMs
});

const intakeCustomIdPrefix = 'reportintake:';
const noAnswerPattern = /^(?:n\/a|na|none|not applicable|skip)$/i;
const yesPattern = /^(?:yes|y|submit|correct|looks good)$/i;
const noPattern = /^(?:no|n|edit|change)$/i;

export async function beginBugReportIntakeFromCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const sparkLink = interaction.options.getString('spark_link');
  if (sparkLink && !isSparkReportUrl(sparkLink)) {
    await interaction.reply({
      content: 'The Spark link does not look like a public Spark viewer/report URL. You can leave it blank, use `n/a`, or send a valid Spark link.',
      flags: 'Ephemeral'
    });
    return;
  }

  await beginReportIntake(interaction, 'bug', {
    answers: {
      minecraftVersion: interaction.options.getString('minecraft_version'),
      loaderVersion: interaction.options.getString('loader_version'),
      playMode: interaction.options.getString('play_mode'),
      location: interaction.options.getString('location'),
      anomalyContext: interaction.options.getString('nearby_feature'),
      repeatable: interaction.options.getString('repeatable'),
      sparkLink,
      playtestSessionId: interaction.options.getString('playtest_session')
    },
    attachments: {
      screenshot: interaction.options.getAttachment('screenshot') ?? undefined,
      bugLog: interaction.options.getAttachment('log_attachment') ?? undefined
    }
  });
}

export async function beginBugReportIntakeFromPanel(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
  await beginReportIntake(interaction, 'bug');
}

export async function beginPerformanceReportIntakeFromCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const renderDistance = interaction.options.getInteger('render_distance');
  await beginReportIntake(interaction, 'performance', {
    answers: {
      cpuGpu: interaction.options.getString('cpu_gpu'),
      javaVersion: interaction.options.getString('java_version'),
      launcher: interaction.options.getString('launcher'),
      shaders: interaction.options.getString('shaders'),
      renderDistance: renderDistance === null ? null : renderDistance.toString()
    }
  });
}

export async function beginPerformanceReportIntakeFromPanel(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
  await beginReportIntake(interaction, 'performance');
}

export async function beginCrashReportIntakeFromCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await beginReportIntake(interaction, 'crash', {
    answers: {
      playtestSessionId: interaction.options.getString('playtest_session')
    },
    attachments: {
      crashLog: interaction.options.getAttachment('file') ?? undefined
    }
  });
}

export async function beginCrashReportIntakeFromPanel(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
  await beginReportIntake(interaction, 'crash');
}

export async function handleReportIntakeMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild) {
    return false;
  }

  const session = reportIntakes.get(message.channelId);
  if (!session) {
    return false;
  }

  if (message.author.id !== session.userId) {
    return false;
  }

  if (await maybeReplyWithKnownAnswer(message, {
    requireQuestion: true,
    supportStatus: 'You are inside a guided support form. Reply with the requested detail when you are ready, and I will keep the form in the same place.'
  })) {
    return true;
  }

  if (session.mode === 'submitted') {
    await message.reply({
      content: 'This report has already been submitted. Thanks for getting the details in.',
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (session.mode === 'review') {
    const reply = message.content.trim();
    if (yesPattern.test(reply)) {
      await submitSessionFromMessage(message, session);
      return true;
    }

    if (noPattern.test(reply)) {
      await sendEditPicker(message, session);
      return true;
    }

    await message.reply({
      content: 'Please reply `yes` to submit, `no` to edit something, or use the buttons on the review message.',
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  const question = currentQuestion(session) ?? nextQuestion(session);
  if (!question) {
    await showReview(messageSender(message), session);
    return true;
  }

  session.currentKey = question.key;
  const result = await applyAnswer(session, question, message);
  if (!result.ok) {
    await message.reply({
      content: result.message,
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (session.editingKey) {
    session.editingKey = null;
    session.currentKey = null;
    await showReview(messageSender(message), session);
    return true;
  }

  await askNextQuestion(messageSender(message), session);
  return true;
}

export async function handleReportIntakeComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith(intakeCustomIdPrefix)) {
    return false;
  }

  const session = reportIntakes.get(interaction.channelId);
  if (!session) {
    await interaction.reply({
      content: 'This report intake expired. Please start a fresh report from the Support Hub when you are ready.',
      flags: 'Ephemeral'
    });
    return true;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: 'This intake belongs to the player who opened it, so only they can use these controls.',
      flags: 'Ephemeral'
    });
    return true;
  }

  const action = interaction.customId.slice(intakeCustomIdPrefix.length);
  if (interaction.isStringSelectMenu()) {
    if (action !== 'edit-field') {
      return true;
    }

    const selectedKey = interaction.values[0];
    const question = questionsForType(session.type).find((candidate) => candidate.key === selectedKey);
    if (!question) {
      await interaction.reply({ content: 'This field is no longer available to edit. Please choose another field from the review menu.', flags: 'Ephemeral' });
      return true;
    }

    session.mode = 'answering';
    session.currentKey = question.key;
    session.editingKey = question.key;
    await interaction.update({
      content: `No problem. Editing **${question.label}** now; answer the question below.`,
      embeds: [],
      components: []
    });
    await sendQuestion(interactionSender(interaction), session, question);
    return true;
  }

  if (action === 'submit') {
    await interaction.update({ components: [] });
    await submitSessionFromInteraction(interaction, session);
    return true;
  }

  if (action === 'edit') {
    await interaction.update({
      content: 'Sure. Pick the field you want to edit.',
      embeds: [reviewEmbed(session)],
      components: [editPickerRow(session)]
    });
    return true;
  }

  if (action === 'cancel') {
    session.mode = 'submitted';
    reportIntakes.delete(session.channelId);
    await postStaffLog(interaction.client, {
      title: 'Report Intake Cancelled',
      description: `${reportLabel(session.type)} intake cancelled by the player.`,
      fields: [
        { name: 'Channel', value: `<#${session.channelId}> (${session.channelId})`, inline: true },
        { name: 'Player', value: `<@${session.userId}> (${session.username})`, inline: true }
      ]
    });
    await interaction.update({
      content: 'Report intake cancelled. You can close this channel, or start again from the Support Hub whenever you are ready.',
      embeds: [],
      components: []
    });
    return true;
  }

  return true;
}

async function beginReportIntake(
  interaction: IntakeStartInteraction,
  type: ReportIntakeType,
  seed: {
    answers?: Record<string, string | null>;
    attachments?: Record<string, Attachment | undefined>;
  } = {}
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'I can only create report intake channels inside the Discord server.',
      flags: 'Ephemeral'
    });
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await interaction.reply({
      content: 'I need the Manage Channels permission before I can make a private report intake channel. Staff can fix that permission and try again.',
      flags: 'Ephemeral'
    });
    return;
  }

  const parent = await resolveSupportTicketParentId(interaction);
  if (parent.error) {
    await interaction.reply({
      content: `${parent.error} Please fix \`SUPPORT_TICKET_CATEGORY_ID\` or ask staff to create a private report channel.`,
      flags: 'Ephemeral'
    });
    return;
  }

  const botUserId = interaction.client.user?.id ?? botMember.id;
  const channel = await interaction.guild.channels.create({
    name: ticketChannelName(`${type}-intake`, interaction.user.username),
    type: ChannelType.GuildText,
    parent: parent.parentId,
    topic: `${reportLabel(type)} intake for ${interaction.user.tag} (${interaction.user.id})`,
    reason: `${reportLabel(type)} intake opened by ${interaction.user.tag}`,
    permissionOverwrites: ticketPermissionOverwrites(interaction.guild.roles.everyone.id, interaction.user.id, botUserId)
  });

  const session: IntakeSession = {
    type,
    channelId: channel.id,
    userId: interaction.user.id,
    username: interaction.user.tag,
    mode: 'answering',
    currentKey: null,
    editingKey: null,
    answers: cleanSeedAnswers(seed.answers ?? {}),
    attachments: seed.attachments ?? {}
  };

  for (const [key, attachment] of Object.entries(session.attachments)) {
    if (attachment) {
      session.answers[key] = attachment.name;
    }
  }

  reportIntakes.set(channel.id, session);

  await postStaffLog(interaction.client, {
    title: 'Report Intake Created',
    description: `${reportLabel(type)} private intake opened.`,
    fields: [
      { name: 'Channel', value: `<#${channel.id}> (${channel.id})`, inline: true },
      { name: 'Player', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
      { name: 'Type', value: type, inline: true }
    ]
  });

  await channel.send({
    content: `<@${interaction.user.id}>`,
    allowedMentions: { users: [interaction.user.id] },
    embeds: [introEmbed(session)],
    components: ticketControlRows()
  });
  await askNextQuestion(channelSender(channel), session);

  await interaction.reply({
    content: `I created a private ${reportLabel(type).toLowerCase()} intake channel for you: <#${channel.id}>. I will ask the questions there; use \`n/a\` for optional fields.`,
    flags: 'Ephemeral'
  });
}

function cleanSeedAnswers(input: Record<string, string | null>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, value?.trim() || null])
  );
}

function questionsForType(type: ReportIntakeType): IntakeQuestion[] {
  if (type === 'bug') {
    return [
      {
        key: 'modpackVersion',
        label: 'Modpack version',
        prompt: 'What modpack version are you using?',
        defaultValue: defaultModpackVersion()
      },
      {
        key: 'minecraftVersion',
        label: 'Minecraft version',
        prompt: 'What Minecraft version are you on?',
        optional: true
      },
      {
        key: 'loaderVersion',
        label: 'NeoForge/Forge version',
        prompt: 'What NeoForge or Forge version are you using?',
        optional: true
      },
      {
        key: 'playMode',
        label: 'Mode',
        prompt: 'Were you playing singleplayer, multiplayer server, LAN, or something else?',
        defaultValue: 'Not sure'
      },
      {
        key: 'happened',
        label: 'What happened',
        prompt: 'Describe the bug clearly. What did you see happen?'
      },
      {
        key: 'expected',
        label: 'Expected',
        prompt: 'What did you expect to happen instead?'
      },
      {
        key: 'steps',
        label: 'Steps to reproduce',
        prompt: 'List the steps staff can try to reproduce the issue.'
      },
      {
        key: 'repeatable',
        label: 'Repeatable',
        prompt: 'Can you repeat the issue? For example: yes, no, sometimes, or not sure.',
        optional: true
      },
      {
        key: 'location',
        label: 'Dimension/location',
        prompt: 'Where did this happen? Include dimension, coordinates, biome, or nearby place if useful.',
        optional: true
      },
      {
        key: 'anomalyContext',
        label: 'Nearby feature',
        prompt: 'Was it near special Wilderness Oddesy content like a rift, anomaly, structure, mob, or custom item?',
        optional: true
      },
      {
        key: 'sparkLink',
        label: 'Spark link',
        prompt: 'If this involved lag or freezing, paste a public Spark viewer/report URL.',
        kind: 'spark',
        optional: true
      },
      {
        key: 'screenshot',
        label: 'Screenshot',
        prompt: 'Attach an optional screenshot or paste a screenshot link.',
        kind: 'screenshot',
        optional: true
      },
      {
        key: 'bugLog',
        label: 'Log attachment',
        prompt: 'Attach an optional `.txt` or `.log` latest.log/crash report. It will be redacted before storage.',
        kind: 'bug-log',
        optional: true
      },
      {
        key: 'playtestSessionId',
        label: 'Playtest session',
        prompt: 'If this happened during a playtest, provide the session ID like WO-TEST-0001.',
        optional: true
      },
      {
        key: 'bugContext',
        label: 'Extra context',
        prompt: 'Anything else staff should know?',
        optional: true
      }
    ];
  }

  if (type === 'performance') {
    return [
      {
        key: 'modpackVersion',
        label: 'Modpack version',
        prompt: 'What modpack version are you using?',
        defaultValue: defaultModpackVersion()
      },
      {
        key: 'fpsAverage',
        label: 'FPS average',
        prompt: 'What FPS are you usually seeing?'
      },
      {
        key: 'ramAllocated',
        label: 'RAM allocated',
        prompt: 'How much RAM is allocated to Minecraft?'
      },
      {
        key: 'cpuGpu',
        label: 'CPU/GPU',
        prompt: 'What CPU and GPU are you using?',
        optional: true
      },
      {
        key: 'javaVersion',
        label: 'Java',
        prompt: 'What Java version is your launcher using?',
        optional: true
      },
      {
        key: 'launcher',
        label: 'Launcher',
        prompt: 'What launcher are you using?',
        optional: true
      },
      {
        key: 'shaders',
        label: 'Shaders',
        prompt: 'Are shaders on, off, or are you not sure?',
        optional: true
      },
      {
        key: 'renderDistance',
        label: 'Render distance',
        prompt: 'What render distance are you using, in chunks?',
        kind: 'integer',
        optional: true,
        min: 2,
        max: 64
      },
      {
        key: 'lagLocation',
        label: 'Where lag happens',
        prompt: 'Where does the lag happen? Mention structures, dimensions, biomes, entities, or worldgen if relevant.'
      },
      {
        key: 'activity',
        label: 'What the player was doing',
        prompt: 'What were you doing when the lag happened?'
      }
    ];
  }

  return [
    {
      key: 'crashLog',
      label: 'Crash/latest log',
      prompt: 'Attach your `latest.log` or crash report as a `.txt` or `.log` file.',
      kind: 'crash-log'
    },
    {
      key: 'activity',
      label: 'What were you doing?',
      prompt: 'What were you doing right before it crashed? If it crashed during loading, say that.'
    },
    {
      key: 'steps',
      label: 'Reproduction steps',
      prompt: 'List the steps to reproduce the crash, if applicable.',
      optional: true
    },
    {
      key: 'playtestSessionId',
      label: 'Playtest session',
      prompt: 'If this happened during a playtest, provide the session ID like WO-TEST-0001.',
      optional: true
    }
  ];
}

function currentQuestion(session: IntakeSession): IntakeQuestion | null {
  if (!session.currentKey) {
    return null;
  }

  return questionsForType(session.type).find((question) => question.key === session.currentKey) ?? null;
}

function nextQuestion(session: IntakeSession): IntakeQuestion | null {
  const next = questionsForType(session.type).find((question) => !hasAnswer(session, question));
  session.currentKey = next?.key ?? null;
  return next ?? null;
}

function hasAnswer(session: IntakeSession, question: IntakeQuestion): boolean {
  return Object.prototype.hasOwnProperty.call(session.answers, question.key)
    || Boolean(session.attachments[question.key]);
}

async function askNextQuestion(sendResult: SendResult, session: IntakeSession): Promise<void> {
  const question = nextQuestion(session);
  if (!question) {
    await showReview(sendResult, session);
    return;
  }

  await sendQuestion(sendResult, session, question);
}

async function sendQuestion(
  sendResult: SendResult,
  session: IntakeSession,
  question: IntakeQuestion
): Promise<void> {
  const questions = questionsForType(session.type);
  const index = questions.findIndex((candidate) => candidate.key === question.key) + 1;
  const embed = baseEmbed(`${question.label} (${index}/${questions.length})`, question.prompt)
    .addFields({ name: 'How to answer', value: answerInstructions(question) });

  await sendResult({ embeds: [embed] });
}

function answerInstructions(question: IntakeQuestion): string {
  const parts = [];
  if (question.optional) {
    parts.push('Reply `n/a` if you do not want to provide this.');
  }

  if (question.defaultValue) {
    parts.push(`Reply \`n/a\` to use \`${question.defaultValue}\`.`);
  }

  if (question.kind === 'bug-log' || question.kind === 'crash-log') {
    parts.push('Upload the file as a normal Discord attachment.');
  } else if (question.kind === 'screenshot') {
    parts.push('Upload an image or paste a link.');
  }

  return parts.join(' ') || 'Reply with your answer in this channel.';
}

async function applyAnswer(
  session: IntakeSession,
  question: IntakeQuestion,
  message: Message
): Promise<{ ok: true } | { ok: false; message: string }> {
  const raw = message.content.trim();
  const attachment = message.attachments.first();
  const isNoAnswer = noAnswerPattern.test(raw);
  session.attachments[question.key] = undefined;

  if (question.kind === 'screenshot') {
    if (isNoAnswer) {
      session.answers[question.key] = null;
      return { ok: true };
    }

    if (attachment) {
      session.attachments[question.key] = attachment;
      session.answers[question.key] = attachment.name;
      return { ok: true };
    }

    if (isHttpUrl(raw)) {
      session.answers[question.key] = raw;
      return { ok: true };
    }

    return { ok: false, message: 'Attach a screenshot, paste a screenshot link, or reply `n/a`.' };
  }

  if (question.kind === 'bug-log' || question.kind === 'crash-log') {
    if (isNoAnswer && question.optional) {
      session.answers[question.key] = null;
      return { ok: true };
    }

    if (!attachment) {
      return { ok: false, message: 'Attach a `.txt` or `.log` file for this question.' };
    }

    if (!isTextLogAttachment(attachment)) {
      return { ok: false, message: 'Please attach a `.txt` or `.log` file.' };
    }

    session.attachments[question.key] = attachment;
    session.answers[question.key] = attachment.name;
    return { ok: true };
  }

  if (isNoAnswer) {
    if (question.optional) {
      session.answers[question.key] = null;
      return { ok: true };
    }

    if (question.defaultValue) {
      session.answers[question.key] = question.defaultValue;
      return { ok: true };
    }

    return { ok: false, message: 'This field is required. Please answer it, or cancel the intake.' };
  }

  if (!raw) {
    return { ok: false, message: 'Please reply with an answer.' };
  }

  if (question.kind === 'spark' && !isSparkReportUrl(raw)) {
      return {
        ok: false,
        message: 'This does not look like a public Spark viewer/report URL. Please paste a valid Spark link or reply `n/a`.'
      };
  }

  if (question.kind === 'integer') {
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value)) {
      return { ok: false, message: 'Please reply with a whole number, or `n/a`.' };
    }

    if ((question.min !== undefined && value < question.min) || (question.max !== undefined && value > question.max)) {
      return { ok: false, message: `Please use a number from ${question.min} to ${question.max}, or reply \`n/a\`.` };
    }

    session.answers[question.key] = value.toString();
    return { ok: true };
  }

  session.answers[question.key] = raw;
  return { ok: true };
}

async function showReview(sendResult: SendResult, session: IntakeSession): Promise<void> {
  session.mode = 'review';
  session.currentKey = null;
  await sendResult({
    content: 'Does this information look correct? Reply `yes` to submit or `no` to edit, or use the buttons.',
    embeds: [reviewEmbed(session)],
    components: [reviewButtonsRow()]
  });
}

async function sendEditPicker(message: Message, session: IntakeSession): Promise<void> {
  await message.reply({
    content: 'Sure. Pick the field you want to edit.',
    embeds: [reviewEmbed(session)],
    components: [editPickerRow(session)],
    allowedMentions: { repliedUser: false }
  });
}

function reviewEmbed(session: IntakeSession) {
  const embed = baseEmbed(`Review ${reportLabel(session.type)}`, 'Confirm the details before I post this to the forum.');
  for (const question of questionsForType(session.type)) {
    embed.addFields({
      name: question.label,
      value: displayAnswer(session, question)
    });
  }
  if (session.type !== 'crash') {
    const hints = findDuplicateHints(intakeDuplicateInput(session));
    embed.addFields({
      name: 'Possible duplicates',
      value: duplicateHintsText(hints)
    });
  }
  return embed;
}

function reviewButtonsRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${intakeCustomIdPrefix}submit`)
      .setLabel('Submit')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${intakeCustomIdPrefix}edit`)
      .setLabel('Edit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${intakeCustomIdPrefix}cancel`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );
}

function editPickerRow(session: IntakeSession): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${intakeCustomIdPrefix}edit-field`)
      .setPlaceholder('Choose a field to edit')
      .addOptions(questionsForType(session.type).map((question) => ({
        label: question.label.slice(0, 100),
        value: question.key,
        description: question.prompt.slice(0, 100)
      })))
  );
}

async function submitSessionFromMessage(message: Message, session: IntakeSession): Promise<void> {
  session.mode = 'submitted';
  const sendResult = messageSender(message);
  await sendResult('Thanks. Submitting this report now...');
  await submitSession(session, message.client, message.author, sendResult);
}

async function submitSessionFromInteraction(interaction: ButtonInteraction, session: IntakeSession): Promise<void> {
  session.mode = 'submitted';
  await submitSession(session, interaction.client, interaction.user, interactionSender(interaction));
}

async function submitSession(
  session: IntakeSession,
  client: Message['client'],
  user: User,
  sendResult: SendResult
): Promise<void> {
  try {
    if (session.type === 'bug') {
      await submitBugReport(session, client, user, sendResult);
    } else if (session.type === 'performance') {
      await submitPerformanceReport(session, client, user, sendResult);
    } else {
      await submitCrashReport(session, client, user, sendResult);
    }

    reportIntakes.delete(session.channelId);
  } catch (error) {
    session.mode = 'review';
    await sendResult({
      content: error instanceof Error
        ? `Sorry, I could not submit that report yet: ${error.message}`
        : 'Sorry, I could not submit that report because of an unknown error.',
      embeds: [reviewEmbed(session)],
      components: [reviewButtonsRow()]
    });
  }
}

async function submitBugReport(
  session: IntakeSession,
  client: Message['client'],
  user: User,
  sendResult: SendResult
): Promise<void> {
  const bugLog = session.attachments.bugLog;
  let redactedLog: string | null = null;
  if (bugLog) {
    const logText = await readTextAttachment(bugLog);
    redactedLog = redactLog(logText).slice(0, 120_000);
  }

  const screenshot = session.attachments.screenshot;
  const screenshotText = answer(session, 'screenshot');
  const screenshotUrl = screenshot?.url ?? (screenshotText && isHttpUrl(screenshotText) ? screenshotText : null);
  const screenshotName = screenshot?.name ?? (screenshotUrl ? 'Screenshot' : null);

  const report = createBugReport({
    userId: user.id,
    username: user.tag,
    modpackVersion: modpackVersionFromAnswer(answer(session, 'modpackVersion')),
    minecraftVersion: answer(session, 'minecraftVersion'),
    loaderVersion: answer(session, 'loaderVersion'),
    playMode: answer(session, 'playMode') ?? 'Not sure',
    happened: requiredAnswer(session, 'happened'),
    expected: requiredAnswer(session, 'expected'),
    steps: requiredAnswer(session, 'steps'),
    bugContext: answer(session, 'bugContext'),
    location: answer(session, 'location'),
    anomalyContext: answer(session, 'anomalyContext'),
    repeatable: answer(session, 'repeatable'),
    sparkLink: answer(session, 'sparkLink'),
    attachmentUrl: screenshotUrl,
    attachmentName: screenshotName,
    screenshotUrl,
    screenshotName,
    logFileName: bugLog?.name ?? null,
    redactedLog
  });

  const playtestSessionId = answer(session, 'playtestSessionId');
  if (playtestSessionId) {
    linkReportToSession(playtestSessionId, 'bug', report.publicId);
  }
  const duplicateHints = findDuplicateHints({
    type: 'bug',
    text: bugDuplicateText(report),
    modpackVersion: report.modpackVersion,
    excludePublicId: report.publicId
  });
  const reportEmbed = addDuplicateHintsField(bugReportEmbed(report), duplicateHints);

  const posted = await sendToConfiguredChannel(
    client,
    reportDestinationForType('bug'),
    {
      content: teamAlertContent('New bug report needs triage.', ['support', 'dev']),
      allowedMentions: teamAlertAllowedMentions(['support', 'dev']),
      embeds: [reportEmbed],
      components: [...bugStatusButtons(report.publicId), reportClaimButtons('bug', report.publicId)]
    },
    {
      forumPost: {
        title: reportForumTitle(report.publicId, 'Bug', report.happened),
        tags: reportForumTagsForType('bug')
      }
    }
  );

  await sendResult({
    content: `Thanks, your bug report was submitted as **${report.publicId}**.${posted ? '' : ' Staff channel posting is not configured yet, but I saved the report locally.'}`,
    embeds: [reportEmbed],
    components: [reportReceiptButtons('bug', report.publicId)],
    allowedMentions: { parse: [] }
  });

  await postStaffLog(client, {
    title: 'Bug Report Submitted',
    description: `Private intake submitted as **${report.publicId}**.`,
    fields: [
      { name: 'Report', value: report.publicId, inline: true },
      { name: 'Player', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Forum posted', value: posted ? 'Yes' : 'No', inline: true }
    ]
  });
}

async function submitPerformanceReport(
  session: IntakeSession,
  client: Message['client'],
  user: User,
  sendResult: SendResult
): Promise<void> {
  const report = createPerformanceReport({
    userId: user.id,
    username: user.tag,
    modpackVersion: modpackVersionFromAnswer(answer(session, 'modpackVersion')),
    fpsAverage: requiredAnswer(session, 'fpsAverage'),
    ramAllocated: requiredAnswer(session, 'ramAllocated'),
    cpuGpu: answer(session, 'cpuGpu'),
    javaVersion: answer(session, 'javaVersion'),
    launcher: answer(session, 'launcher'),
    shaders: answer(session, 'shaders'),
    renderDistance: numberAnswer(session, 'renderDistance'),
    lagLocation: requiredAnswer(session, 'lagLocation'),
    activity: requiredAnswer(session, 'activity')
  });
  const duplicateHints = findDuplicateHints({
    type: 'performance',
    text: performanceDuplicateText(report),
    modpackVersion: report.modpackVersion,
    excludePublicId: report.publicId
  });
  const reportEmbed = addDuplicateHintsField(performanceReportEmbed(report), duplicateHints);

  const posted = await sendToConfiguredChannel(
    client,
    reportDestinationForType('performance'),
    {
      content: supportTeamPing('New performance report needs triage.'),
      allowedMentions: supportTeamAllowedMentions(),
      embeds: [reportEmbed],
      components: [reportClaimButtons('performance', report.publicId)]
    },
    {
      forumPost: {
        title: reportForumTitle(report.publicId, 'Performance', report.lagLocation),
        tags: reportForumTagsForType('performance')
      }
    }
  );

  await sendResult({
    content: `Thanks, your performance report was submitted as **${report.publicId}**.${posted ? '' : ' Staff channel posting is not configured yet, but I saved the report locally.'}`,
    embeds: [reportEmbed],
    components: [reportReceiptButtons('performance', report.publicId)],
    allowedMentions: { parse: [] }
  });

  await postStaffLog(client, {
    title: 'Performance Report Submitted',
    description: `Private intake submitted as **${report.publicId}**.`,
    fields: [
      { name: 'Report', value: report.publicId, inline: true },
      { name: 'Player', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Forum posted', value: posted ? 'Yes' : 'No', inline: true }
    ]
  });
}

async function submitCrashReport(
  session: IntakeSession,
  client: Message['client'],
  user: User,
  sendResult: SendResult
): Promise<void> {
  const attachment = session.attachments.crashLog;
  if (!attachment) {
    throw new Error('Please attach a crash report or latest.log file before submitting.');
  }

  const result = await archiveCrashAttachment({
    client,
    user,
    attachment,
    playtestSessionId: answer(session, 'playtestSessionId'),
    activity: answer(session, 'activity'),
    steps: answer(session, 'steps')
  });

  await sendResult({
    content: result.posted
      ? `Thanks, your crash report was submitted as **${result.report.publicId}** and sent to staff.`
      : `Thanks, your crash report was saved as **${result.report.publicId}**. Staff channel posting is not configured yet, but I kept the report locally.`,
    embeds: [result.embed],
    components: [reportReceiptButtons('crash', result.report.publicId)],
    allowedMentions: { parse: [] }
  });

  await postStaffLog(client, {
    title: 'Crash Report Submitted',
    description: `Private intake submitted as **${result.report.publicId}**.`,
    fields: [
      { name: 'Report', value: result.report.publicId, inline: true },
      { name: 'Player', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: 'Forum posted', value: result.posted ? 'Yes' : 'No', inline: true }
    ]
  });
}

function introEmbed(session: IntakeSession) {
  return baseEmbed(`${reportLabel(session.type)} Intake`, 'I will walk you through this one question at a time, then show a review before posting.')
    .addFields(
      { name: 'Optional fields', value: 'Reply `n/a` if you do not want to provide an optional field.' },
      { name: 'Review', value: 'At the end, reply `yes` to submit or `no` to edit a field before the forum post is created.' },
      { name: 'Privacy', value: 'Do not share passwords, tokens, private files, or personal information.' }
    );
}

function displayAnswer(session: IntakeSession, question: IntakeQuestion): string {
  const attachment = session.attachments[question.key];
  if (attachment) {
    return truncateForEmbed(attachment.name);
  }

  const value = session.answers[question.key];
  return value?.trim() ? truncateForEmbed(value) : 'n/a';
}

function answer(session: IntakeSession, key: string): string | null {
  const value = session.answers[key];
  return value?.trim() || null;
}

function requiredAnswer(session: IntakeSession, key: string): string {
  const value = answer(session, key);
  if (!value) {
    throw new Error(`Missing required answer: ${key}`);
  }

  return value;
}

function numberAnswer(session: IntakeSession, key: string): number | null {
  const value = answer(session, key);
  return value === null ? null : Number.parseInt(value, 10);
}

function defaultModpackVersion(): string | null {
  const value = config.status.latestModpackVersion.trim();
  return value && value !== 'Not configured' ? value : null;
}

function modpackVersionFromAnswer(value: string | null): string {
  return value?.trim() || defaultModpackVersion() || 'Not specified';
}

function reportLabel(type: ReportIntakeType): string {
  return {
    bug: 'Bug Report',
    crash: 'Crash Report',
    performance: 'Performance Report'
  }[type];
}

function intakeDuplicateInput(session: IntakeSession): Parameters<typeof findDuplicateHints>[0] {
  if (session.type === 'performance') {
    return {
      type: 'performance',
      text: [
        answer(session, 'lagLocation'),
        answer(session, 'activity'),
        answer(session, 'cpuGpu'),
        answer(session, 'javaVersion'),
        answer(session, 'launcher'),
        answer(session, 'shaders')
      ].filter(Boolean).join(' '),
      modpackVersion: answer(session, 'modpackVersion')
    };
  }

  return {
    type: 'bug',
    text: [
      answer(session, 'happened'),
      answer(session, 'expected'),
      answer(session, 'steps'),
      answer(session, 'bugContext'),
      answer(session, 'location'),
      answer(session, 'anomalyContext'),
      answer(session, 'repeatable')
    ].filter(Boolean).join(' '),
    modpackVersion: answer(session, 'modpackVersion')
  };
}

function bugDuplicateText(report: {
  happened: string;
  expected: string;
  steps: string;
  bugContext: string | null;
  location: string | null;
  anomalyContext: string | null;
  repeatable: string | null;
}): string {
  return [
    report.happened,
    report.expected,
    report.steps,
    report.bugContext,
    report.location,
    report.anomalyContext,
    report.repeatable
  ].filter(Boolean).join(' ');
}

function performanceDuplicateText(report: {
  lagLocation: string;
  activity: string;
  cpuGpu: string | null;
  javaVersion: string | null;
  launcher: string | null;
  shaders: string | null;
}): string {
  return [
    report.lagLocation,
    report.activity,
    report.cpuGpu,
    report.javaVersion,
    report.launcher,
    report.shaders
  ].filter(Boolean).join(' ');
}

function isTextLogAttachment(attachment: Attachment): boolean {
  const lowerName = attachment.name.toLowerCase();
  return lowerName.endsWith('.txt') || lowerName.endsWith('.log');
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function truncateForEmbed(value: string, max = 1024): string {
  const clean = value.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`;
}

function channelSender(channel: unknown): SendResult {
  const sendable = channel as SendableChannel | null | undefined;
  if (!sendable || typeof sendable.send !== 'function') {
    throw new Error('This report intake channel is not sendable.');
  }

  return async (content) => {
    await sendable.send(content);
  };
}

function messageSender(message: Message): SendResult {
  return channelSender(message.channel);
}

function interactionSender(interaction: ButtonInteraction | StringSelectMenuInteraction): SendResult {
  const sendable = interaction.channel as SendableChannel | null | undefined;
  if (sendable && typeof sendable.send === 'function') {
    return async (content) => {
      await sendable.send(content);
    };
  }

  return async (content) => {
    if (typeof content === 'string') {
      await interaction.followUp({ content, flags: 'Ephemeral' });
      return;
    }

    await interaction.followUp({ ...content, flags: 'Ephemeral' });
  };
}
