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
    id: 'LOG #0001',
    date: '[REDACTED]',
    survivor: '[REDACTED]',
    body: '████████████████████ [REDACTED] — Discover this record in play.',
    status: 'ACCESS: REDACTED',
    tone: 'safe',
  },
  {
    id: 'LOG #0047',
    date: '[REDACTED]',
    survivor: '[REDACTED]',
    body: '████████████████████ [REDACTED] — Discover this record in play.',
    status: 'ACCESS: REDACTED',
    tone: 'warn',
  },
  {
    id: 'LOG #0112',
    date: '[REDACTED]',
    survivor: '[REDACTED]',
    body: '████████████████████ [REDACTED] — Discover this record in play.',
    status: 'ACCESS: REDACTED',
    tone: 'danger',
  },
  {
    id: 'LOG #0203',
    date: '[REDACTED]',
    survivor: '[REDACTED]',
    body: '████████████████████ [REDACTED] — Discover this record in play.',
    status: 'ACCESS: REDACTED',
    tone: 'warn',
  },
  {
    id: 'LOG #0318',
    date: '[REDACTED]',
    survivor: '[REDACTED]',
    body: '████████████████████ [REDACTED] — Discover this record in play.',
    status: 'ACCESS: REDACTED',
    tone: 'safe',
  },
  {
    id: 'LOG #0419',
    date: '[REDACTED]',
    survivor: '[REDACTED]',
    body: '████████████████████ [REDACTED] — Discover this record in play.',
    status: 'ACCESS: REDACTED',
    tone: 'danger',
    locked: true,
  },
];
