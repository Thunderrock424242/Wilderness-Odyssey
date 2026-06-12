import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const value = optional(name);
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberFromEnv(name: string, fallback: number): number {
  const value = optional(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const value = optional(name);
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const config = {
  discordToken: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: optional('GUILD_ID'),
  databasePath: path.resolve(process.cwd(), optional('DATABASE_PATH') ?? 'data/wilderness-oddesy.sqlite'),
  maxLogBytes: numberFromEnv('MAX_LOG_BYTES', 2 * 1024 * 1024),
  channelIds: {
    bugReports: optional('BUG_REPORTS_CHANNEL_ID'),
    crashReports: optional('CRASH_REPORTS_CHANNEL_ID'),
    performanceReports: optional('PERFORMANCE_REPORTS_CHANNEL_ID'),
    feedbackReports: optional('FEEDBACK_CHANNEL_ID'),
    suggestions: optional('SUGGESTIONS_CHANNEL_ID'),
    sparkReports: optional('SPARK_REPORTS_CHANNEL_ID'),
    playtestSessions: optional('PLAYTEST_SESSIONS_CHANNEL_ID'),
    playtestCategory: optional('PLAYTEST_CATEGORY_ID'),
    supportTicketCategory: optional('SUPPORT_TICKET_CATEGORY_ID'),
    staffReview: optional('STAFF_REVIEW_CHANNEL_ID'),
    staffLog: optional('STAFF_LOG_CHANNEL_ID'),
    support: optional('SUPPORT_CHANNEL_ID')
  },
  forumChannels: {
    issues: optional('ISSUES_FORUM_CHANNEL_ID'),
    ideas: optional('IDEAS_FORUM_CHANNEL_ID')
  },
  forumTags: {
    bug: listFromEnv('BUG_FORUM_TAG', ['Bug']),
    bugConfirmed: listFromEnv('BUG_CONFIRMED_FORUM_TAG', ['Confirmed']),
    bugSolved: listFromEnv('BUG_SOLVED_FORUM_TAG', ['Solved']),
    crash: listFromEnv('CRASH_FORUM_TAG', ['Crash']),
    feedback: listFromEnv('FEEDBACK_FORUM_TAG', ['Feedback']),
    suggestion: listFromEnv('SUGGESTION_FORUM_TAG', ['Suggestion'])
  },
  status: {
    latestModpackVersion: optional('LATEST_MODPACK_VERSION') ?? 'Not configured',
    recommendedJavaVersion: optional('RECOMMENDED_JAVA_VERSION') ?? 'Not configured',
    recommendedRam: optional('RECOMMENDED_RAM') ?? 'Not configured',
    supportChannels: listFromEnv('SUPPORT_CHANNELS', ['#support']),
    knownUnstableFeatures: listFromEnv('KNOWN_UNSTABLE_FEATURES', ['Rifts', 'Anomalies']),
    serverStatusLabel: optional('SERVER_STATUS_LABEL') ?? 'Server status integration not connected yet'
  },
  playtest: {
    termsUrl: optional('PLAYTEST_TERMS_URL'),
    privacyUrl: optional('PLAYTEST_PRIVACY_URL')
  },
  support: {
    teamRoleId: optional('SUPPORT_TEAM_ROLE_ID')
  },
  qa: {
    channelIds: listFromEnv('QA_CHANNEL_IDS', []),
    teamChannelId: optional('QA_TEAM_CHANNEL_ID'),
    teamRoleId: optional('QA_TEAM_ROLE_ID')
  },
  minecraftVerification: {
    apiEnabled: booleanFromEnv('MINECRAFT_VERIFY_API_ENABLED', false),
    apiHost: optional('MINECRAFT_VERIFY_API_HOST') ?? '0.0.0.0',
    apiPort: numberFromEnv('MINECRAFT_VERIFY_API_PORT', 3000),
    publicBaseUrl: optional('MINECRAFT_VERIFY_PUBLIC_URL'),
    codeTtlMinutes: numberFromEnv('MINECRAFT_VERIFY_CODE_TTL_MINUTES', 15)
  }
};
