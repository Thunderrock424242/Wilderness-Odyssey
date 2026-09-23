import type { PublicStatus } from '../../contracts/v1/status';
export function statusPresentation(status: PublicStatus | null, now = Date.now()) {
  if (!status) return { freshness: 'unknown' as const, minecraft: 'Unavailable', aether: 'Unavailable', detail: 'Status is unavailable. No live measurements have been confirmed.' };
  const age = now - Date.parse(status.observedAt);
  if (age < -60_000) return { freshness: 'unknown' as const, minecraft: 'Unavailable', aether: 'Unavailable', detail: 'The status timestamp could not be verified.' };
  const stale = age > status.staleAfterSeconds * 1000;
  const minecraft = status.minecraft.state;
  const aether = status.aether.requestsPaused === true ? 'paused' : status.aether.inference;
  return { freshness: stale ? 'stale' as const : 'fresh' as const, minecraft: stale ? 'Last known: ' + minecraft : minecraft, aether: stale ? 'Last known: ' + aether : aether, detail: (stale ? 'Last confirmed ' : 'Updated ') + new Date(status.observedAt).toLocaleString() };
}