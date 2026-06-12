import type { Attachment, Client, User } from 'discord.js';
import { analyzeCrashLog } from './logParser';
import {
  createCrashReport,
  readTextAttachment,
  reportClaimButtons,
  reportDestinationForType,
  reportForumTagsForType,
  reportForumTitle,
  sendToConfiguredChannel
} from './reportService';
import { linkReportToSession } from './playtestSessionService';
import { baseEmbed, crashReportEmbed } from '../utils/embeds';
import { supportTeamAllowedMentions, supportTeamPing } from '../utils/supportTeam';
import { enqueueCrashTask } from './queueService';

export async function archiveCrashAttachment(input: {
  client: Client;
  user: User;
  attachment: Attachment;
  playtestSessionId?: string | null;
}) {
  return enqueueCrashTask(() => archiveCrashAttachmentNow(input));
}

async function archiveCrashAttachmentNow(input: {
  client: Client;
  user: User;
  attachment: Attachment;
  playtestSessionId?: string | null;
}) {
  const logText = await readTextAttachment(input.attachment);
  const analysis = analyzeCrashLog(logText);
  const nextSteps = analysis.nextSteps.map((step) => `- ${step}`).join('\n');

  const report = createCrashReport({
    userId: input.user.id,
    username: input.user.tag,
    fileName: input.attachment.name,
    fileSize: input.attachment.size,
    redactedLog: analysis.redactedLog,
    likelyCause: analysis.likelyCause,
    confidence: `${analysis.confidence} (${Math.round(analysis.confidenceScore * 100)}%)`,
    nextSteps
  });

  if (input.playtestSessionId) {
    linkReportToSession(input.playtestSessionId, 'crash', report.publicId);
  }

  const posted = await sendToConfiguredChannel(
    input.client,
    reportDestinationForType('crash'),
    {
      content: supportTeamPing('New crash report needs triage.'),
      allowedMentions: supportTeamAllowedMentions(),
      embeds: [crashReportEmbed(report)],
      components: [reportClaimButtons('crash', report.publicId)]
    },
    {
      forumPost: {
        title: reportForumTitle(report.publicId, 'Crash', report.likelyCause),
        tags: reportForumTagsForType('crash')
      }
    }
  );

  return {
    report,
    analysis,
    nextSteps,
    posted,
    embed: baseEmbed(`Crash Analysis ${report.publicId}`, 'Report received. Analysis complete.')
      .addFields(
        { name: 'Likely cause', value: analysis.likelyCause, inline: true },
        { name: 'Confidence', value: `${analysis.confidence} (${Math.round(analysis.confidenceScore * 100)}%)`, inline: true },
        { name: 'Detected signals', value: analysis.signals.join('\n').slice(0, 1024) },
        { name: 'Next steps', value: nextSteps.slice(0, 1024) }
      )
  };
}
