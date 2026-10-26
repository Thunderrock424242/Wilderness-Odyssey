import type { Campaign, Tester } from '../../../contracts/v1/playtests';

export function observedState(campaign: Campaign, tester: Tester, now = Date.now()) {
  const changed = Math.max(Date.parse(campaign.changedAt), Date.parse(tester.changedAt));
  const acknowledgement = tester.acknowledgement;
  if (!campaign.collect || tester.permission !== 'allowed') {
    if (!tester.lastSeenAt || (acknowledgement && acknowledgement.state !== 'recording' && Date.parse(acknowledgement.observedAt) >= changed) || now >= changed + 60000) return 'Stopped';
    return 'Stop requested';
  }
  if (!tester.lastSeenAt) return 'Waiting for game';
  if (now - Date.parse(tester.lastSeenAt) > 60000) return 'Offline/connection lost';
  if (tester.uploadErrorAt && (!tester.lastUploadAt || Date.parse(tester.uploadErrorAt) > Date.parse(tester.lastUploadAt))) return 'Upload failed';
  if (acknowledgement?.collectionId === campaign.collectionId && Date.parse(acknowledgement.observedAt) >= changed) {
    if (acknowledgement.state === 'recording') return 'Recording';
    return 'Stopped';
  }
  return 'Waiting for game';
}
export function dateLabel(value: string | null) { return value ? new Date(value).toLocaleString() : 'Not reported'; }
export function durationLabel(seconds: number | null) { return seconds === null ? 'Not reported' : Math.floor(seconds / 60) + ' min ' + seconds % 60 + ' sec'; }
export const sparkLabels = { recording: 'Spark recording acknowledged.', unavailable: 'Spark is unavailable in this session.', busy: 'Spark is busy with another recording.', saved: 'A Spark recording was uploaded.', failed: 'Spark recording failed.', idle: 'No Spark recording is running.' };
