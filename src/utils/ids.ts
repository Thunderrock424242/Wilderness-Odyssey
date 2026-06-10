export type PublicIdType =
  | 'bug'
  | 'crash'
  | 'performance'
  | 'feedback'
  | 'suggestion'
  | 'playtest'
  | 'spark';

const labels: Record<PublicIdType, string> = {
  bug: 'BUG',
  crash: 'CRASH',
  performance: 'PERF',
  feedback: 'FDBK',
  suggestion: 'SUG',
  playtest: 'TEST',
  spark: 'SPARK'
};

export function normalizePublicId(value: string): string {
  return value.trim().toUpperCase();
}

export function formatPublicId(type: PublicIdType, id: number): string {
  return `WO-${labels[type]}-${id.toString().padStart(4, '0')}`;
}
