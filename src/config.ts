import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optionalTrimmedString = z.preprocess(blankToUndefined, z.string().trim().optional());
const optionalPositiveNumber = z.preprocess(blankToUndefined, z.coerce.number().positive().optional());
const optionalPositiveInteger = z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().trim().url().optional());
const optionalLogLevel = z.preprocess(
  blankToUndefined,
  z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional()
);

const envSchema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1, 'DISCORD_TOKEN is required.'),
  CLIENT_ID: z.string().trim().min(1, 'CLIENT_ID is required.'),
  GUILD_ID: optionalTrimmedString,
  DATABASE_PATH: optionalTrimmedString,
  MAX_LOG_BYTES: optionalPositiveNumber,
  LOG_LEVEL: optionalLogLevel,
  SENTRY_DSN: optionalUrl,
  METRICS_ENABLED: optionalTrimmedString,
  METRICS_PATH: optionalTrimmedString,
  MINECRAFT_VERIFY_API_PORT: optionalPositiveInteger,
  MINECRAFT_VERIFY_CODE_TTL_MINUTES: optionalPositiveNumber
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  const details = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

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
    performance: listFromEnv('PERFORMANCE_FORUM_TAG', ['Performance Issues']),
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
  dev: {
    teamRoleId: optional('DEV_TEAM_ROLE_ID')
  },
  qa: {
    channelIds: listFromEnv('QA_CHANNEL_IDS', []),
    forumChannelId: optional('QA_FORUM_CHANNEL_ID'),
    alertChannelId: optional('QA_ALERT_CHANNEL_ID') ?? optional('QA_TEAM_CHANNEL_ID'),
    alertRoleId: optional('QA_ALERT_ROLE_ID') ?? optional('QA_TEAM_ROLE_ID') ?? optional('SUPPORT_TEAM_ROLE_ID'),
    teamChannelId: optional('QA_TEAM_CHANNEL_ID'),
    teamRoleId: optional('QA_TEAM_ROLE_ID')
  },
  minecraftVerification: {
    apiEnabled: booleanFromEnv('MINECRAFT_VERIFY_API_ENABLED', false),
    apiHost: optional('MINECRAFT_VERIFY_API_HOST') ?? '0.0.0.0',
    apiPort: numberFromEnv('MINECRAFT_VERIFY_API_PORT', 3000),
    publicBaseUrl: optional('MINECRAFT_VERIFY_PUBLIC_URL'),
    relayChannelId: optional('MINECRAFT_VERIFY_RELAY_CHANNEL_ID'),
    relayWebhookId: optional('MINECRAFT_VERIFY_RELAY_WEBHOOK_ID'),
    verifiedRoleId: optional('MINECRAFT_VERIFIED_ROLE_ID'),
    codeTtlMinutes: numberFromEnv('MINECRAFT_VERIFY_CODE_TTL_MINUTES', 15)
  },
  logging: {
    level: optional('LOG_LEVEL') ?? 'info'
  },
  sentry: {
    dsn: optional('SENTRY_DSN')
  },
  metrics: {
    enabled: booleanFromEnv('METRICS_ENABLED', false),
    path: optional('METRICS_PATH') ?? '/metrics'
  }
};
