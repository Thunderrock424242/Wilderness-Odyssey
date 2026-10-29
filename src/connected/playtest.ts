import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as s from '../contracts/v1/playtest';
import type { z } from 'zod';
import { ConnectedStore, ServiceError } from './store';

export type Campaign = z.infer<typeof s.campaignSchema>;
export type Tester = z.infer<typeof s.testerSchema>;
export type Invitation = z.infer<typeof s.invitationSchema> & { digest: string };
export type Installation = z.infer<typeof s.installationSchema> & { id: string };
export type Artifact = z.infer<typeof s.artifactSchema> & { installation: string; digest: string };
export type Session = z.infer<typeof s.sessionSchema> & { installation: string };
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const privateCode = () => randomBytes(32).toString('base64url');
export const testerKey = (campaign: string, tester: string) => campaign + ':' + tester;
const fail = (status: number, code: string, message: string): never => { throw new ServiceError(status, code, message); };

/** Private bytes and immutable metadata share the same SQLite commit and backup boundary. */
export class PlaytestService {
  constructor(readonly store: ConnectedStore) {
    store.db.exec('PRAGMA synchronous=FULL;');
    store.db.exec(`CREATE TABLE IF NOT EXISTS cs_playtest_files (id TEXT PRIMARY KEY, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_playtest_credentials (digest TEXT PRIMARY KEY, installation TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS cs_playtest_installation_credential ON cs_playtest_credentials(installation);`);
    store.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS cs_playtest_invitation_digest ON cs_records(json_extract(data,'$.digest')) WHERE kind='pt_invite';");
  }
  campaign(id: string): Campaign {
    return this.store.record<Campaign>('pt_campaign', id) ?? fail(404, 'NOT_FOUND', 'Campaign not found.');
  }
  tester(campaign: string, id: string): Tester {
    return this.store.record<Tester>('pt_tester', testerKey(campaign, id)) ?? fail(404, 'NOT_FOUND', 'Tester not found.');
  }
  invitation(id: string): Invitation {
    return this.store.record<Invitation>('pt_invite', id) ?? fail(404, 'NOT_FOUND', 'Invitation not found.');
  }
  authenticate(token: string): Installation {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail(401, 'CREDENTIAL_INVALID', 'Installation authentication required.');
    const row = this.store.db.prepare('SELECT installation FROM cs_playtest_credentials WHERE digest=?').get(digest(token)) as { installation: string } | undefined;
    if (!row) return fail(401, 'CREDENTIAL_INVALID', 'Installation authentication required.');
    const installation = this.store.record<Installation>('pt_installation', row.installation);
    if (!installation || installation.revokedAt || this.tester(installation.campaignId, installation.testerId).revokedAt) return fail(410, 'ENROLLMENT_REVOKED', 'Enrollment was revoked. Request a fresh invitation.');
    return installation;
  }
  enroll(body: unknown) {
    const input = s.enrollInput.parse(body);
    return this.store.transaction(() => {
      const row = this.store.db.prepare("SELECT data FROM cs_records WHERE kind='pt_invite' AND json_extract(data,'$.digest')=?").get(digest(input.invitation)) as { data: string } | undefined;
      if (!row) return fail(401, 'INVITATION_INVALID', 'Invitation is invalid.');
      const invite = JSON.parse(row.data) as Invitation;
      if (invite.revokedAt || Date.parse(invite.expiresAt) <= this.store.clock()) return fail(410, 'INVITATION_EXPIRED', 'Invitation expired or was revoked. Request a fresh invitation.');
      if (invite.redeemedAt) return fail(409, 'INVITATION_USED', 'Invitation already redeemed. If the credential was lost, ask staff to revoke enrollment and issue a fresh invitation.');
      const campaign = this.campaign(invite.campaignId), tester = this.tester(invite.campaignId, invite.testerId);
      if (!campaign.enabled || tester.revokedAt) return fail(403, 'COLLECTION_DISABLED', 'Campaign or enrollment is disabled.');
      const id = testerKey(campaign.id, tester.id) + ':' + input.installationId;
      const old = this.store.record<Installation>('pt_installation', id);
      if (old && !old.revokedAt) return fail(409, 'INSTALLATION_EXISTS', 'Revoke the previous enrollment before reenrolling this installation.');
      const token = privateCode();
      const installation: Installation = { id, installationId: input.installationId, campaignId: campaign.id, testerId: tester.id, consentVersion: '1', enrolledAt: this.store.now(), lastSeenAt: null, revokedAt: null, revision: randomUUID() };
      this.store.put('pt_installation', id, testerKey(campaign.id, tester.id), installation);
      this.store.db.prepare('DELETE FROM cs_playtest_credentials WHERE installation=?').run(id);
      this.store.db.prepare('INSERT INTO cs_playtest_credentials VALUES (?,?)').run(digest(token), id);
      this.store.put('pt_invite', invite.id, campaign.id, { ...invite, redeemedAt: this.store.now(), revision: randomUUID() });
      this.store.audit('installation', 'playtest.enroll', invite.id, 'succeeded');
      return { schemaVersion: '1.0', testerId: tester.id, campaignId: campaign.id, accessToken: token };
    });
  }
  policy(token: string) {
    return this.store.transaction(() => {
      const installation = this.authenticate(token), campaign = this.campaign(installation.campaignId);
      this.store.put('pt_installation', installation.id, testerKey(installation.campaignId, installation.testerId), { ...installation, lastSeenAt: this.store.now() });
      if (!campaign.enabled) return { schemaVersion: '1.0', enabled: false };
      return { schemaVersion: '1.0', enabled: true, campaignId: campaign.id, testerId: installation.testerId, collectionId: campaign.collectionId, captureLogs: campaign.captureLogs, captureSpark: campaign.captureSpark, leaseSeconds: 60 };
    });
  }
  accept(token: string, body: unknown) {
    const input = s.artifactInput.parse(body);
    const bytes = this.decode(input);
    const hash = digest(JSON.stringify(input));
    return this.store.transaction(() => {
      // This decision occurs after the complete bounded body read, with no subsequent awaits.
      const installation = this.authenticate(token), campaign = this.campaign(installation.campaignId);
      if (input.campaignId !== campaign.id || input.testerId !== installation.testerId) return fail(403, 'SCOPE_DENIED', 'Artifact does not belong to this enrollment.');
      if (!campaign.enabled || input.collectionId !== campaign.collectionId) return fail(403, 'COLLECTION_DISABLED', 'This collection is no longer authorized.');
      if ((input.kind === 'log' && !campaign.captureLogs) || (input.kind === 'spark' && !campaign.captureSpark)) return fail(403, 'CAPTURE_DISABLED', 'This artifact kind is disabled.');
      const existing = this.store.record<Artifact>('pt_artifact', input.artifactId);
      if (existing) {
        if (existing.installation !== installation.id || existing.digest !== hash) return fail(409, 'ARTIFACT_CONFLICT', 'Artifact identifier conflicts with an existing artifact.');
        if (existing.deletedAt) return fail(410, 'ARTIFACT_DELETED', 'Artifact was explicitly deleted.');
        return { schemaVersion: '1.0', accepted: true, artifactId: input.artifactId };
      }
      const session = this.store.record<Session>('pt_session', input.sessionId);
      if (session && (session.installation !== installation.id || session.collectionId !== input.collectionId)) return fail(403, 'SESSION_SCOPE_DENIED', 'Session does not belong to this installation and collection.');
      const quota = this.store.db.prepare("SELECT count(*) AS n, COALESCE(sum(CASE WHEN json_extract(data,'$.deletedAt') IS NULL THEN json_extract(data,'$.bytes') ELSE 0 END),0) AS total, COALESCE(sum(CASE WHEN owner=? AND json_extract(data,'$.deletedAt') IS NULL THEN json_extract(data,'$.bytes') ELSE 0 END),0) AS tester FROM cs_records WHERE kind='pt_artifact'").get(testerKey(campaign.id, input.testerId)) as { n: number; total: number; tester: number };
      if (quota.n >= 100000 || quota.total + bytes.length > 512 * 1024 * 1024 || quota.tester + bytes.length > 64 * 1024 * 1024) return fail(429, 'STORAGE_FULL', 'Private artifact storage is full. Ask staff to review retention.');
      const { content: _content, encoding: _encoding, schemaVersion: _version, ...metadata } = input;
      const record: Artifact = { ...metadata, installation: installation.id, receivedAt: this.store.now(), bytes: bytes.length, digest: hash, revision: randomUUID(), deletedAt: null };
      this.store.db.prepare('INSERT INTO cs_playtest_files VALUES (?,?)').run(input.artifactId, bytes);
      this.store.put('pt_artifact', input.artifactId, testerKey(campaign.id, input.testerId), record);
      let observed: z.infer<typeof s.sessionContent> | undefined;
      if (input.kind === 'session') observed = s.sessionContent.parse(JSON.parse(bytes.toString('utf8')));
      // Capture clocks are untrusted labels. Terminal observations cannot be undone by queued recording updates.
      const update = observed && (observed.state === session?.state
        || (session?.state !== 'ended' && (session?.state !== 'interrupted' || observed.state === 'ended')));
      const next: Session = {
        ...(session ?? { id: input.sessionId, campaignId: campaign.id, testerId: input.testerId, collectionId: input.collectionId, installation: installation.id, firstArtifactAt: record.receivedAt, state: 'unknown', sparkStatus: 'unknown', observedAt: null, observedReceivedAt: null }),
        lastArtifactAt: record.receivedAt,
        ...(update && observed ? { state: observed.state, sparkStatus: observed.sparkStatus, observedAt: input.capturedAt, observedReceivedAt: record.receivedAt } : {}),
      };
      this.store.put('pt_session', input.sessionId, testerKey(campaign.id, input.testerId), next);
      this.store.enqueue('playtest-artifact:' + input.artifactId, 'staff', 'Playtest ' + input.kind + ' saved: ' + input.artifactId + ' (tester ' + input.testerId + ', campaign ' + campaign.id + ', session ' + input.sessionId + ').');
      return { schemaVersion: '1.0', accepted: true, artifactId: input.artifactId };
    });
  }
  private decode(input: s.ArtifactInput): Buffer {
    let bytes: Buffer;
    if (input.kind === 'spark') {
      if (input.contentType !== 'application/x-spark-sampler' || input.encoding !== 'base64' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content)) return fail(400, 'INVALID_PROFILE', 'Send a base64 Spark profile.');
      const length = input.content.length / 4 * 3 - (input.content.endsWith('==') ? 2 : input.content.endsWith('=') ? 1 : 0);
      if (length > 1024 * 1024) return fail(413, 'TOO_LARGE', 'Spark profile exceeds 1 MiB.');
      bytes = Buffer.from(input.content, 'base64');
      if (bytes.toString('base64') !== input.content) return fail(400, 'INVALID_PROFILE', 'Send canonical base64.');
    } else {
      if (input.encoding !== 'utf8' || input.contentType !== (input.kind === 'session' ? 'application/json' : 'text/plain')) return fail(400, 'INVALID_CONTENT_TYPE', 'Unexpected artifact content type or encoding.');
      if (Buffer.byteLength(input.content, 'utf8') > 256 * 1024) return fail(413, 'TOO_LARGE', 'Text artifact exceeds 256 KiB.');
      bytes = Buffer.from(input.content, 'utf8');
      if (input.kind === 'session') {
        let parsed: unknown;
        try { parsed = JSON.parse(input.content) as unknown; } catch { return fail(400, 'INVALID_SESSION', 'Session content must be JSON.'); }
        s.sessionContent.parse(parsed);
      }
    }
    if (!bytes.length) return fail(400, 'EMPTY_ARTIFACT', 'Artifact is empty.');
    return bytes;
  }
}
