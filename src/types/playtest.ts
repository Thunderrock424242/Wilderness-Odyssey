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
