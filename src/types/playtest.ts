export type PlaytestStatus = 'active' | 'completed';

export interface PlaytestSessionRecord {
  id: number;
  publicId: string;
  userId: string;
  username: string;
  testerName: string;
  modpackVersion: string;
  testType: string;
  expectedDuration: string;
  notes: string | null;
  status: PlaytestStatus;
  successful: string | null;
  crashes: string | null;
  majorLag: string | null;
  bugsFound: string | null;
  sparkReportsAttached: string | null;
  rating: number | null;
  finalNotes: string | null;
  createdAt: string;
  endedAt: string | null;
  updatedAt: string;
}

export interface LinkedReportRecord {
  id: number;
  sessionPublicId: string;
  reportType: string;
  reportPublicId: string;
  createdAt: string;
}

export type PlaytestReleaseStatus = 'active' | 'closed';

export interface PlaytestReleaseRecord {
  id: number;
  publicId: string;
  guildId: string;
  channelId: string | null;
  messageId: string | null;
  createdBy: string;
  createdByUsername: string;
  title: string;
  modpackVersion: string;
  testFocus: string;
  expectedDuration: string;
  packageName: string;
  packageUrl: string;
  packageSize: number | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  instructions: string | null;
  status: PlaytestReleaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlaytestReleaseAcceptanceRecord {
  id: number;
  releasePublicId: string;
  userId: string;
  username: string;
  acceptedAt: string;
}
