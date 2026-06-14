import { EmbedBuilder } from 'discord.js';
import type {
  BugReportRecord,
  ChangelogEntryRecord,
  CrashReportRecord,
  FeedbackReportRecord,
  KnownIssueRecord,
  PerformanceReportRecord,
  ReportSearchResult,
  SuggestionRecord,
  SuggestionVoteCounts
} from '../types';
import type {
  LinkedReportRecord,
  PlaytestReleaseAcceptanceRecord,
  PlaytestReleaseRecord,
  PlaytestSessionRecord
} from '../types/playtest';
import type { SparkReportRecord } from '../types/spark';

export const colors = {
  primary: 0x4f7f5f,
  danger: 0x9f3f3f,
  warning: 0xb88935,
  calm: 0x426d86,
  staff: 0x6d5b98
};

export function truncate(value: string | null | undefined, max = 1024): string {
  if (!value?.trim()) {
    return 'Not provided';
  }

  const clean = value.trim();
  if (clean.length <= max) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function claimedByText(userId: string | null | undefined): string {
  return userId ? `<@${userId}>` : 'Unclaimed';
}

function hasProvidedValue(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function hasDisplayableBugMode(value: string | null | undefined): value is string {
  return hasProvidedValue(value) && value.trim() !== 'Not specified from support panel';
}

export function baseEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(colors.primary)
    .setTimestamp()
    .setFooter({ text: 'Wilderness Oddesy systems online.' });

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

export function privacyEmbed(): EmbedBuilder {
  return baseEmbed(
    'Privacy and Reports',
    'Wilderness Oddesy support reports are opt-in and meant only to help staff diagnose modpack issues.'
  )
    .addFields(
      {
        name: 'What the bot collects',
        value: 'Report text you submit, private support/report ticket transcripts, attached crash/latest logs you choose to upload, the report category, Discord user ID/name for follow-up, and timestamps.'
      },
      {
        name: 'What the bot does not collect',
        value: 'No general server chat logs, IP addresses, Discord tokens, personal files, passwords, private messages, or background telemetry.'
      },
      {
        name: 'Crash/performance reports',
        value: 'These are opt-in. Logs and optional playtest logs are redacted best-effort before storage to remove tokens, emails, IP addresses, and local file paths.'
      },
      {
        name: 'Spark reports',
        value: 'The bot stores Spark viewer links that testers submit. It does not run Minecraft commands or scrape private Spark data.'
      },
      {
        name: 'Playtest access',
        value: 'For closed playtests, the bot can record that you accepted the playtest terms/privacy notice before it sends the test package link.'
      },
      {
        name: 'Future Minecraft mod integration',
        value: 'In-game reports should go to a small backend API/webhook endpoint. A Minecraft mod must never contain or use the Discord bot token.'
      }
    );
}

export function playtestTermsEmbeds(): EmbedBuilder[] {
  return [
    baseEmbed(
      'Wilderness Odyssey Playtest Terms',
      'By accepting a playtest gate, you agree to these playtest rules before receiving the test build.'
    )
      .addFields(
        {
          name: 'Who can participate',
          value: 'You must be allowed to use Discord and Minecraft, be at least 13, have parent/guardian permission if required where you live, follow server rules, and complete Minecraft verification when required.'
        },
        {
          name: 'What the playtest is',
          value: 'Playtests are temporary access to unreleased or experimental builds. Builds may crash, lag, corrupt worlds, break balance, or include unfinished content. Back up worlds before testing.'
        },
        {
          name: 'Access rules',
          value: 'Do not share the ZIP, download link, private channel access, private instructions, unreleased spoilers, or test build unless staff says it is allowed. Do not reupload, sell, or claim the build as your own.'
        },
        {
          name: 'Feedback and reports',
          value: 'Reports, logs, screenshots, Spark links, suggestions, and feedback may be used by staff to debug, reproduce issues, plan changes, update known issues, and write changelogs. Staff may merge, summarize, close, or reject reports.'
        }
      ),
    baseEmbed('Playtest Terms Continued')
      .addFields(
        {
          name: 'Public and private reports',
          value: 'Bug, crash, feedback, and suggestion posts may be public in Discord forums so other testers can help confirm details. Use private staff tickets for personal account issues, exploits, security issues, or private information.'
        },
        {
          name: 'Privacy and logs',
          value: 'The bot may record that you accepted the playtest gate. Do not upload passwords, tokens, private files, or personal information. Log redaction is best-effort and may not catch everything.'
        },
        {
          name: 'No warranty',
          value: 'Playtest builds are provided as-is for testing. Stability, compatibility, world safety, performance, and availability are not guaranteed.'
        },
        {
          name: 'Third-party services',
          value: 'Discord, Minecraft/Microsoft, CurseForge or another launcher, Spark, and file hosts may be involved. Those services have their own rules and privacy practices.'
        },
        {
          name: 'Changes and questions',
          value: 'Staff may update these terms as the playtest changes. Ask staff before accepting if something is unclear.'
        }
      )
  ];
}

export function playtestPrivacyPolicyEmbeds(): EmbedBuilder[] {
  return [
    baseEmbed(
      'Wilderness Odyssey Privacy Policy',
      'This explains what the support bot and playtest flow collect, why it is collected, and how it is used.'
    )
      .addFields(
        {
          name: 'Short version',
          value: 'We collect only what is needed for support, reports, suggestions, Minecraft verification, and playtest access. We do not sell personal information.'
        },
        {
          name: 'Age',
          value: 'The playtest and support bot are not intended for children under 13. If you are under 13, do not use playtest access, submit reports, or link a Minecraft account.'
        },
        {
          name: 'What the bot may collect',
          value: 'Discord user ID/name, timestamps, report text, private support/report ticket transcripts, channel/message/report IDs, uploaded crash/latest.log files, redacted log excerpts, attachment links, suggestion votes, playtest sessions, acceptance records, Minecraft UUID/name, and staff actions.'
        },
        {
          name: 'What the bot does not intentionally collect',
          value: 'Discord tokens, passwords, Minecraft/Microsoft credentials, payment details, private Discord DMs, whole-computer files, or background gameplay telemetry.'
        }
      ),
    baseEmbed('Privacy Policy Continued')
      .addFields(
        {
          name: 'Why this is collected',
          value: 'To run support, diagnose crashes, verify playtesters, gate ZIP delivery, prevent duplicate reports, track known issues/upcoming fixes, let staff follow up, and improve Wilderness Odyssey.'
        },
        {
          name: 'Who can see it',
          value: 'Public report forum posts may be visible to server members. Private tickets are visible to the user, bot, and support staff. Ticket transcripts are sent to the ticket owner and staff log. Staff-only logs and database records are visible to authorized staff.'
        },
        {
          name: 'Third-party services',
          value: 'Discord, Minecraft/Microsoft, CurseForge or another launcher/file host, Spark, Sentry if enabled, and Prometheus-compatible metrics if enabled may process related data under their own policies.'
        },
        {
          name: 'Retention and deletion',
          value: 'Reports and playtest records are kept while useful for support, debugging, moderation, known issues, changelogs, or project history. Use `/minecraft unlink` to remove your Minecraft link. Ask staff about deletion or anonymization requests.'
        },
        {
          name: 'Security',
          value: 'Staff should limit access to bot tokens, the database, the bot host, staff channels, and private tickets. The Minecraft client must never contain the Discord bot token.'
        }
      )
  ];
}

export function bugReportEmbed(report: BugReportRecord): EmbedBuilder {
  const embed = baseEmbed(`Bug Report ${report.publicId}`, 'Anomaly report archived.')
    .setColor(colors.warning)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Claimed by', value: claimedByText(report.claimedBy), inline: true },
      { name: 'Modpack version', value: truncate(report.modpackVersion, 128), inline: true }
    );

  if (hasProvidedValue(report.minecraftVersion)) {
    embed.addFields({ name: 'Minecraft', value: truncate(report.minecraftVersion, 128), inline: true });
  }

  if (hasProvidedValue(report.loaderVersion)) {
    embed.addFields({ name: 'NeoForge/Forge', value: truncate(report.loaderVersion, 128), inline: true });
  }

  if (hasDisplayableBugMode(report.playMode)) {
    embed.addFields({ name: 'Mode', value: truncate(report.playMode, 128), inline: true });
  }

  if (hasProvidedValue(report.repeatable)) {
    embed.addFields({ name: 'Repeatable', value: truncate(report.repeatable, 128), inline: true });
  }

  embed.addFields(
      { name: 'What happened', value: truncate(report.happened) },
      { name: 'Expected', value: truncate(report.expected) },
      { name: 'Steps to reproduce', value: truncate(report.steps) }
    );

  if (hasProvidedValue(report.bugContext)) {
    embed.addFields({ name: 'Extra context', value: truncate(report.bugContext) });
  }

  if (hasProvidedValue(report.location)) {
    embed.addFields({ name: 'Dimension/location', value: truncate(report.location, 256), inline: true });
  }

  if (hasProvidedValue(report.anomalyContext)) {
    embed.addFields({ name: 'Nearby feature', value: truncate(report.anomalyContext, 256), inline: true });
  }

  if (report.sparkLink) {
    embed.addFields({ name: 'Spark link', value: `[Spark report](${report.sparkLink})`, inline: true });
  }

  if (report.screenshotUrl) {
    embed.addFields({
      name: 'Screenshot',
      value: `[${report.screenshotName ?? 'Screenshot'}](${report.screenshotUrl})`,
      inline: true
    });
  }

  if (hasProvidedValue(report.logFileName)) {
    embed.addFields({ name: 'Log attachment', value: report.logFileName, inline: true });
  }

  embed.addFields({ name: 'Submitted by', value: `<@${report.userId}>`, inline: true });

  if (report.redactedLog) {
    embed.addFields({
      name: 'Redacted log excerpt',
      value: `\`\`\`text\n${truncate(report.redactedLog, 900)}\n\`\`\``
    });
  }

  return embed;
}

export function crashReportEmbed(report: CrashReportRecord): EmbedBuilder {
  const embed = baseEmbed(`Crash Report ${report.publicId}`, 'Crash signature detected.')
    .setColor(colors.danger)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Claimed by', value: claimedByText(report.claimedBy), inline: true },
      { name: 'Likely cause', value: truncate(report.likelyCause, 512), inline: true },
      { name: 'Confidence', value: report.confidence, inline: true },
      { name: 'Next steps', value: truncate(report.nextSteps) },
      { name: 'File', value: `${report.fileName} (${report.fileSize} bytes)`, inline: true }
    );

  if (hasProvidedValue(report.activity)) {
    embed.addFields({ name: 'What the player was doing', value: truncate(report.activity) });
  }

  if (hasProvidedValue(report.steps)) {
    embed.addFields({ name: 'Steps to reproduce', value: truncate(report.steps) });
  }

  embed.addFields(
    { name: 'Submitted by', value: `<@${report.userId}>`, inline: true },
    { name: 'Redacted excerpt', value: `\`\`\`text\n${truncate(report.redactedLog, 900)}\n\`\`\`` }
  );

  return embed;
}

