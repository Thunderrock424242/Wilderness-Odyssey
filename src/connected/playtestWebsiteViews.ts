import * as s from '../contracts/v1/playtests';
import { ConnectedStore, ServiceError } from './store';
import { PlaytestService, testerKey, type Campaign, type Tester, type Session, type Installation, type Artifact } from './playtest';

export type CampaignMetadata = { build: string; retentionDays: number };
export type TesterMetadata = { permission: 'allowed' | 'paused' | 'revoked'; campaignCollection: string | null; collectionId: string | null };
export type Notes = { notes: string; revision: string };
export const missing = (): never => { throw new ServiceError(404, 'NOT_FOUND', 'Playtest record not found.'); };
export const changed = (expected: string, actual: string) => { if (expected !== actual) throw new ServiceError(409, 'REVISION_CONFLICT', 'This record changed. Refresh before trying again.'); };
export class PlaytestWebsiteViews {
  readonly service: PlaytestService;
  constructor(readonly store: ConnectedStore) { this.service = new PlaytestService(store); }
  campaign(value: Campaign): s.Campaign {
    const meta = this.store.record<CampaignMetadata>('pt_web_campaign', value.id);
    return s.campaignSchema.parse({ id: value.id, title: value.title, build: meta?.build ?? 'Not specified', retentionDays: meta?.retentionDays ?? 30, collect: value.enabled, collectionId: value.collectionId, changedAt: value.updatedAt, createdAt: value.createdAt, revision: value.revision });
  }
  collection(campaign: Campaign, tester: Tester): string | null {
    const meta = this.store.record<TesterMetadata>('pt_web_tester', testerKey(campaign.id, tester.id));
    return meta?.campaignCollection === campaign.collectionId ? meta.collectionId : campaign.collectionId;
  }
  tester(campaign: Campaign, tester: Tester): s.Tester {
    const owner = testerKey(campaign.id, tester.id);
    const installs = this.store.records<Installation>('pt_installation', owner, 1000);
    const sessions = this.store.records<Session>('pt_session', owner, 1000);
    const latest = (values: (string | null)[]) => values.filter((value): value is string => !!value).sort().at(-1) ?? null;
    const recent = sessions.filter(session => !!session.observedReceivedAt).sort((a, b) => b.observedReceivedAt!.localeCompare(a.observedReceivedAt!))[0];
    const meta = this.store.record<TesterMetadata>('pt_web_tester', owner);
    return s.testerSchema.parse({ id: tester.id, label: tester.displayName, permission: tester.revokedAt ? 'revoked' : meta?.permission ?? 'allowed', collectionId: this.collection(campaign, tester), revision: tester.revision, changedAt: tester.approvedAt, reportedName: null, lastSeenAt: latest(installs.map(value => value.lastSeenAt)), lastUploadAt: latest(sessions.map(value => value.lastArtifactAt)), acknowledgement: recent && recent.state !== 'unknown' && recent.observedAt ? { collectionId: recent.collectionId, state: recent.state, observedAt: recent.observedReceivedAt } : null, uploadErrorAt: null, droppedArtifacts: null });
  }
  session(campaign: Campaign, tester: Tester, value: Session): s.PlaytestSession {
    const metadata = this.store.record<{ startedAt: string; durationSeconds: number | null; build: string | null }>('pt_session_metadata', value.id);
    const notes = this.store.record<Notes>('pt_web_notes', value.id);
    const artifacts = this.store.records<Artifact>('pt_artifact', testerKey(campaign.id, tester.id), 10000).filter(item => item.sessionId === value.id && !item.deletedAt && !this.expired(campaign, item)).slice(0, 100);
    const spark = artifacts.some(item => item.kind === 'spark');
    return s.playtestSessionSchema.parse({ id: value.id, campaignId: campaign.id, testerId: tester.id, build: metadata?.build ?? this.campaign(campaign).build, startedAt: metadata?.startedAt ?? null, endedAt: null, durationSeconds: metadata?.durationSeconds ?? null, mode: 'unknown', state: value.state, sparkStatus: value.sparkStatus === 'saved' && !spark ? 'unknown' : value.sparkStatus, droppedArtifacts: null, uploadErrors: null, notes: notes?.notes ?? '', revision: notes?.revision ?? value.lastArtifactAt, artifacts: artifacts.map(item => ({ id: item.artifactId, kind: item.kind, scope: 'client', capturedAt: item.capturedAt, durationSeconds: null, bytes: item.bytes, redacted: item.kind !== 'spark' })), sharedServerProfiles: [] });
  }
  expired(campaign: Campaign, artifact: Artifact): boolean { return Date.parse(artifact.receivedAt) + this.campaign(campaign).retentionDays * 86400000 <= this.store.clock(); }
  profile(campaignId: string, testerId: string, offset = 0) {
    const campaign = this.service.campaign(campaignId), tester = this.service.tester(campaignId, testerId);
    const rows = this.page<Session>('pt_session', testerKey(campaignId, testerId), offset);
    return { campaign: this.campaign(campaign), tester: this.tester(campaign, tester), sessions: rows.items.filter(item => Date.parse(item.lastArtifactAt) + this.campaign(campaign).retentionDays * 86400000 > this.store.clock()).map(item => this.session(campaign, tester, item)), nextCursor: rows.nextCursor };
  }
  page<T>(kind: string, owner: string | undefined, offset: number) {
    const rows = (owner === undefined
      ? this.store.db.prepare('SELECT data FROM cs_records WHERE kind=? ORDER BY rowid DESC LIMIT 51 OFFSET ?').all(kind, offset)
      : this.store.db.prepare('SELECT data FROM cs_records WHERE kind=? AND owner=? ORDER BY rowid DESC LIMIT 51 OFFSET ?').all(kind, owner, offset)) as { data: string }[];
    return { items: rows.slice(0, 50).map(row => JSON.parse(row.data) as T), nextCursor: rows.length > 50 ? String(offset + 50) : null };
  }
}
