import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as s from '../contracts/v1/playtests';
import { playtestRoutes } from '../contracts/v1/playtest-routes';
import { authorize, ConnectedStore, ServiceError, type Actor } from './store';
import { privateCode, testerKey, type Campaign, type Tester, type Invitation, type Artifact, type Session } from './playtest';
import { PlaytestWebsiteViews, changed, missing, type TesterMetadata, type Notes } from './playtestWebsiteViews';
import { redactReportText } from '../services/connectedReportService';

/** Adapter over the existing installation store; the website never owns collection policy. */
export class PlaytestWebsite extends PlaytestWebsiteViews {
  constructor(store: ConnectedStore, readonly publicApiOrigin?: string) {
    super(store);
    if (publicApiOrigin) { const url = new URL(publicApiOrigin); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use an HTTPS playtest API origin.'); }
    store.db.exec('CREATE TABLE IF NOT EXISTS cs_playtest_web_receipts(actor TEXT NOT NULL,path TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL,invalidated INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(actor,path,key));');
  }
  handle(actor: Actor, method: string, path: string, body: unknown, query: unknown, key: string): unknown {
    const route = playtestRoutes.find(item => item.method === method && item.pattern.test(path));
    if (!route) return missing();
    authorize(actor, route.capability!);
    if (actor.role !== 'administrator') throw new ServiceError(403, 'FORBIDDEN', 'Playtest administrator required.');
    const parsedQuery = (route.query ?? z.object({}).strict()).parse(query) as { cursor?: string };
    const cursor = parsedQuery.cursor ?? '0';
    if (!/^\d{1,7}$/.test(cursor)) throw new ServiceError(400, 'INVALID_CURSOR', 'Invalid page cursor.');
    const input: unknown = route.input?.parse(body);
    const operation = () => route.output.parse(this.dispatch(actor, method, path.split('/').filter(Boolean), input, Number(cursor)));
    if (method === 'GET') return operation();
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new ServiceError(400, 'IDEMPOTENCY_REQUIRED', 'A request identifier is required.');
    const action = method + ':' + path, hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM cs_playtest_web_receipts WHERE created_at<?').run(this.store.clock() - 86400000);
      const previous = this.store.db.prepare('SELECT hash,result,invalidated FROM cs_playtest_web_receipts WHERE actor=? AND path=? AND key=?').get(actor.id, action, key) as { hash: string; result: string; invalidated: number } | undefined;
      if (previous) {
        changed(hash, previous.hash);
        if (previous.invalidated) throw new ServiceError(410, 'RESULT_DELETED', 'This result was deleted. Submit a new request for any new enrollment.');
        const sessionId = /\/sessions\/([A-Za-z0-9_-]+)\/notes$/.exec(path)?.[1];
        if (sessionId) {
          const session = this.store.record<Session>('pt_session', sessionId);
          if (!session || Date.parse(session.lastArtifactAt) + this.campaign(this.service.campaign(session.campaignId)).retentionDays * 86400000 <= this.store.clock()) throw new ServiceError(410, 'RESULT_EXPIRED', 'The session retention period ended.');
        }
        return route.output.parse(JSON.parse(previous.result));
      }
      const quota = this.store.db.prepare('SELECT count(*) AS n,coalesce(sum(length(result)),0) AS bytes FROM cs_playtest_web_receipts').get() as { n: number; bytes: number };
      if (quota.n >= 10000 || quota.bytes >= 32 * 1024 * 1024) throw new ServiceError(429, 'RECEIPTS_FULL', 'Wait before submitting more changes.');
      const result = operation();
      this.store.db.prepare('INSERT INTO cs_playtest_web_receipts(actor,path,key,hash,result,created_at) VALUES (?,?,?,?,?,?)').run(actor.id, action, key, hash, JSON.stringify(result), this.store.clock());
      this.store.audit(actor.id, 'playtests.change', path, 'succeeded');
      return result;
    });
  }
  private dispatch(actor: Actor, method: string, parts: string[], body: unknown, offset: number): unknown {
    if (parts.length === 1) {
      if (method === 'GET') { const page = this.page<Campaign>('pt_campaign', undefined, offset); return { schemaVersion: '1.0', campaigns: page.items.map(item => this.campaign(item)), nextCursor: page.nextCursor }; }
      const input = s.createCampaignInput.parse(body), id = randomUUID();
      const campaign: Campaign = { id, title: input.title, enabled: false, collectionId: null, captureLogs: true, captureSpark: true, revision: randomUUID(), createdAt: this.store.now(), updatedAt: this.store.now() };
      this.store.put('pt_campaign', id, id, campaign);
      this.store.put('pt_web_campaign', id, id, { build: input.build, retentionDays: input.retentionDays });
      return { schemaVersion: '1.0', campaign: this.campaign(campaign) };
    }
    if (parts[1] === 'testers' && parts[3] === 'history') {
      const identities = this.store.db.prepare("SELECT count(DISTINCT json_extract(data,'$.discordUserId')) AS n FROM cs_records WHERE kind='pt_tester' AND json_extract(data,'$.id')=?").get(parts[2]!) as { n: number };
      if (identities.n > 1) throw new ServiceError(409, 'TESTER_IDENTITY_CONFLICT', 'Legacy tester identifiers refer to different Discord accounts. Open the campaign-specific profile.');
      const rows = this.store.db.prepare("SELECT data FROM cs_records WHERE kind='pt_tester' AND json_extract(data,'$.id')=? ORDER BY rowid DESC LIMIT 51 OFFSET ?").all(parts[2]!, offset) as { data: string }[];
      const groups = rows.slice(0, 50).map(row => { const tester = JSON.parse(row.data) as Tester; return this.profile(tester.campaignId, tester.id); });
      return { schemaVersion: '1.0', testerId: parts[2], groups, nextCursor: rows.length > 50 ? String(offset + 50) : null };
    }
    const campaign = this.service.campaign(parts[1]!);
    if (parts.length === 2) { const rows = this.page<Tester>('pt_tester', campaign.id, offset); return { schemaVersion: '1.0', campaign: this.campaign(campaign), testers: rows.items.map(item => this.tester(campaign, item)), nextCursor: rows.nextCursor }; }
    if (parts[2] === 'collection') {
      const input = s.collectionInput.parse(body); changed(input.revision, campaign.revision);
      const next = { ...campaign, enabled: input.collect, collectionId: input.collect ? campaign.collectionId ?? randomUUID() : null, updatedAt: this.store.now(), revision: randomUUID() };
      this.store.put('pt_campaign', campaign.id, campaign.id, next);
      return { schemaVersion: '1.0', campaign: this.campaign(next) };
    }
    if (parts[2] === 'invitations') {
      if (!this.publicApiOrigin) throw new ServiceError(503, 'PLAYTEST_API_NOT_CONFIGURED', 'Configure PLAYTEST_PUBLIC_API_ORIGIN before issuing client invitations.');
      const input = s.invitationInput.parse(body); changed(input.revision, campaign.revision);
      const old = input.testerId ? this.service.tester(campaign.id, input.testerId) : null;
      const discordUserId = input.discordUserId ?? old?.discordUserId;
      if (!discordUserId || (old && old.discordUserId !== discordUserId)) throw new ServiceError(422, 'TESTER_IDENTITY_REQUIRED', 'Provide the intended tester Discord user ID.');
      const id = old?.id ?? discordUserId, owner = testerKey(campaign.id, id);
      const existing = old ?? this.store.record<Tester>('pt_tester', owner);
      if (existing && existing.discordUserId !== discordUserId) throw new ServiceError(409, 'TESTER_IDENTITY_CONFLICT', 'This legacy tester identifier belongs to a different Discord account.');
      const tester: Tester = { id, campaignId: campaign.id, discordUserId, displayName: input.testerLabel, revision: randomUUID(), approvedAt: this.store.now(), revokedAt: null };
      if (existing?.revokedAt) this.revokeInstallations(owner);
      this.store.put('pt_tester', owner, campaign.id, tester);
      this.store.put('pt_web_tester', owner, owner, { permission: 'allowed', campaignCollection: campaign.collectionId, collectionId: randomUUID() });
      const code = privateCode(), invitationId = randomUUID(), expiresAt = new Date(this.store.clock() + input.expiresInHours * 3600000).toISOString();
      const invitation: Invitation = { id: invitationId, campaignId: campaign.id, testerId: id, digest: createHash('sha256').update(code).digest('hex'), expiresAt, redeemedAt: null, revokedAt: null, revision: randomUUID() };
      this.store.put('pt_invite', invitationId, campaign.id, invitation);
      return { schemaVersion: '1.0', campaignId: campaign.id, invitation: { id: invitationId, code, expiresAt, testerLabel: tester.displayName, publicApiOrigin: this.publicApiOrigin } };
    }
    const tester = this.service.tester(campaign.id, parts[3]!);
    const owner = testerKey(campaign.id, tester.id);
    if (parts.length === 4) return { schemaVersion: '1.0', ...this.profile(campaign.id, tester.id, offset) };
    if (parts[4] === 'permission') {
      const input = s.testerPermissionInput.parse(body); changed(input.revision, tester.revision);
      if (tester.revokedAt && input.permission !== 'revoked') throw new ServiceError(410, 'ENROLLMENT_REVOKED', 'A fresh invitation and consent are required.');
      if (input.permission === 'revoked') {
        this.revokeInstallations(owner);
        this.store.put('pt_campaign', campaign.id, campaign.id, { ...campaign, revision: randomUUID() });
      }
      const next = { ...tester, revision: randomUUID(), approvedAt: this.store.now(), revokedAt: input.permission === 'revoked' ? this.store.now() : null };
      this.store.put('pt_tester', owner, campaign.id, next);
      const meta: TesterMetadata = { permission: input.permission, campaignCollection: campaign.collectionId, collectionId: input.permission === 'allowed' ? randomUUID() : null };
      this.store.put('pt_web_tester', owner, owner, meta);
      return { schemaVersion: '1.0', campaignId: campaign.id, tester: this.tester(campaign, next) };
    }
    if (parts[4] === 'data') {
      const input = s.deleteDataInput.parse(body); changed(input.revision, tester.revision);
      this.revokeInstallations(owner);
      // Invalidate pre-deletion invitation preconditions even after receipt expiry.
      this.store.put('pt_campaign', campaign.id, campaign.id, { ...campaign, revision: randomUUID() });
      this.store.put('pt_tester', owner, campaign.id, { ...tester, revokedAt: this.store.now(), revision: randomUUID() });
      this.store.db.prepare("DELETE FROM cs_playtest_files WHERE id IN (SELECT id FROM cs_records WHERE kind='pt_artifact' AND owner=?)").run(owner);
      this.store.db.prepare("DELETE FROM cs_records WHERE owner=? AND kind IN ('pt_artifact','pt_session','pt_session_metadata','pt_web_notes')").run(owner);
      // Keep payload-free tombstones so a queued/retried pre-deletion request
      // cannot silently reenroll this tester or restore deleted notes.
      this.store.db.prepare(`UPDATE cs_playtest_web_receipts SET result='null',invalidated=1 WHERE path LIKE ? OR json_extract(result,'$.invitation.id') IN (SELECT id FROM cs_records WHERE kind='pt_invite' AND owner=? AND json_extract(data,'$.testerId')=?)`).run('%:/playtests/' + campaign.id + '/testers/' + tester.id + '/%', campaign.id, tester.id);
      return { schemaVersion: '1.0', campaignId: campaign.id, testerId: tester.id, deleted: true };
    }
    const session = this.store.record<Session>('pt_session', parts[5]!) ?? missing();
    if (session.campaignId !== campaign.id || session.testerId !== tester.id || Date.parse(session.lastArtifactAt) + this.campaign(campaign).retentionDays * 86400000 <= this.store.clock()) return missing();
    if (parts[6] === 'notes') {
      const input = s.sessionNotesInput.parse(body), current = this.session(campaign, tester, session); changed(input.revision, current.revision);
      const notes: Notes = { notes: input.notes, revision: randomUUID() };
      this.store.put('pt_web_notes', session.id, owner, notes);
      return { schemaVersion: '1.0', campaignId: campaign.id, testerId: tester.id, session: this.session(campaign, tester, session) };
    }
    if (parts[6] !== 'artifacts') return missing(); // No fabricated server profiles.
    const artifact = this.store.record<Artifact>('pt_artifact', parts[7]!) ?? missing();
    if (artifact.campaignId !== campaign.id || artifact.testerId !== tester.id || artifact.sessionId !== session.id || artifact.deletedAt || this.expired(campaign, artifact)) return missing();
    const file = this.store.db.prepare('SELECT bytes FROM cs_playtest_files WHERE id=?').get(artifact.artifactId) as { bytes: Uint8Array } | undefined;
    if (!file) return missing();
    this.store.audit(actor.id, 'playtests.artifact.read', artifact.artifactId, 'succeeded');
    const common = { schemaVersion: '1.0', campaignId: campaign.id, testerId: tester.id, sessionId: session.id, artifactId: artifact.artifactId, kind: artifact.kind, scope: 'client' };
    return artifact.kind === 'spark' ? { ...common, redacted: false, contentType: 'application/x-spark-sampler', encoding: 'base64', content: Buffer.from(file.bytes).toString('base64') } : { ...common, redacted: true, contentType: 'text/plain', encoding: 'utf8', content: redactReportText(Buffer.from(file.bytes).toString('utf8')) };
  }
  private revokeInstallations(owner: string) {
    this.store.db.prepare("UPDATE cs_records SET data=json_set(data,'$.revokedAt',?) WHERE kind='pt_installation' AND owner=?").run(this.store.now(), owner);
    const [campaignId, testerId] = owner.split(':');
    this.store.db.prepare("UPDATE cs_records SET data=json_set(data,'$.revokedAt',?) WHERE kind='pt_invite' AND owner=? AND json_extract(data,'$.testerId')=?").run(this.store.now(), campaignId!, testerId!);
  }
  cleanup(): void {
    this.store.transaction(() => {
      // Retention follows trusted receipt time, never a client-supplied clock.
      this.store.db.prepare(`DELETE FROM cs_playtest_files WHERE id IN (SELECT a.id FROM cs_records a LEFT JOIN cs_records c ON c.kind='pt_web_campaign' AND c.id=json_extract(a.data,'$.campaignId') WHERE a.kind='pt_artifact' AND julianday(json_extract(a.data,'$.receivedAt')) <= julianday(?) - coalesce(json_extract(c.data,'$.retentionDays'),30))`).run(this.store.now());
      this.store.db.prepare(`UPDATE cs_records AS a SET data=json_set(data,'$.deletedAt',?) WHERE a.kind='pt_artifact' AND json_extract(a.data,'$.deletedAt') IS NULL AND NOT EXISTS(SELECT 1 FROM cs_playtest_files f WHERE f.id=a.id)`).run(this.store.now());
      const expiredSessions = `SELECT a.id FROM cs_records a LEFT JOIN cs_records c ON c.kind='pt_web_campaign' AND c.id=json_extract(a.data,'$.campaignId') WHERE a.kind='pt_session' AND julianday(json_extract(a.data,'$.lastArtifactAt')) <= julianday(?) - coalesce(json_extract(c.data,'$.retentionDays'),30)`;
      this.store.db.prepare("UPDATE cs_playtest_web_receipts SET result='null',invalidated=1 WHERE json_extract(result,'$.session.id') IN (" + expiredSessions + ')').run(this.store.now());
      this.store.db.prepare("DELETE FROM cs_records WHERE kind IN ('pt_web_notes','pt_session_metadata') AND id IN (" + expiredSessions + ')').run(this.store.now());
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='pt_session' AND id IN (" + expiredSessions + ')').run(this.store.now());
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='pt_artifact' AND json_extract(data,'$.deletedAt') IS NOT NULL AND julianday(json_extract(data,'$.deletedAt')) < julianday(?) - 30").run(this.store.now());
      this.store.db.prepare('DELETE FROM cs_playtest_web_receipts WHERE created_at<?').run(this.store.clock() - 86400000);
    });
  }
}