export function performanceReportEmbed(report: PerformanceReportRecord): EmbedBuilder {
  const embed = baseEmbed(`Performance Report ${report.publicId}`, 'Performance report received and ready for review.')
    .setColor(colors.calm)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Claimed by', value: claimedByText(report.claimedBy), inline: true },
      { name: 'Modpack version', value: truncate(report.modpackVersion, 128), inline: true },
      { name: 'FPS average', value: truncate(report.fpsAverage, 128), inline: true },
      { name: 'RAM allocated', value: truncate(report.ramAllocated, 128), inline: true }
    );

  if (hasProvidedValue(report.cpuGpu)) {
    embed.addFields({ name: 'CPU/GPU', value: truncate(report.cpuGpu, 256), inline: true });
  }

  if (hasProvidedValue(report.javaVersion)) {
    embed.addFields({ name: 'Java', value: truncate(report.javaVersion, 128), inline: true });
  }

  if (hasProvidedValue(report.launcher)) {
    embed.addFields({ name: 'Launcher', value: truncate(report.launcher, 128), inline: true });
  }

  if (hasProvidedValue(report.shaders)) {
    embed.addFields({ name: 'Shaders', value: truncate(report.shaders, 128), inline: true });
  }

  if (report.renderDistance !== null) {
    embed.addFields({ name: 'Render distance', value: report.renderDistance.toString(), inline: true });
  }

  embed.addFields(
      { name: 'Where lag happens', value: truncate(report.lagLocation) },
      { name: 'What the player was doing', value: truncate(report.activity) },
      { name: 'Submitted by', value: `<@${report.userId}>`, inline: true }
    );

  return embed;
}

