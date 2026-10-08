import { createHash, randomBytes } from 'node:crypto';
import { discordCallbackInput, discordCallbackSchema, discordIdSchema, discordSessionSchema, discordStartInput, discordStartSchema, logoutSchema, opaqueTokenSchema } from '../contracts/v1/auth';
import { roleCapabilities, type Capability } from '../contracts/v1/admin';
import { DiscordOAuth, type DiscordOAuthOptions } from './discordOAuth';
import { ConnectedStore, ServiceError, type Actor } from './store';

type Options = DiscordOAuthOptions & { guildId: string };
type Enrollment = { active: number; generation: number };
type Session = { digest: string; guild_id: string; user_id: string; name: string; generation: number; expires_at: number };
export type PermissionCheck = (guildId: string, userId: string) => Promise<void>;
export const DASHBOARD_ISSUER = 'discord-dashboard';
export const tokenDigest = (value: string): string => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');

export class DashboardAuth {
  private readonly oauth: DiscordOAuth;
  constructor(readonly store: ConnectedStore, readonly options: Options, readonly checkPermission: PermissionCheck, fetcher: typeof fetch = fetch) {
    this.oauth = new DiscordOAuth(options, fetcher);
    store.transaction(() => store.db.exec(`
      CREATE TABLE IF NOT EXISTS cs_dashboard_enrollments (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, active INTEGER NOT NULL, generation INTEGER NOT NULL, PRIMARY KEY(guild_id,user_id));
      CREATE TABLE IF NOT EXISTS cs_dashboard_attempts (state_digest TEXT PRIMARY KEY, flow_digest TEXT NOT NULL, redirect_uri TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_dashboard_sessions (digest TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, generation INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS cs_dashboard_session_owner ON cs_dashboard_sessions(guild_id,user_id);
    `));
  }
  private enrollment(userId: string): Enrollment | undefined {
    return this.store.db.prepare('SELECT active,generation FROM cs_dashboard_enrollments WHERE guild_id=? AND user_id=?').get(this.options.guildId, userId) as Enrollment | undefined;
  }
  private enrolled(userId: string, generation?: number): Enrollment {
    const row = this.enrollment(userId);
    if (!row?.active || (generation !== undefined && row.generation !== generation)) throw new ServiceError(403, 'ENROLLMENT_REQUIRED', 'Run /dashboard enable in the configured Discord server before signing in.');
    return row;
  }
  private revoke(userId: string, outcome: string): void {
    this.store.transaction(() => {
      this.store.db.prepare('INSERT INTO cs_dashboard_enrollments VALUES (?,?,0,1) ON CONFLICT(guild_id,user_id) DO UPDATE SET active=0,generation=generation+1').run(this.options.guildId, userId);
      this.store.db.prepare('DELETE FROM cs_dashboard_sessions WHERE guild_id=? AND user_id=?').run(this.options.guildId, userId);
      this.store.audit(this.actorId(userId), 'dashboard.revoke', this.options.guildId, outcome);
    });
  }
  private async eligible(userId: string): Promise<void> {
    try { await this.checkPermission(this.options.guildId, userId); }
    catch (error) {
      if (error instanceof ServiceError && error.status === 403) this.revoke(userId, 'permission_or_membership_lost');
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Discord permissions could not be verified. Try again later.');
    }
  }
  async enroll(userId: string, guildId: string | null, active: boolean): Promise<void> {
    discordIdSchema.parse(userId);
    if (guildId !== this.options.guildId) throw new ServiceError(403, 'WRONG_GUILD', 'Use this command in the configured Wilderness Odyssey server.');
    if (!active) { this.revoke(userId, 'self_disabled'); return; }
    const generation = this.enrollment(userId)?.generation ?? 0;
    await this.eligible(userId);
    this.store.transaction(() => {
      const current = this.enrollment(userId);
      if ((current?.generation ?? 0) !== generation) throw new ServiceError(403, 'ENROLLMENT_CHANGED', 'Your access changed. Run /dashboard enable again.');
      if (current?.active) return;
      this.store.db.prepare('INSERT INTO cs_dashboard_enrollments VALUES (?,?,1,1) ON CONFLICT(guild_id,user_id) DO UPDATE SET active=1,generation=generation+1').run(guildId, userId);
      this.store.audit(this.actorId(userId), 'dashboard.enable', guildId, 'enabled');
    });
  }
  start(body: unknown) {
    const { redirectUri } = discordStartInput.parse(body);
    if (redirectUri !== this.options.redirectUri) throw new ServiceError(403, 'REDIRECT_DENIED', 'This sign-in destination is not configured.');
    const state = token(), flowToken = token(), now = this.store.clock(), expiresAt = now + 300000;
    this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM cs_dashboard_attempts WHERE expires_at<=?').run(now);
      this.store.db.prepare('DELETE FROM cs_dashboard_sessions WHERE expires_at<=?').run(now);
      const count = this.store.db.prepare('SELECT count(*) AS n FROM cs_dashboard_attempts').get() as { n: number };
      if (count.n >= 1000) throw new ServiceError(429, 'RATE_LIMITED', 'Please try signing in shortly.');
      this.store.db.prepare('INSERT INTO cs_dashboard_attempts VALUES (?,?,?,?)').run(tokenDigest(state), tokenDigest(flowToken), redirectUri, expiresAt);
    });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: this.options.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'identify', state }).toString();
    return discordStartSchema.parse({ schemaVersion: '1.0', authorizationUrl: url.href, flowToken, expiresAt: new Date(expiresAt).toISOString() });
  }
  async callback(body: unknown) {
    const input = discordCallbackInput.parse(body);
    if (input.redirectUri !== this.options.redirectUri) throw new ServiceError(401, 'FLOW_INVALID', 'Sign-in expired or could not be verified. Start again.');
    const consumed = this.store.transaction(() => this.store.db.prepare('DELETE FROM cs_dashboard_attempts WHERE state_digest=? AND flow_digest=? AND redirect_uri=? AND expires_at>?').run(tokenDigest(input.state), tokenDigest(input.flowToken), input.redirectUri, this.store.clock()).changes);
    if (consumed !== 1) throw new ServiceError(401, 'FLOW_INVALID', 'Sign-in expired or could not be verified. Start again.');
    const user = await this.oauth.identify(input.code);
    const enrollment = this.enrolled(user.id);
    await this.eligible(user.id);
    return this.store.transaction(() => {
      this.enrolled(user.id, enrollment.generation);
      const sessionToken = token(), expiresAt = this.store.clock() + 900000;
      this.store.db.prepare('INSERT INTO cs_dashboard_sessions VALUES (?,?,?,?,?,?)').run(tokenDigest(sessionToken), this.options.guildId, user.id, user.name, enrollment.generation, expiresAt);
      this.store.audit(this.actorId(user.id), 'dashboard.login', this.options.guildId, 'succeeded');
      return discordCallbackSchema.parse({ schemaVersion: '1.0', sessionToken, userId: user.id, guildId: this.options.guildId, expiresAt: new Date(expiresAt).toISOString() });
    });
  }
  private lookup(digest: string): Session {
    const row = this.store.db.prepare('SELECT * FROM cs_dashboard_sessions WHERE digest=? AND guild_id=?').get(digest, this.options.guildId) as Session | undefined;
    if (!row || row.expires_at <= this.store.clock()) throw new ServiceError(401, 'SESSION_EXPIRED', 'Your session expired or was revoked. Sign in again.');
    this.enrolled(row.user_id, row.generation);
    return row;
  }
  async authenticate(value: unknown): Promise<Actor> {
    const parsed = opaqueTokenSchema.safeParse(value);
    if (!parsed.success) throw new ServiceError(401, 'SESSION_INVALID', 'A valid dashboard session is required.');
    const row = this.lookup(tokenDigest(parsed.data));
    return this.authorize({ id: this.actorId(row.user_id), issuer: DASHBOARD_ISSUER, subject: row.user_id, role: 'administrator', displayName: row.name, guildId: row.guild_id, sessionDigest: row.digest }, 'status:read');
  }
  async authorize(actor: Actor, capability: Capability): Promise<Actor> {
    const row = this.lookup(actor.sessionDigest ?? '');
    if (actor.issuer !== DASHBOARD_ISSUER || actor.subject !== row.user_id || actor.guildId !== row.guild_id || actor.id !== this.actorId(row.user_id) || !roleCapabilities.administrator.includes(capability)) throw new ServiceError(403, 'FORBIDDEN', 'This action is not permitted.');
    await this.eligible(row.user_id);
    this.lookup(row.digest); // Logout, disable, expiry or generation change during Discord reads wins.
    return { ...actor, role: 'administrator' };
  }
  async authorizeMember(userId: string): Promise<void> {
    const enrollment = this.enrolled(discordIdSchema.parse(userId));
    await this.eligible(userId);
    this.enrolled(userId, enrollment.generation);
  }
  async session(value: unknown) {
    const actor = await this.authenticate(value);
    const row = this.lookup(actor.sessionDigest!);
    return discordSessionSchema.parse({ schemaVersion: '1.0', user: { id: row.user_id, displayName: row.name, role: 'administrator' }, capabilities: roleCapabilities.administrator, guildId: row.guild_id, expiresAt: new Date(row.expires_at).toISOString() });
  }
  logout(value: unknown) {
    const parsed = opaqueTokenSchema.safeParse(value);
    if (!parsed.success) throw new ServiceError(401, 'SESSION_INVALID', 'A valid dashboard session is required.');
    this.store.db.prepare('DELETE FROM cs_dashboard_sessions WHERE digest=? AND guild_id=?').run(tokenDigest(parsed.data), this.options.guildId);
    return logoutSchema.parse({ schemaVersion: '1.0', revoked: true });
  }
  private actorId(userId: string): string { return DASHBOARD_ISSUER + '|' + this.options.guildId + ':' + userId; }
}
