import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ConnectedStore, ServiceError } from './store';
export const identityRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('account_token'), token: z.string().min(32).max(256) }).strict(),
  z.object({ kind: z.literal('official_minecraft'), server_id: z.string().min(1).max(100), minecraft_uuid: z.uuid(), username: z.string().regex(/^[a-zA-Z0-9_]{1,16}$/).optional() }).strict(),
]);
type IdentityRequest = z.infer<typeof identityRequestSchema>;
type Account = { id: string; createdAt: string; redirect?: string };
type Alias = { accountId: string; verifiedAt: string };
type Token = { id: string; label: string; accountId: string; hash: string; createdAt: string; expiresAt: string; revokedAt: string | null };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export class IdentityService {
  constructor(readonly store: ConnectedStore, readonly officialServerId: string) {}
  canonical(id: string): string {
    for (let depth = 0; depth < 100; depth++) {
      const account = this.store.record<Account>('account', id);
      if (!account) throw new ServiceError(401, 'IDENTITY_INVALID', 'Account credential is unavailable.');
      if (!account.redirect) return id;
      id = account.redirect;
    }
    throw new ServiceError(503, 'IDENTITY_UNAVAILABLE', 'Account identity is unavailable.');
  }
  lookup(issuer: string, subject: string): string | null {
    const alias = this.store.record<Alias>('account_alias', digest(issuer + '\n' + subject));
    return alias ? this.canonical(alias.accountId) : null;
  }
  /** Only authenticated transports may call this with their verified subject. */
  account(issuer: string, subject: string): string {
    const old = this.lookup(issuer, subject);
    if (old) return old;
    return this.store.transaction(() => {
      const id = randomUUID();
      this.store.put('account', id, id, { id, createdAt: this.store.now() });
      this.store.put('account_alias', digest(issuer + '\n' + subject), id, { accountId: id, verifiedAt: this.store.now() });
      return id;
    });
  }
  ownsMinecraft(accountId: string, uuid: string): boolean {
    const id = this.lookup('minecraft', uuid.toLowerCase());
    const claim = this.store.record<{ active: boolean }>('minecraft_claim', uuid.toLowerCase());
    return Boolean(claim?.active && id === this.canonical(accountId));
  }
  allowedAccount(accountId: string): boolean {
    return !this.activeRestriction('account_restriction', this.canonical(accountId));
  }
  private activeRestriction(kind: string, owner: string): boolean {
    return Boolean(this.store.db.prepare("SELECT 1 FROM cs_records WHERE kind=? AND owner=? AND json_extract(data,'$.revokedAt') IS NULL AND (json_extract(data,'$.expiresAt') IS NULL OR julianday(json_extract(data,'$.expiresAt'))>julianday(?)) LIMIT 1").get(kind, owner, this.store.now()));
  }
  issue(accountId: string, label: string) {
    accountId = this.canonical(accountId);
    if (!label.trim() || label.length > 80) throw new ServiceError(400, 'INVALID_INPUT', 'Choose a short token label.');
    return this.store.transaction(() => {
      const count = this.store.db.prepare("SELECT count(*) AS total FROM cs_records WHERE kind='token' AND owner=? AND json_extract(data,'$.revokedAt') IS NULL AND julianday(json_extract(data,'$.expiresAt'))>julianday(?)").get(accountId, this.store.now()) as { total: number };
      if (count.total >= 10) throw new ServiceError(422, 'TOKEN_LIMIT', 'Revoke an existing token before creating another.');
      const token = 'woa_' + randomBytes(32).toString('base64url');
      const record: Token = { id: randomUUID(), label: label.trim(), accountId, hash: digest(token), createdAt: this.store.now(), expiresAt: new Date(this.store.clock() + 30 * 86400000).toISOString(), revokedAt: null };
      this.store.put('token', record.id, accountId, record);
      this.store.put('token_hash', record.hash, accountId, { id: record.id });
      this.store.audit(accountId, 'token.issue', record.id, 'succeeded');
      return { id: record.id, label: record.label, createdAt: record.createdAt, expiresAt: record.expiresAt, token };
    });
  }
  tokens(accountId: string) {
    const rows = this.store.db.prepare("SELECT data FROM cs_records WHERE kind='token' AND owner=? ORDER BY (json_extract(data,'$.revokedAt') IS NULL AND julianday(json_extract(data,'$.expiresAt'))>julianday(?)) DESC,rowid DESC LIMIT 100").all(this.canonical(accountId), this.store.now()) as { data: string }[];
    return rows.map(row => JSON.parse(row.data) as Token).map(({ id, label, createdAt, expiresAt, revokedAt }) => ({ id, label, createdAt, expiresAt, revokedAt }));
  }
  revoke(accountId: string, id: string) {
    const token = this.store.record<Token>('token', id);
    if (!token || this.canonical(token.accountId) !== this.canonical(accountId)) throw new ServiceError(404, 'NOT_FOUND', 'Token not found.');
    token.revokedAt ??= this.store.now();
    this.store.put('token', token.id, this.canonical(accountId), token);
    this.store.audit(accountId, 'token.revoke', id, 'succeeded');
    return { id, revokedAt: token.revokedAt };
  }
  authenticate(input: IdentityRequest) {
    const request = identityRequestSchema.parse(input);
    let accountId: string;
    let uuid: string | null = null;
    if (request.kind === 'account_token') {
      const lookup = this.store.record<{ id: string }>('token_hash', digest(request.token));
      const token = lookup && this.store.record<Token>('token', lookup.id);
      if (!token || token.revokedAt || Date.parse(token.expiresAt) <= this.store.clock()) throw new ServiceError(401, 'IDENTITY_INVALID', 'Account credential is invalid or expired.');
      accountId = this.canonical(token.accountId);
    } else {
      if (request.server_id !== this.officialServerId) throw new ServiceError(403, 'SERVER_DENIED', 'Untrusted server identity.');
      uuid = request.minecraft_uuid.toLowerCase();
      accountId = this.account('minecraft', uuid);
      if (request.username) this.store.put('player', uuid, uuid, { uuid, username: request.username, verifiedAt: this.store.now() });
    }
    const global = !this.allowedAccount(accountId);
    const official = uuid !== null && this.activeRestriction('restriction', uuid);
    return { account_id: accountId, minecraft_uuid: uuid, official_server_id: request.kind === 'official_minecraft' ? this.officialServerId : null, allowed: !global && !official, reason: global ? 'account_restricted' : official ? 'official_server_restricted' : null, expires_at: new Date(this.store.clock() + 30000).toISOString() };
  }
  linkMinecraft(accountId: string, uuid: string, username: string): void {
    uuid = z.uuid().parse(uuid).toLowerCase();
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(username)) throw new ServiceError(400, 'INVALID_IDENTITY', 'Minecraft identity is invalid.');
    this.store.transaction(() => this.link(accountId, uuid, username));
  }
  private link(accountId: string, uuid: string, username: string): void {
    accountId = this.canonical(accountId);
    const oldId = this.lookup('minecraft', uuid);
    if (oldId && oldId !== accountId) {
      const old = this.store.record<Account>('account', oldId)!;
      this.store.put('account', oldId, accountId, { ...old, redirect: accountId });
      this.store.db.prepare('UPDATE cs_records SET owner=? WHERE owner=?').run(accountId, oldId);
      this.store.audit(accountId, 'account.link', oldId, 'merged_preserving_restrictions');
    }
    this.store.put('account_alias', digest('minecraft\n' + uuid), accountId, { accountId, verifiedAt: this.store.now() });
    this.store.put('player', uuid, uuid, { uuid, username, verifiedAt: this.store.now() });
    this.store.put('minecraft_claim', uuid, accountId, { active: true });
  }
  unlinkMinecraft(accountId: string, uuid: string): void {
    if (!this.ownsMinecraft(accountId, uuid)) return;
    this.store.put('minecraft_claim', uuid.toLowerCase(), this.canonical(accountId), { active: false });
    // Preserve the minimal verified security association so unlinking cannot erase restrictions.
    this.store.audit(accountId, 'minecraft.unlink', uuid, 'succeeded');
  }
  accountForMinecraft(uuid: string): string {
    const account = this.lookup('minecraft', uuid.toLowerCase());
    if (!account) throw new ServiceError(404, 'NOT_FOUND', 'Verified account not found.');
    return account;
  }
  clearOptionalData(accountId: string): number {
    accountId = this.canonical(accountId);
    for (const row of this.store.db.prepare("SELECT id FROM cs_records WHERE kind='token' AND owner=?").all(accountId) as { id: string }[]) this.revoke(accountId, row.id);
    const result = this.store.db.prepare("DELETE FROM cs_records WHERE owner=? AND kind IN ('report_excerpt','identity_code','account_request')").run(accountId);
    for (const row of this.store.db.prepare("SELECT id FROM cs_records WHERE owner=? AND kind='minecraft_claim'").all(accountId) as { id: string }[]) this.unlinkMinecraft(accountId, row.id);
    return Number(result.changes);
  }
  createLink(accountId: string) {
    accountId = this.canonical(accountId);
    this.store.db.prepare("DELETE FROM cs_records WHERE kind='identity_code' AND owner=?").run(accountId);
    const code = randomBytes(8).toString('hex').toUpperCase();
    const expiresAt = new Date(this.store.clock() + 900000).toISOString();
    this.store.put('identity_code', digest(code), accountId, { accountId, expiresAt, used: false });
    return { code, expiresAt };
  }
  completeLink(code: string, uuid: string, username: string): boolean {
    const key = digest(code.trim().toUpperCase());
    const row = this.store.record<{ accountId: string; expiresAt: string; used: boolean }>('identity_code', key);
    if (!row || row.used || Date.parse(row.expiresAt) <= this.store.clock()) return false;
    uuid = z.uuid().parse(uuid).toLowerCase();
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(username)) throw new ServiceError(400, 'INVALID_IDENTITY', 'Minecraft identity is invalid.');
    this.store.transaction(() => {
      this.link(row.accountId, uuid, username);
      this.store.put('identity_code', key, this.canonical(row.accountId), { ...row, used: true });
    });
    return true;
  }
}