export function feedbackReportEmbed(report: FeedbackReportRecord): EmbedBuilder {
  return baseEmbed(`Feedback ${report.publicId}`, 'Feedback received. Thanks for the notes.')
    .addFields(
      { name: 'Category', value: report.category, inline: true },
      { name: 'Modpack version', value: truncate(report.modpackVersion, 128), inline: true },
      { name: 'Summary', value: truncate(report.summary) },
      { name: 'Details', value: truncate(report.details) },
      { name: 'Submitted by', value: `<@${report.userId}>`, inline: true }
    );
}

export function suggestionEmbed(report: SuggestionRecord, votes: SuggestionVoteCounts): EmbedBuilder {
  return baseEmbed(`Suggestion ${report.publicId}`, 'Suggestion received and ready for review.')
    .setColor(colors.calm)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Category', value: report.category, inline: true },
      { name: 'Modpack version', value: truncate(report.modpackVersion, 128), inline: true },
      { name: 'Title', value: truncate(report.title, 512) },
      { name: 'Details', value: truncate(report.details) },
      { name: 'Votes', value: `Upvote: ${votes.up} | Downvote: ${votes.down} | Needs discussion: ${votes.discussion}` },
      { name: 'Submitted by', value: `<@${report.userId}>`, inline: true }
    );
}

