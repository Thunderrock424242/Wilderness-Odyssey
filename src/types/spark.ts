export type SparkReportStatus =
  | 'new'
  | 'needs_review'
  | 'bottleneck_found'
  | 'not_enough_data'
  | 'resolved';

export interface SparkReportRecord {
  id: number;
  publicId: string;
  sessionPublicId: string;
  userId: string;
  username: string;
  sparkUrl: string;
  activity: string;
  symptoms: string | null;
  location: string | null;
  suspectedArea: string | null;
  fpsAverage: string | null;
  tpsMspt: string | null;
  ramAllocated: string | null;
  renderDistance: number | null;
  shaderStatus: string | null;
  latestLogName: string | null;
  redactedLog: string | null;
  staffNotes: string | null;
  status: SparkReportStatus;
  createdAt: string;
  updatedAt: string;
}
