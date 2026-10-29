import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import * as s from '../contracts/v1/playtest';
import { authorize, ConnectedStore, ServiceError, type Actor } from './store';
import { PlaytestService, privateCode, testerKey, type Campaign, type Tester, type Invitation, type Installation, type Artifact, type Session } from './playtest';

export class PrivateArtifactDownload {
  constructor(readonly filename: string, readonly contentType: string, readonly bytes: Buffer) {}
}
const changed = (expected: string, actual: string) => { if (expected !== actual) throw new ServiceError(409, 'REVISION_CONFLICT', 'This record changed. Refresh before trying again.'); };
const missing = (): never => { throw new ServiceError(404, 'NOT_FOUND', 'Record not found.'); };

export class PlaytestAdmin {
  readonly service: PlaytestService;
  constructor(readonly store: ConnectedStore) { this.service = new PlaytestService(store); }
  handle(actor: Actor, method: string, path: string, body: unknown, query: unknown, key: string): unknown {
    const parts = path.split('/').filter(Boolean);
    if (parts.some(part => !/^[A-Za-z0-9_-]{1,100}$/.test(part))) throw new ServiceError(400, 'INVALID_PATH', 'Invalid resource identifier.');
    authorize(actor, method === 'GET' ? 'reports:read' : 'server:write');
    if (method === 'GET') return this.read(actor, parts, query);
    z.object({}).strict().parse(query);
    const mutation = (action: string, input: { reason: string }, change: () => void) => {
      const operation = this.store.mutate(actor, 'playtest:' + action, key, input, 'server:write', () => {
        change();
        // Reason is private audit data, never a client response or staff receipt.
        this.store.put('pt_history', randomUUID(), action, { actorId: actor.id, reason: input.reason, at: this.store.now() });
      });
      return { schemaVersion: '1.0', operation };
    };
    if (method === 'POST' && path === '/campaigns') {
      const input = s.campaignInput.parse(body);
      return mutation(path, input, () => {
        if (this.store.record('pt_campaign', input.id)) throw new ServiceError(409, 'EXISTS', 'Campaign already exists.');
        const campaign: Campaign = { id: input.id, title: input.title, enabled: false, collectionId: null, captureLogs: false, captureSpark: false, revision: randomUUID(), createdAt: this.store.now(), updatedAt: this.store.now() };
        this.store.put('pt_campaign', input.id, input.id, campaign);
      });
    }
    if (parts[0] === 'campaigns' && parts[1]) {
      const campaignId = parts[1];
      if (method === 'PUT' && parts.length === 3 && parts[2] === 'collection') {
        const input = s.collectionInput.parse(body);
        return mutation(path, input, () => {
          const current = this.service.campaign(campaignId);
          changed(input.revision, current.revision);
          const collectionId = input.enabled ? (current.enabled ? current.collectionId : randomUUID()) : null;
          this.store.put('pt_campaign', campaignId, campaignId, { ...current, enabled: input.enabled, captureLogs: input.captureLogs, captureSpark: input.captureSpark, collectionId, revision: randomUUID(), updatedAt: this.store.now() });
          this.store.enqueue('playtest-collection:' + randomUUID(), 'staff', 'Playtest campaign ' + campaignId + ': collection ' + (input.enabled ? 'enabled; waiting for client observations.' : 'disabled; uploads rejected immediately.'));
        });
      }
      if (method === 'POST' && parts.length === 3 && parts[2] === 'testers') {
        const input = s.testerInput.parse(body);
        return mutation(path, input, () => {
          this.service.campaign(campaignId);
          const id = testerKey(campaignId, input.testerId);
          if (this.store.record('pt_tester', id)) throw new ServiceError(409, 'EXISTS', 'Tester already exists; use a fresh tester enrollment identifier after revocation.');
          const tester: Tester = { id: input.testerId, campaignId, discordUserId: input.discordUserId, displayName: input.displayName, revision: randomUUID(), approvedAt: this.store.now(), revokedAt: null };
          this.store.put('pt_tester', id, campaignId, tester);
        });
      }
      if (method === 'POST' && parts.length === 5 && parts[2] === 'testers' && parts[4] === 'revoke') {
        const input = s.revokeInput.parse(body), testerId = parts[3]!;
        return mutation(path, input, () => {
          const tester = this.service.tester(campaignId, testerId);
          changed(input.revision, tester.revision);
          this.store.put('pt_tester', testerKey(campaignId, testerId), campaignId, { ...tester, revokedAt: this.store.now(), revision: randomUUID() });
          this.revokeInstallations(campaignId, testerId);
        });
      }
      if (method === 'POST' && parts.length === 3 && parts[2] === 'invitations') {
        const input = s.inviteInput.parse(body);
        let secret: { id: string; invitation: string; expiresAt: string } | null = null;
        const result = mutation(path, input, () => {
          this.service.campaign(campaignId);
          const tester = this.service.tester(campaignId, input.testerId);
          changed(input.revision, tester.revision);
          if (tester.revokedAt) throw new ServiceError(410, 'ENROLLMENT_REVOKED', 'Approve a fresh tester enrollment before issuing an invitation.');
          if (this.store.record('pt_invite', input.id)) throw new ServiceError(409, 'EXISTS', 'Invitation identifier already exists.');
          const invitation = privateCode(), expiresAt = new Date(this.store.clock() + input.expiresInSeconds * 1000).toISOString();
          const record: Invitation = { id: input.id, campaignId, testerId: tester.id, digest: createHash('sha256').update(invitation).digest('hex'), expiresAt, redeemedAt: null, revokedAt: null, revision: randomUUID() };
          this.store.put('pt_invite', input.id, campaignId, record);
          secret = { id: input.id, invitation, expiresAt };
        });
        return s.invitationIssueSchema.parse({ ...result, invitation: secret });
      }
    }
    if (method === 'POST' && parts.length === 3 && parts[0] === 'invitations' && parts[2] === 'revoke') {
      const input = s.revokeInput.parse(body);
      return mutation(path, input, () => {
        const invite = this.service.invitation(parts[1]!);
        changed(input.revision, invite.revision);
        this.store.put('pt_invite', invite.id, invite.campaignId, { ...invite, revokedAt: this.store.now(), revision: randomUUID() });
      });
    }
    if (method === 'POST' && parts.length === 3 && parts[0] === 'installations' && parts[2] === 'revoke') {
      const input = s.installationRevokeInput.parse(body);
      if (parts[1] !== input.installationId) throw new ServiceError(400, 'INVALID_INPUT', 'Installation identifier mismatch.');
      return mutation(path, input, () => {
        const id = testerKey(input.campaignId, input.testerId) + ':' + input.installationId;
        const installation = this.store.record<Installation>('pt_installation', id) ?? missing();
        changed(input.revision, installation.revision);
        this.store.put('pt_installation', id, testerKey(input.campaignId, input.testerId), { ...installation, revokedAt: this.store.now(), revision: randomUUID() });
      });
    }
    if (method === 'POST' && parts.length === 3 && parts[0] === 'artifacts' && parts[2] === 'delete') {
      const input = s.revokeInput.parse(body);
      return mutation(path, input, () => {
        const artifact = this.store.record<Artifact>('pt_artifact', parts[1]!) ?? missing();
        changed(input.revision, artifact.revision);
        this.store.db.prepare('DELETE FROM cs_playtest_files WHERE id=?').run(artifact.artifactId);
        this.store.put('pt_artifact', artifact.artifactId, testerKey(artifact.campaignId, artifact.testerId), { ...artifact, deletedAt: this.store.now(), revision: randomUUID() });
      });
    }
    return missing();
  }
  private revokeInstallations(campaignId: string, testerId: string): void {
    this.store.db.prepare("UPDATE cs_records SET data=json_set(data,'$.revokedAt',?) WHERE kind='pt_installation' AND owner=?").run(this.store.now(), testerKey(campaignId, testerId));
  }
  private read(actor: Actor, parts: string[], query: unknown): unknown {
    if (parts.length === 3 && parts[0] === 'artifacts' && parts[2] === 'download') {
      z.object({}).strict().parse(query);
      const id = z.uuid().parse(parts[1]);
      const artifact = this.store.record<Artifact>('pt_artifact', id) ?? missing();
      if (artifact.deletedAt) throw new ServiceError(410, 'ARTIFACT_DELETED', 'Artifact was explicitly deleted.');
      const file = this.store.db.prepare('SELECT bytes FROM cs_playtest_files WHERE id=?').get(id) as { bytes: Uint8Array } | undefined;
      if (!file) throw new ServiceError(503, 'FILE_UNAVAILABLE', 'Artifact file is unavailable.');
      this.store.audit(actor.id, 'playtest.download', id, 'succeeded');
      return new PrivateArtifactDownload(id + (artifact.kind === 'spark' ? '.sparkprofile' : artifact.kind === 'session' ? '.json' : '.txt'), artifact.contentType, Buffer.from(file.bytes));
    }
    const parsed = parts.at(-1) === 'artifacts' ? s.artifactsQuery.parse(query) : s.pageInput.parse(query);
    const offset = Number(parsed.cursor ?? 0);
    let kind: string, owner: string | undefined, field: string;
    if (parts.join('/') === 'campaigns') { kind = 'pt_campaign'; field = 'campaigns'; }
    else if (parts[0] === 'campaigns' && parts[1]) {
      this.service.campaign(parts[1]);
      owner = parts[1];
      if (parts.length === 3 && parts[2] === 'testers') { kind = 'pt_tester'; field = 'testers'; }
      else if (parts.length === 3 && parts[2] === 'invitations') { kind = 'pt_invite'; field = 'invitations'; }
      else if (parts.length === 5 && parts[2] === 'testers' && ['sessions', 'artifacts', 'installations'].includes(parts[4]!)) {
        this.service.tester(parts[1], parts[3]!);
        owner = testerKey(parts[1], parts[3]!);
        field = parts[4]!; kind = field === 'sessions' ? 'pt_session' : field === 'artifacts' ? 'pt_artifact' : 'pt_installation';
      } else return missing();
    } else return missing();
    const filters = s.artifactsQuery.parse(parsed);
    const clauses = ['kind=?'];
    const values: (string | number)[] = [kind];
    if (owner !== undefined) { clauses.push('owner=?'); values.push(owner); }
    if (filters.kind) { clauses.push("json_extract(data,'$.kind')=?"); values.push(filters.kind); }
    if (filters.sessionId) { clauses.push("json_extract(data,'$.sessionId')=?"); values.push(filters.sessionId); }
    const rows = this.store.db.prepare('SELECT data FROM cs_records WHERE ' + clauses.join(' AND ') + ' ORDER BY rowid DESC LIMIT 51 OFFSET ?').all(...values, offset) as { data: string }[];
    const items = rows.slice(0, 50).map(row => {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      const { digest: _digest, installation: _installation, ...safe } = data;
      if (kind === 'pt_installation') delete safe.id;
      if (kind === 'pt_session') {
        const session = data as unknown as Session;
        const campaign = this.service.campaign(session.campaignId);
        const installation = this.store.record<Installation>('pt_installation', session.installation);
        const live = !!installation?.lastSeenAt && this.store.clock() - Date.parse(installation.lastSeenAt) <= 60000;
        safe.collectionActive = campaign.enabled && session.collectionId === campaign.collectionId && !installation?.revokedAt;
        const recent = !!session.observedReceivedAt && !!session.observedAt
          && this.store.clock() - Date.parse(session.observedReceivedAt) <= 60000
          && Math.abs(this.store.clock() - Date.parse(session.observedAt)) <= 60000;
        safe.observation = session.state === 'ended' || session.state === 'interrupted' ? session.state : !safe.collectionActive ? (live && session.state === 'recording' ? 'stop requested' : 'stopped') : !live ? 'offline' : recent && session.state === 'recording' ? 'recording' : 'waiting';
        safe.lastSeenAt = installation?.lastSeenAt ?? null;
        const count = this.store.db.prepare("SELECT count(*) AS n FROM cs_records WHERE kind='pt_artifact' AND owner=? AND json_extract(data,'$.sessionId')=? AND json_extract(data,'$.kind')='spark' AND json_extract(data,'$.deletedAt') IS NULL").get(testerKey(session.campaignId, session.testerId), session.id) as { n: number };
        safe.sparkArtifactCount = count.n;
      }
      return safe;
    });
    this.store.audit(actor.id, 'playtest.list', field, 'succeeded');
    const schema = s.listSchemas[field as keyof typeof s.listSchemas];
    return { schemaVersion: '1.0', [field]: items.map(item => schema.parse(item)), nextCursor: rows.length > 50 ? String(offset + 50) : null };
  }
}
