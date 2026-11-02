export type SurvivorLogTone = 'safe' | 'warn' | 'danger';

export type SurvivorLog = {
  id: string;
  date: string;
  survivor: string;
  body: string;
  status: string;
  tone: SurvivorLogTone;
  locked?: boolean;
};

export const SURVIVOR_LOGS: SurvivorLog[] = [
  {
    id: 'LOG #0419',
    date: 'DATE UNAVAILABLE',
    survivor: 'UNIDENTIFIED',
    body: '████████████████████ [REDACTED]',
    status: 'ARCHIVE: RESTRICTED',
    tone: 'warn',
    locked: true,
  },
];
