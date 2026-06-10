import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface SlashCommand {
  data: SlashCommandData;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export type ReportStatus = 'open' | 'investigating' | 'fixed' | 'duplicate' | 'needs_more_info' | 'wontfix';

export interface BugReportRecord {
  id: number;
  publicId: string;
  userId: string;
  username: string;
  modpackVersion: string;
  minecraftVersion: string | null;
  loaderVersion: string | null;
  playMode: string;
  happened: string;
  expected: string;
  steps: string;
  location: string | null;
  anomalyContext: string | null;
  repeatable: string | null;
  sparkLink: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  screenshotUrl: string | null;
  screenshotName: string | null;
  logFileName: string | null;
  redactedLog: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CrashReportRecord {
  id: number;
  publicId: string;
  userId: string;
  username: string;
  fileName: string;
  fileSize: number;
  redactedLog: string;
  likelyCause: string;
  confidence: string;
  nextSteps: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceReportRecord {
  id: number;
  publicId: string;
  userId: string;
  username: string;
  modpackVersion: string;
  fpsAverage: string;
  ramAllocated: string;
  cpuGpu: string | null;
  javaVersion: string | null;
  launcher: string | null;
  shaders: string | null;
  renderDistance: number | null;
  lagLocation: string;
  activity: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackReportRecord {
  id: number;
  publicId: string;
  userId: string;
  username: string;
  category: string;
  modpackVersion: string | null;
  summary: string;
  details: string;
  createdAt: string;
}

export type SuggestionStatus = 'new' | 'under_review' | 'planned' | 'accepted' | 'rejected' | 'added';

export type SuggestionVoteValue = 'up' | 'down' | 'discussion';

export interface SuggestionRecord {
  id: number;
  publicId: string;
  userId: string;
  username: string;
  category: string;
  modpackVersion: string | null;
  title: string;
  details: string;
  status: SuggestionStatus;
  messageChannelId: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestionVoteCounts {
  up: number;
  down: number;
  discussion: number;
}

export interface KnownIssueRecord {
  id: number;
  title: string;
  description: string;
  status: string;
  severity: string;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangelogEntryRecord {
  id: number;
  version: string;
  title: string;
  details: string;
  addedBy: string;
  createdAt: string;
}

export interface ReportSearchResult {
  type: 'bug' | 'crash' | 'performance' | 'feedback' | 'suggestion' | 'spark' | 'playtest';
  publicId: string;
  title: string;
  status?: string;
  createdAt: string;
}
