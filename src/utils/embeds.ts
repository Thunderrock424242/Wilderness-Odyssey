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
import type { LinkedReportRecord, PlaytestReleaseRecord, PlaytestSessionRecord } from '../types/playtest';
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
        value: 'Report text you submit, attached crash/latest logs you choose to upload, the report category, Discord user ID/name for follow-up, and timestamps.'
      },
      {
        name: 'What the bot does not collect',
        value: 'No IP addresses, chat logs, Discord tokens, personal files, passwords, private messages, or background telemetry.'
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

export function bugReportEmbed(report: BugReportRecord): EmbedBuilder {
  const embed = baseEmbed(`Bug Report ${report.publicId}`, 'Anomaly report archived.')
    .setColor(colors.warning)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Claimed by', value: claimedByText(report.claimedBy), inline: true },
      { name: 'Modpack version', value: truncate(report.modpackVersion, 128), inline: true },
      { name: 'Minecraft', value: truncate(report.minecraftVersion, 128), inline: true },
      { name: 'NeoForge/Forge', value: truncate(report.loaderVersion, 128), inline: true },
      { name: 'Mode', value: truncate(report.playMode, 128), inline: true },
      { name: 'Repeatable', value: truncate(report.repeatable, 128), inline: true },
      { name: 'What happened', value: truncate(report.happened) },
      { name: 'Expected', value: truncate(report.expected) },
      { name: 'Steps to reproduce', value: truncate(report.steps) },
      { name: 'Dimension/location', value: truncate(report.location, 256), inline: true },
      { name: 'Nearby feature', value: truncate(report.anomalyContext, 256), inline: true },
      { name: 'Spark link', value: report.sparkLink ? `[Spark report](${report.sparkLink})` : 'None', inline: true },
      { name: 'Screenshot', value: report.screenshotUrl ? `[${report.screenshotName ?? 'Screenshot'}](${report.screenshotUrl})` : 'None', inline: true },
      { name: 'Log attachment', value: report.logFileName ?? 'None', inline: true },
      { name: 'Submitted by', value: `<@${report.userId}>`, inline: true }
    );

  if (report.redactedLog) {
    embed.addFields({
      name: 'Redacted log excerpt',
      value: `\`\`\`text\n${truncate(report.redactedLog, 900)}\n\`\`\``
    });
  }

  return embed;
}

export function crashReportEmbed(report: CrashReportRecord): EmbedBuilder {
  return baseEmbed(`Crash Report ${report.publicId}`, 'Crash signature detected.')
    .setColor(colors.danger)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Claimed by', value: claimedByText(report.claimedBy), inline: true },
      { name: 'Likely cause', value: truncate(report.likelyCause, 512), inline: true },
      { name: 'Confidence', value: report.confidence, inline: true },
      { name: 'Next steps', value: truncate(report.nextSteps) },
      { name: 'File', value: `${report.fileName} (${report.fileSize} bytes)`, inline: true },
      { name: 'Submitted by', value: `<@${report.userId}>`, inline: true },
      { name: 'Redacted excerpt', value: `\`\`\`text\n${truncate(report.redactedLog, 900)}\n\`\`\`` }
    );
}

export function performanceReportEmbed(report: PerformanceReportRecord): EmbedBuilder {
  return baseEmbed(`Performance Report ${report.publicId}`, 'Performance sample received. Aether-style analysis complete.')
    .setColor(colors.calm)
    .addFields(
      { name: 'Status', value: report.status, inline: true },
      { name: 'Claimed by', value: claimedByText(report.claimedBy), inline: true },
      { name: 'Modpack version', value: truncate(report.modpackVersion, 128), inline: true },
      { name: 'FPS average', value: truncate(report.fpsAverage, 128), inline: true },
      { name: 'RAM allocated', value: truncate(report.ramAllocated, 128), inline: true },
      { name: 'CPU/GPU', value: truncate(report.cpuGpu, 256), inline: true },
      { name: 'Java', value: truncate(report.javaVersion, 128), inline: true },
      { name: 'Launcher', value: truncate(report.launcher, 128), inline: true },
      { name: 'Shaders', value: truncate(report.shaders, 128), inline: true },
      { name: 'Render distance', value: report.renderDistance?.toString() ?? 'Not provided', inline: true },
      { name: 'Where lag happens', value: truncate(report.lagLocation) },
      { name: 'What the player was doing', value: truncate(report.activity) },
      { name: 'Submitted by', value: `<@${report.userId}>`, inline: true }
    );
}

export function feedbackReportEmbed(report: FeedbackReportRecord): EmbedBuilder {
  return baseEmbed(`Feedback ${report.publicId}`, 'Field notes received.')
    .addFields(
      { name: 'Category', value: report.category, inline: true },
      { name: 'Modpack version', value: truncate(report.modpackVersion, 128), inline: true },
      { name: 'Summary', value: truncate(report.summary) },
      { name: 'Details', value: truncate(report.details) },
      { name: 'Submitted by', value: `<@${report.userId}>`, inline: true }
    );
}

export function suggestionEmbed(report: SuggestionRecord, votes: SuggestionVoteCounts): EmbedBuilder {
  return baseEmbed(`Suggestion ${report.publicId}`, 'Suggestion received. The archive has been updated.')
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
          'Read the playtest instructions and privacy notice.',
          'Click the acceptance button only if you agree to test the unreleased build and report issues through the support commands.',
          'After acceptance, the bot will privately send the ZIP link and CurseForge import steps.'
        ].join('\n')
      },
      {
        name: 'Policy links',
        value: policyLinks.length > 0 ? policyLinks.join(' | ') : 'Use `/privacy` and follow any staff terms posted in this channel.'
      },
      {
        name: 'Report issues with',
        value: '`/bugreport`, `/crash`, `/feedback`, `/perfreport`, `/sparkreport`, and `/playtest start` for individual test sessions.'
      }
    );
}

export function sparkReportEmbed(report: SparkReportRecord, session?: PlaytestSessionRecord | null): EmbedBuilder {
  return baseEmbed(`Spark Report ${report.publicId}`, 'Spark report archived. Performance anomaly logged.')
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
    return embed.setDescription('No known issues are listed right now. That is either good news or the forest is being quiet.');
  }

  for (const issue of issues.slice(0, 10)) {
    const source = issue.sourceReportPublicId ? ` | Source: ${issue.sourceReportPublicId}` : '';
    embed.addFields({
      name: `#${issue.id} - ${truncate(issue.title, 220)}`,
      value: `Status: ${knownIssueStatusLabel(issue.status)} | Severity: ${issue.severity}${source}\n${truncate(issue.description, 700)}`
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
    return embed.addFields({ name: 'No matches', value: 'No reports matched that keyword.' });
  }

  for (const result of results) {
    embed.addFields({
      name: `${result.publicId} (${result.type})`,
      value: `${truncate(result.title, 850)}\nStatus: ${result.status ?? 'n/a'} | Created: ${result.createdAt}`
    });
  }

  return embed;
}
