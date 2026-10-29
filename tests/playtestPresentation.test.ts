import { describe, expect, it } from 'vitest';
import { campaignSchema, testerSchema } from '../contracts/v1/playtests';
import { observedState } from '../src/lib/admin/playtestPresentation';
import { campaign, tester } from './fixtures/playtests';

const now = Date.parse('2026-10-25T12:00:10Z');
const build = campaignSchema.parse(campaign), profile = testerSchema.parse(tester);
describe('observed collection state', () => {
  it('requires a current collection acknowledgement and heartbeat before recording', () => {
    expect(observedState(build, profile, now)).toBe('Recording');
    expect(observedState(build, { ...profile, acknowledgement: null }, now)).toBe('Waiting for game');
    expect(observedState(build, { ...profile, acknowledgement: { ...profile.acknowledgement!, collectionId: 'previous-collection' } }, now)).toBe('Waiting for game');
    expect(observedState({ ...build, changedAt: '2026-10-25T12:00:05Z' }, profile, now)).toBe('Waiting for game');
    expect(observedState(build, { ...profile, lastSeenAt: null }, now)).toBe('Waiting for game');
    expect(observedState(build, profile, now + 60000)).toBe('Offline/connection lost');
  });
  it('distinguishes a requested stop from ended authorization without inventing final reports', () => {
    const off = { ...build, collect: false, collectionId: null, changedAt: '2026-10-25T12:00:05Z' };
    expect(observedState(off, profile, now)).toBe('Stop requested');
    expect(observedState(off, profile, now + 60000)).toBe('Stopped');
    expect(observedState(build, { ...profile, permission: 'paused', changedAt: off.changedAt }, now)).toBe('Stop requested');
    expect(observedState(off, { ...profile, acknowledgement: { ...profile.acknowledgement!, state: 'ended', observedAt: '2026-10-25T12:00:06Z' } }, now)).toBe('Stopped');
  });
  it('reports failed uploads separately from a later successful upload', () => {
    const failed = { ...profile, uploadErrorAt: '2026-10-25T12:00:05Z' };
    expect(observedState(build, failed, now)).toBe('Upload failed');
    expect(observedState(build, { ...failed, lastUploadAt: '2026-10-25T12:00:06Z' }, now)).toBe('Recording');
  });
  it('requires the current tester generation after pause and resume', () => {
    const resumed = testerSchema.parse({ ...tester, collectionId: 'tester-resumed-generation' });
    expect(observedState(build, resumed, now)).toBe('Waiting for game');
  });
});