export function playtestSessionEmbed(session: PlaytestSessionRecord, links: LinkedReportRecord[] = []): EmbedBuilder {
  const embed = baseEmbed(`Playtest Session ${session.publicId}`, 'Wilderness Oddesy systems are watching for instability.')
    .setColor(colors.staff)
    .addFields(
      { name: 'Status', value: session.status, inline: true },
      { name: 'Tester', value: truncate(session.testerName, 128), inline: true },
      { name: 'Modpack version', value: truncate(session.modpackVersion, 128), inline: true },
      { name: 'Test type', value: truncate(session.testType, 128), inline: true },
      { name: 'Expected duration', value: truncate(session.expectedDuration, 128), inline: true },
      { name: 'Notes', value: truncate(session.notes) },
      { name: 'Submitted by', value: `<@${session.userId}>`, inline: true }
    );

  if (session.status === 'completed') {
    embed.addFields(
      { name: 'Successful', value: truncate(session.successful, 128), inline: true },
      { name: 'Crashes', value: truncate(session.crashes, 128), inline: true },
      { name: 'Major lag', value: truncate(session.majorLag, 128), inline: true },
      { name: 'Bugs found', value: truncate(session.bugsFound, 128), inline: true },
      { name: 'Spark reports attached', value: truncate(session.sparkReportsAttached, 128), inline: true },
      { name: 'Rating', value: session.rating?.toString() ?? 'Not provided', inline: true },
      { name: 'Final notes', value: truncate(session.finalNotes) }
    );
  }

  if (links.length > 0) {
    embed.addFields({
      name: 'Linked reports',
      value: links.map((link) => `${link.reportType}: ${link.reportPublicId}`).join('\n').slice(0, 1024)
    });
  }

  return embed;
}

export function playtestListEmbed(sessions: PlaytestSessionRecord[]): EmbedBuilder {
  const embed = baseEmbed('Recent Playtest Sessions', 'Staff session index.');

  if (sessions.length === 0) {
    return embed.setDescription('No playtest sessions have been created yet.');
  }

  for (const session of sessions) {
    embed.addFields({
      name: `${session.publicId} - ${truncate(session.testType, 160)}`,
      value: `Status: ${session.status} | Tester: ${truncate(session.testerName, 120)} | Version: ${truncate(session.modpackVersion, 80)} | Created: ${session.createdAt}`
    });
  }

  return embed;
}

