import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { discordStartInput, discordStartSchema, discordCallbackInput, discordCallbackSchema, opaqueTokenSchema, discordIdSchema, logoutSchema } from '../contracts/v1/auth';
import * as s from '../contracts/v1/participants';
import { ConnectedStore, ServiceError } from './store';
import { DiscordOAuth, type DiscordOAuthOptions } from './discordOAuth';
import { tokenDigest } from './dashboardAuth';

type Invite = { id: string; user_id: string; campaign_id: string; digest: string; expires_at: number; claimed_at: string | null; revoked: number; delivery: 'sent' | 'failed' | 'unknown' };
type Campaign = { id: string; title: string; enabled: boolean };
type Session = { id: string; campaignId: string; testerId: string; firstArtifactAt: string; state: string };
type Metadata = { startedAt: string; durationSeconds: number | null; build: string | null };
type Membership = { campaign_id: string; claimed_at: string };
const token = () => randomBytes(32).toString('base64url');
const deny = (status: number, message: string): never => { throw new ServiceError(status, 'PARTICIPANT_DENIED', message); };

export class ParticipantService {
  private readonly oauth: DiscordOAuth;
  constructor(readonly store: ConnectedStore, readonly options: DiscordOAuthOptions & { guildId: string }, fetcher: typeof fetch = fetch) {
    this.oauth = new DiscordOAuth(options, fetcher);
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS cs_participant_configuration (id INTEGER PRIMARY KEY CHECK(id=1), guild_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_participant_flows (state TEXT PRIMARY KEY, flow TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_participant_sessions (digest TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_participant_invites (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL, campaign_id TEXT NOT NULL, digest TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, claimed_at TEXT, revoked INTEGER NOT NULL DEFAULT 0, delivery TEXT NOT NULL DEFAULT 'unknown');
      CREATE INDEX IF NOT EXISTS cs_participant_invite_user ON cs_participant_invites(user_id);
      CREATE TABLE IF NOT EXISTS cs_participant_memberships (user_id TEXT NOT NULL, campaign_id TEXT NOT NULL, claimed_at TEXT NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(user_id,campaign_id));
    `);
    store.db.prepare('INSERT OR IGNORE INTO cs_participant_configuration VALUES (1,?)').run(options.guildId);
    const scope = store.db.prepare('SELECT guild_id FROM cs_participant_configuration WHERE id=1').get() as { guild_id: string };
    if (scope.guild_id !== options.guildId) throw new ServiceError(503, 'GUILD_MISMATCH', 'Participant storage is bound to another guild. An explicit migration is required.');
  }
  start(body: unknown) {
    if (discordStartInput.parse(body).redirectUri !== this.options.redirectUri) return deny(403, 'Sign-in destination is not configured.');
    const now = this.store.clock(), state = token(), flowToken = token();
    this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM cs_participant_flows WHERE expires<=?').run(now);
      this.store.db.prepare('DELETE FROM cs_participant_sessions WHERE expires<=?').run(now);
      const row = this.store.db.prepare('SELECT count(*) AS n FROM cs_participant_flows').get() as { n: number };
      if (row.n >= 1000) return deny(429, 'Please try signing in shortly.');
      this.store.db.prepare('INSERT INTO cs_participant_flows VALUES (?,?,?)').run(tokenDigest(state), tokenDigest(flowToken), now + 300000);
    });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: this.options.clientId, redirect_uri: this.options.redirectUri, response_type: 'code', scope: 'identify', state }).toString();
    return discordStartSchema.parse({ schemaVersion: '1.0', authorizationUrl: url.href, flowToken, expiresAt: new Date(now + 300000).toISOString() });
  }
  async callback(body: unknown) {
    const input = discordCallbackInput.parse(body);
    if (input.redirectUri !== this.options.redirectUri) return deny(401, 'Start Discord sign-in again.');
    const changes = this.store.db.prepare('DELETE FROM cs_participant_flows WHERE state=? AND flow=? AND expires>?').run(tokenDigest(input.state), tokenDigest(input.flowToken), this.store.clock()).changes;
    if (changes !== 1) return deny(401, 'Sign-in expired. Start again.');
    const user = await this.oauth.identify(input.code), sessionToken = token(), expires = this.store.clock() + 900000;
    this.store.db.prepare('INSERT INTO cs_participant_sessions VALUES (?,?,?,?)').run(tokenDigest(sessionToken), user.id, user.name, expires);
    return discordCallbackSchema.parse({ schemaVersion: '1.0', sessionToken, userId: user.id, guildId: this.options.guildId, expiresAt: new Date(expires).toISOString() });
  }
  session(value: unknown) {
    const parsed = opaqueTokenSchema.safeParse(value);
    if (!parsed.success) return deny(401, 'Sign in with Discord.');
    const row = this.store.db.prepare('SELECT * FROM cs_participant_sessions WHERE digest=? AND expires>?').get(tokenDigest(parsed.data), this.store.clock()) as { user_id: string; name: string; expires: number } | undefined;
    if (!row) return deny(401, 'Your session expired. Sign in again.');
    return s.participantSessionSchema.parse({ schemaVersion: '1.0', user: { id: row.user_id, displayName: row.name }, guildId: this.options.guildId, expiresAt: new Date(row.expires).toISOString(), campaignIds: this.memberships(row.user_id).map(member => member.campaign_id) });
  }
  logout(value: unknown) {
    this.store.db.prepare('DELETE FROM cs_participant_sessions WHERE digest=?').run(tokenDigest(opaqueTokenSchema.parse(value)));
    return logoutSchema.parse({ schemaVersion: '1.0', revoked: true });
  }
  invite(userId: string, campaignId: string, key: string, hours: number) {
    s.participantInviteInput.parse({ discordUserId: userId, campaignId, expiresInHours: hours });
    if (!this.store.record<Campaign>('pt_campaign', campaignId)) return deny(404, 'Playtest not found.');
    const requestKey = tokenDigest(key);
    const old = this.store.db.prepare('SELECT * FROM cs_participant_invites WHERE request_key=?').get(requestKey) as Invite | undefined;
    // A lost receipt cannot reconstruct a hash-only secret. Retry delivery via a fresh invitation.
    if (old) return deny(409, 'This request already issued an invitation. Create a new invitation to retry delivery.');
    const raw = token(), id = randomUUID(), expires = this.store.clock() + hours * 3600000;
    this.store.db.prepare('INSERT INTO cs_participant_invites(id,request_key,user_id,campaign_id,digest,expires_at) VALUES (?,?,?,?,?,?)').run(id, requestKey, userId, campaignId, tokenDigest(raw), expires);
    return { id, token: raw, expiresAt: new Date(expires).toISOString() };
  }
  createCampaign(id: string, title: string) {
    const input = z.object({ id:z.string().regex(/^[A-Za-z0-9_-]{1,96}$/), title:z.string().trim().min(1).max(100) }).parse({ id,title });
    this.store.transaction(() => {
      if (this.store.record('pt_campaign',input.id)) return deny(409,'This playtest already exists.');
      this.store.put('pt_campaign',input.id,input.id,{ id:input.id, title:input.title, enabled:false, collectionId:null, captureLogs:false, captureSpark:false, revision:randomUUID(), createdAt:this.store.now(), updatedAt:this.store.now() });
    });
  }
  claim(userId: string, raw: string) {
    discordIdSchema.parse(userId); opaqueTokenSchema.parse(raw);
    return this.store.transaction(() => {
      const row = this.store.db.prepare('SELECT * FROM cs_participant_invites WHERE digest=?').get(tokenDigest(raw)) as Invite | undefined;
      if (!row || row.user_id !== userId) return deny(403, 'This invitation belongs to another account or is invalid.');
      if (row.revoked) return deny(403, 'This invitation was revoked. Ask staff for help.');
      if (row.claimed_at) {
        if (!this.memberships(userId).some(m => m.campaign_id === row.campaign_id)) return deny(403, 'Your playtest access was withdrawn.');
      } else {
        if (row.expires_at <= this.store.clock()) return deny(410, 'This invitation expired. Ask staff for a new invitation.');
        if (!this.store.record('pt_campaign', row.campaign_id)) return deny(404, 'Playtest not found.');
        const now = this.store.now();
        this.store.db.prepare('UPDATE cs_participant_invites SET claimed_at=? WHERE id=?').run(now, row.id);
        this.store.db.prepare('INSERT INTO cs_participant_memberships VALUES (?,?,?,1) ON CONFLICT(user_id,campaign_id) DO UPDATE SET claimed_at=excluded.claimed_at,active=1').run(userId, row.campaign_id, now);
        this.store.audit('participant|' + userId, 'participant.claim', row.campaign_id, 'claimed');
      }
      return s.participantClaimSchema.parse({ schemaVersion: '1.0', claimed: true, campaignId: row.campaign_id });
    });
  }
  revoke(userId: string, campaignId: string) {
    this.store.transaction(() => {
      this.store.db.prepare('UPDATE cs_participant_memberships SET active=0 WHERE user_id=? AND campaign_id=?').run(userId, campaignId);
      this.store.db.prepare('UPDATE cs_participant_invites SET revoked=1 WHERE user_id=? AND campaign_id=?').run(userId, campaignId);
      this.store.audit('participant|' + userId, 'participant.revoke', campaignId, 'revoked');
    });
    return s.participantRevokeSchema.parse({ schemaVersion: '1.0', revoked: true });
  }
  private memberships(userId: string): Membership[] {
    return this.store.db.prepare('SELECT campaign_id,claimed_at FROM cs_participant_memberships WHERE user_id=? AND active=1 ORDER BY claimed_at DESC').all(userId) as Membership[];
  }
  private sessions(userId: string) {
    // Ownership comes from trusted tester records, never a caller-selected tester id.
    const rows = this.store.db.prepare(`SELECT s.data FROM cs_records s JOIN cs_records t ON t.kind='pt_tester' AND json_extract(t.data,'$.id')=json_extract(s.data,'$.testerId') AND json_extract(t.data,'$.campaignId')=json_extract(s.data,'$.campaignId') JOIN cs_participant_memberships m ON m.campaign_id=json_extract(s.data,'$.campaignId') AND m.user_id=? AND m.active=1 WHERE s.kind='pt_session' AND json_extract(t.data,'$.discordUserId')=? AND json_extract(t.data,'$.revokedAt') IS NULL ORDER BY json_extract(s.data,'$.firstArtifactAt') DESC,s.id`).all(userId, userId) as { data: string }[];
    return rows.map(row => {
      const session = JSON.parse(row.data) as Session;
      const meta = this.store.record<Metadata>('pt_session_metadata', session.id);
      const campaign = this.store.record<Campaign>('pt_campaign', session.campaignId);
      return { id: session.id, campaignId: session.campaignId, title: campaign?.title ?? 'Playtest', build: meta?.build ?? null, startedAt: meta?.startedAt ?? null, durationSeconds: meta?.durationSeconds ?? null, state: ['recording', 'ended', 'interrupted'].includes(session.state) ? session.state : 'unknown' };
    });
  }
  private stats(sessions: ReturnType<ParticipantService['sessions']>) {
    let unknown = 0;
    const intervals: [number, number][] = [];
    for (const item of sessions) {
      const start = Date.parse(item.startedAt ?? ''), duration = item.durationSeconds;
      if (duration === null || !Number.isSafeInteger(duration) || duration < 0 || !Number.isFinite(start)) { unknown++; continue; }
      intervals.push([start / 1000, start / 1000 + duration]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let recordedSeconds = 0, end = -Infinity;
    for (const interval of intervals) { recordedSeconds += Math.max(0, interval[1] - Math.max(end, interval[0])); end = Math.max(end, interval[1]); }
    return { recordedSeconds: Math.floor(recordedSeconds), sessions: sessions.length, unknownDurationSessions: unknown };
  }
  home(userId: string, displayName: string) {
    const sessions = this.sessions(userId);
    const campaigns = this.memberships(userId).flatMap(member => {
      const campaign = this.store.record<Campaign>('pt_campaign', member.campaign_id);
      if (!campaign) return [];
      const content = this.store.record<{ instructions: string; announcement: string; tasks: string[] }>('pt_participant_content', campaign.id);
      return [{ id: campaign.id, title: campaign.title, claimedAt: member.claimed_at, collectionActive: campaign.enabled, instructions: content?.instructions ?? '', announcement: content?.announcement ?? '', tasks: content?.tasks ?? [], stats: this.stats(sessions.filter(item => item.campaignId === campaign.id)) }];
    });
    const pending = this.store.db.prepare('SELECT id,campaign_id,expires_at FROM cs_participant_invites WHERE user_id=? AND claimed_at IS NULL AND revoked=0 AND expires_at>? ORDER BY expires_at LIMIT 100').all(userId, this.store.clock()) as { id: string; campaign_id: string; expires_at: number }[];
    return s.participantHomeSchema.parse({ schemaVersion: '1.0', user: { id: userId, displayName }, stats: this.stats(sessions), campaigns, invitations: pending.map(row => ({ id: row.id, campaignId: row.campaign_id, title: this.store.record<Campaign>('pt_campaign', row.campaign_id)?.title ?? 'Playtest', expiresAt: new Date(row.expires_at).toISOString() })) });
  }
  history(userId: string, cursor: string | undefined) {
    s.participantQuery.parse(cursor ? { cursor } : {});
    const offset = Number(cursor ?? 0), sessions = this.sessions(userId);
    return s.participantHistorySchema.parse({ schemaVersion: '1.0', userId, sessions: sessions.slice(offset, offset + 25), nextCursor: offset + 25 < sessions.length ? String(offset + 25) : null });
  }
  content(body: unknown) {
    const value = s.participantContentInput.parse(body);
    if (!this.store.record('pt_campaign', value.campaignId)) return deny(404, 'Playtest not found.');
    this.store.put('pt_participant_content', value.campaignId, value.campaignId, value);
    return s.participantContentSchema.parse({ schemaVersion: '1.0', saved: true });
  }
}
