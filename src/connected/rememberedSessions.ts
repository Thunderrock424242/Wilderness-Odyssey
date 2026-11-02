import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConnectedStore, ServiceError } from './store';
import { rememberRefreshInput } from '../contracts/v1/auth';

type Kind = 'administrator' | 'participant';
type Family = { id: string; user_id: string; name: string; generation: number; expires: number; active: string };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');

/** Durable, role-scoped rotating credentials. Call mutations inside the caller's transaction. */
export class RememberedSessions {
  constructor(private readonly store: ConnectedStore, private readonly kind: Kind, private readonly guild: string) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS cs_remember_flows (digest TEXT PRIMARY KEY, kind TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_remember_families (id TEXT PRIMARY KEY, kind TEXT NOT NULL, guild TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, generation INTEGER NOT NULL, expires INTEGER NOT NULL, active TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_remember_tokens (digest TEXT PRIMARY KEY, family TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_remember_access (digest TEXT PRIMARY KEY, family TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS cs_remember_owner ON cs_remember_families(kind,guild,user_id);
    `);
  }
  rememberFlow(flow: string, remember: boolean) {
    this.store.db.prepare('DELETE FROM cs_remember_flows WHERE expires<=?').run(this.store.clock());
    if (remember) this.store.db.prepare('INSERT INTO cs_remember_flows VALUES (?,?,?)').run(digest(flow), this.kind, this.store.clock() + 300000);
  }
  consumeFlow(flow: string): boolean {
    const row = this.store.db.prepare('DELETE FROM cs_remember_flows WHERE digest=? AND kind=? AND expires>? RETURNING digest').get(digest(flow), this.kind, this.store.clock());
    return !!row;
  }
  issue(user: string, name: string, generation: number, sessionToken: string) {
    const id = randomUUID(), rememberToken = token();
    const expires = this.store.clock() + (this.kind === 'administrator' ? 7 : 30) * 86400000;
    this.store.db.prepare('INSERT INTO cs_remember_families VALUES (?,?,?,?,?,?,?,?)').run(id, this.kind, this.guild, user, name, generation, expires, digest(rememberToken));
    this.link(id, rememberToken, sessionToken);
    return { rememberToken, rememberExpiresAt: new Date(expires).toISOString() };
  }
  lookup(body: unknown): Family {
    const { rememberToken } = rememberRefreshInput.parse(body);
    const row = this.store.db.prepare('SELECT f.* FROM cs_remember_families f JOIN cs_remember_tokens t ON t.family=f.id WHERE t.digest=? AND f.kind=? AND f.guild=?').get(digest(rememberToken), this.kind, this.guild) as Family | undefined;
    if (!row || row.expires <= this.store.clock()) throw new ServiceError(401, 'REMEMBER_EXPIRED', 'Sign in with Discord again.');
    if (row.active !== digest(rememberToken)) throw new ServiceError(409, 'REMEMBER_ROTATED', 'Sign-in was renewed in another tab. Try again.');
    return row;
  }
  rotate(body: unknown, sessionToken: string) {
    const row = this.lookup(body), rememberToken = token();
    this.store.db.prepare('UPDATE cs_remember_families SET active=? WHERE id=?').run(digest(rememberToken), row.id);
    this.link(row.id, rememberToken, sessionToken);
    return { rememberToken, rememberExpiresAt: new Date(row.expires).toISOString() };
  }
  private link(id: string, remembered: string, access: string) {
    this.store.db.prepare('INSERT INTO cs_remember_tokens VALUES (?,?)').run(digest(remembered), id);
    this.store.db.prepare('INSERT INTO cs_remember_access VALUES (?,?)').run(digest(access), id);
  }
  private revokeFamily(id: string) {
    const family = this.store.db.prepare('SELECT id FROM cs_remember_families WHERE id=? AND kind=? AND guild=?').get(id, this.kind, this.guild);
    if (!family) return;
    const table = this.kind === 'administrator' ? 'cs_dashboard_sessions' : 'cs_participant_sessions';
    this.store.db.prepare(`DELETE FROM ${table} WHERE digest IN (SELECT digest FROM cs_remember_access WHERE family=?)`).run(id);
    this.store.db.prepare('DELETE FROM cs_remember_access WHERE family=?').run(id);
    this.store.db.prepare('DELETE FROM cs_remember_tokens WHERE family=?').run(id);
    this.store.db.prepare('DELETE FROM cs_remember_families WHERE id=?').run(id);
  }
  forget(body: unknown) {
    const { rememberToken } = rememberRefreshInput.parse(body);
    const row = this.store.db.prepare('SELECT family FROM cs_remember_tokens WHERE digest=?').get(digest(rememberToken)) as { family: string } | undefined;
    if (row) this.revokeFamily(row.family);
    return { schemaVersion: '1.0' as const, revoked: true as const };
  }
  logout(sessionToken: string) {
    const row = this.store.db.prepare('SELECT family FROM cs_remember_access WHERE digest=?').get(digest(sessionToken)) as { family: string } | undefined;
    if (row) this.revokeFamily(row.family);
  }
  revokeUser(user: string) {
    const rows = this.store.db.prepare('SELECT id FROM cs_remember_families WHERE kind=? AND guild=? AND user_id=?').all(this.kind, this.guild, user) as { id: string }[];
    for (const row of rows) this.revokeFamily(row.id);
  }
}