export function playtestReleaseEmbed(release: PlaytestReleaseRecord): EmbedBuilder {
  const policyLinks = [
    release.termsUrl ? `[Terms](${release.termsUrl})` : null,
    release.privacyUrl ? `[Privacy](${release.privacyUrl})` : null
  ].filter((value): value is string => Boolean(value));

  return baseEmbed(`Playtest Drop ${release.publicId}`, release.title)
    .setColor(colors.staff)
    .addFields(
      { name: 'Modpack version', value: truncate(release.modpackVersion, 128), inline: true },
      { name: 'Expected duration', value: truncate(release.expectedDuration, 128), inline: true },
      { name: 'Package', value: truncate(release.packageName, 256), inline: true },
      { name: 'Test focus', value: truncate(release.testFocus) },
      {
        name: 'Before you download',
        value: [
          'Verify your Minecraft account with `/minecraft link` before accepting.',
          'Use the View Terms and View Privacy buttons below before accepting.',
          'Click the acceptance button only if you agree to test the unreleased build and report issues through the support commands.',
          'After acceptance, the bot will privately send the ZIP link and CurseForge import steps.'
        ].join('\n')
      },
      {
        name: 'Policy',
        value: policyLinks.length > 0
          ? `Use the in-bot policy buttons below. Optional external copies: ${policyLinks.join(' | ')}`
          : 'Use the in-bot policy buttons below. No external policy links are required.'
      },
      {
        name: 'Report issues with',
        value: '`/bugreport`, `/crash`, `/feedback`, `/perfreport`, `/sparkreport`, and `/playtest start` for individual test sessions.'
      }
    );
}

export function playtestReleaseListEmbed(
  releases: Array<PlaytestReleaseRecord & { acceptanceCount?: number }>
): EmbedBuilder {
  const embed = baseEmbed('Playtest Releases', 'Recent gated playtest packages.').setColor(colors.staff);

  if (releases.length === 0) {
    return embed.setDescription('No playtest releases have been published yet.');
  }

  for (const release of releases.slice(0, 10)) {
    embed.addFields({
      name: `${release.publicId} - ${truncate(release.title, 170)}`,
      value: [
        `Status: ${release.status}`,
        `Version: ${truncate(release.modpackVersion, 80)}`,
        `Acceptances: ${release.acceptanceCount ?? 0}`,
        release.channelId ? `Channel: <#${release.channelId}>` : 'Channel: not recorded',
        `Created: ${release.createdAt}`
      ].join(' | ')
    });
  }

  return embed;
}

export function playtestReleaseStaffEmbed(
  release: PlaytestReleaseRecord,
  acceptances: PlaytestReleaseAcceptanceRecord[]
): EmbedBuilder {
  const embed = baseEmbed(`Playtest Release ${release.publicId}`, release.title)
    .setColor(release.status === 'active' ? colors.staff : colors.warning)
    .addFields(
      { name: 'Status', value: release.status, inline: true },
      { name: 'Modpack version', value: truncate(release.modpackVersion, 128), inline: true },
      { name: 'Expected duration', value: truncate(release.expectedDuration, 128), inline: true },
      { name: 'Package', value: truncate(release.packageName, 256), inline: true },
      { name: 'Channel', value: release.channelId ? `<#${release.channelId}>` : 'Not recorded', inline: true },
      { name: 'Published by', value: `<@${release.createdBy}>`, inline: true },
      { name: 'Test focus', value: truncate(release.testFocus) },
      { name: 'Staff instructions', value: truncate(release.instructions) }
    );

  embed.addFields({
    name: `Acceptances (${acceptances.length} shown)`,
    value: acceptances.length > 0
      ? acceptances
        .map((acceptance) => `<@${acceptance.userId}> (${truncate(acceptance.username, 80)}) - ${acceptance.acceptedAt}`)
        .join('\n')
        .slice(0, 1024)
      : 'No acceptances recorded yet.'
  });

  return embed;
}

export function sparkReportEmbed(report: SparkReportRecord, session?: PlaytestSessionRecord | null): EmbedBuilder {
  return baseEmbed(`Spark Report ${report.publicId}`, 'Spark report archived and ready for review.')
    .setColor(colors.warning)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Claimed by', value: claimedByText(report.claimedBy), inline: true },
      { name: 'Session ID', value: report.sessionPublicId, inline: true },
      { name: 'Tester', value: session ? truncate(session.testerName, 128) : `<@${report.userId}>`, inline: true },
      { name: 'Spark link', value: `[Open Spark viewer](${report.sparkUrl})` },
      { name: 'Modpack version', value: session ? truncate(session.modpackVersion, 128) : 'Session not found', inline: true },
      { name: 'Test type', value: session ? truncate(session.testType, 128) : 'Session not found', inline: true },
      { name: 'Symptoms', value: truncate(report.symptoms ?? report.activity) },
      { name: 'Tester activity', value: truncate(report.activity) },
      { name: 'Location/dimension', value: truncate(report.location, 256), inline: true },
      { name: 'Suspected area', value: truncate(report.suspectedArea, 256), inline: true },
      { name: 'FPS average', value: truncate(report.fpsAverage, 128), inline: true },
      { name: 'TPS/MSPT', value: truncate(report.tpsMspt, 128), inline: true },
      { name: 'RAM allocated', value: truncate(report.ramAllocated, 128), inline: true },
      { name: 'Render distance', value: report.renderDistance?.toString() ?? 'Not provided', inline: true },
      { name: 'Shader status', value: truncate(report.shaderStatus, 128), inline: true },
      { name: 'Latest log', value: report.latestLogName ?? 'None', inline: true },
      { name: 'Staff notes', value: truncate(report.staffNotes) }
    );
}

export function knownIssuesEmbed(issues: KnownIssueRecord[]): EmbedBuilder {
  const embed = baseEmbed('Known Issues & Upcoming Fixes', 'Current instability notes and solved bugs queued by the Wilderness Oddesy staff console.');

  if (issues.length === 0) {
    return embed.setDescription('No known issues are listed right now. That is good news, and you can still report anything that feels off.');
  }

  for (const issue of issues.slice(0, 10)) {
    const source = issue.sourceReportPublicId ? ` | Source: ${issue.sourceReportPublicId}` : '';
    const external = issue.externalUrl ? ` | [External](${issue.externalUrl})` : '';
    const versions = [
      issue.affectedVersions ? `Affected: ${issue.affectedVersions}` : null,
      issue.fixedInVersion ? `Fixed in: ${issue.fixedInVersion}` : null
    ].filter(Boolean).join(' | ');
    embed.addFields({
      name: `#${issue.id} - ${truncate(issue.title, 220)}`,
      value: [
        `Status: ${knownIssueStatusLabel(issue.status)} | Severity: ${issue.severity}${source}${external}`,
        versions || null,
        truncate(issue.description, versions ? 620 : 700)
      ].filter(Boolean).join('\n')
    });
  }

  return embed;
}

function knownIssueStatusLabel(status: string): string {
  if (status === 'solved') {
    return 'solved - upcoming fix';
  }

  return status;
}

export function changelogEmbed(entries: ChangelogEntryRecord[]): EmbedBuilder {
  const embed = baseEmbed('Latest Changelog', 'Recent Wilderness Oddesy modpack notes.');

  if (entries.length === 0) {
    return embed.setDescription('No changelog entries have been added yet.');
  }

  for (const entry of entries.slice(0, 5)) {
    embed.addFields({
      name: `${truncate(entry.version, 60)} - ${truncate(entry.title, 180)}`,
      value: truncate(entry.details, 900)
    });
  }

  return embed;
}

export function searchResultsEmbed(keyword: string, results: ReportSearchResult[]): EmbedBuilder {
  const embed = baseEmbed('Report Search', `Search results for \`${truncate(keyword, 80)}\``).setColor(colors.staff);

  if (results.length === 0) {
    return embed.addFields({ name: 'No matches', value: 'I could not find any reports matching that keyword.' });
  }

  for (const result of results) {
    embed.addFields({
      name: `${result.publicId} (${result.type})`,
      value: `${truncate(result.title, 850)}\nStatus: ${result.status ?? 'n/a'} | Created: ${result.createdAt}`
    });
  }

  return embed;
}
