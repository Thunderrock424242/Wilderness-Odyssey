import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { roleCapabilities, type Capability, type Operation } from '../contracts/v1/admin';

export type Role = 'viewer' | 'moderator' | 'administrator';
export type Actor = { id: string; role: Role; displayName?: string; issuer?: string; subject?: string; guildId?: string; sessionDigest?: string };
export class ServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function authorize(actor: Actor, capability: Capability): void {
  if (!roleCapabilities[actor.role]?.includes(capability)) throw new ServiceError(403, 'FORBIDDEN', 'This action is not permitted.');
}
export interface StoredOperation {
  operation: Operation; actor: Actor; capability: Capability; action?: string; parameters?: unknown; expiresAt: string; attempts?: number; nextAt?: number;
}
export interface OutboxItem { id: string; audience: 'staff' | 'public'; message: string; attempts: number; next_at: number; message_id: string | null }
type RecordRow = { id: string; owner: string; data: string };

/** One connection, atomic decisions, and durable transport state. No network calls in transactions. */
export class ConnectedStore {
  private depth = 0;
  constructor(readonly db: DatabaseSync, readonly clock: () => number = Date.now) {
    this.transaction(() => db.exec(`
      CREATE TABLE IF NOT EXISTS cs_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_values (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_staff (issuer TEXT NOT NULL, subject TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('viewer','moderator','administrator')), display_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(issuer,subject));
      CREATE TABLE IF NOT EXISTS cs_records (kind TEXT NOT NULL, id TEXT NOT NULL, owner TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS cs_records_owner ON cs_records(kind,owner);
      CREATE TABLE IF NOT EXISTS cs_operations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_idempotency (actor TEXT NOT NULL, action TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL, operation_id TEXT NOT NULL REFERENCES cs_operations(id), created_at INTEGER NOT NULL, PRIMARY KEY(actor,action,key));
      CREATE TABLE IF NOT EXISTS cs_audit (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_outbox (id TEXT PRIMARY KEY, audience TEXT NOT NULL, message TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, message_id TEXT);
      INSERT OR IGNORE INTO cs_migrations VALUES (1, datetime('now'));
    `));
  }
  now(): string { return new Date(this.clock()).toISOString(); }
  transaction<T>(work: () => T): T {
    const depth = this.depth++;
    const savepoint = 'cs_' + depth;
    try {
      this.db.exec(depth ? 'SAVEPOINT ' + savepoint : 'BEGIN IMMEDIATE');
      try {
        const result = work();
        this.db.exec(depth ? 'RELEASE ' + savepoint : 'COMMIT');
        return result;
      } catch (error) {
        this.db.exec(depth ? 'ROLLBACK TO ' + savepoint : 'ROLLBACK');
        if (depth) this.db.exec('RELEASE ' + savepoint);
        throw error;
      }
    } finally { this.depth--; }
  }
  get<T = unknown>(key: string): T | null {
    const row = this.db.prepare('SELECT data FROM cs_values WHERE key=?').get(key) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as T : null;
  }
  set(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO cs_values VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key, JSON.stringify(value));
  }
  staff(issuer: string, subject: string): Actor | null {
    const row = this.db.prepare('SELECT role,display_name FROM cs_staff WHERE issuer=? AND subject=? AND active=1').get(issuer, subject) as { role: Role; display_name: string } | undefined;
    return row ? { id: issuer + '|' + subject, issuer, subject, role: row.role, displayName: row.display_name } : null;
  }
  assign(issuer: string, subject: string, role: Role, displayName: string, operator: string): void {
    this.transaction(() => {
      this.db.prepare('INSERT INTO cs_staff VALUES (?,?,?,?,1) ON CONFLICT(issuer,subject) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,active=1').run(issuer, subject, role, displayName);
      this.audit(operator, 'staff.assign', issuer + '|' + subject, role);
    });
  }
  audit(actor: string, action: string, resource: string, outcome: string): void {
    this.db.prepare('INSERT INTO cs_audit(actor,action,resource,outcome,created_at) VALUES (?,?,?,?,?)').run(actor, action, resource.slice(0, 200), outcome.slice(0, 100), this.now());
  }
  record<T>(kind: string, id: string): T | null {
    const row = this.db.prepare('SELECT data FROM cs_records WHERE kind=? AND id=?').get(kind, id) as RecordRow | undefined;
    return row ? JSON.parse(row.data) as T : null;
  }
  records<T>(kind: string, owner?: string, limit = 100): T[] {
    const rows = (owner === undefined
      ? this.db.prepare('SELECT data FROM cs_records WHERE kind=? ORDER BY rowid DESC LIMIT ?').all(kind, limit)
      : this.db.prepare('SELECT data FROM cs_records WHERE kind=? AND owner=? ORDER BY rowid DESC LIMIT ?').all(kind, owner, limit)) as RecordRow[];
    return rows.map(row => JSON.parse(row.data) as T);
  }
  put(kind: string, id: string, owner: string, data: unknown): void {
    this.db.prepare('INSERT INTO cs_records VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET owner=excluded.owner,data=excluded.data').run(kind, id, owner, JSON.stringify(data));
  }
  mutate(actor: Actor, action: string, key: string, payload: unknown, capability: Capability, change: () => void, remote?: { action: string; parameters: unknown }): Operation {
    authorize(actor, capability);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new ServiceError(400, 'IDEMPOTENCY_REQUIRED', 'A request identifier is required.');
    const hash = createHash('sha256').update(canonical(payload)).digest('hex');
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT hash,operation_id FROM cs_idempotency WHERE actor=? AND action=? AND key=?').get(actor.id, action, key) as { hash: string; operation_id: string } | undefined;
      if (existing) {
        if (existing.hash !== hash) throw new ServiceError(409, 'CONFLICT', 'Request identifier conflict.');
        return this.operation(existing.operation_id, actor);
      }
      change();
      const operation: Operation = { id: randomUUID(), kind: action.slice(0, 80), state: remote ? 'requested' : 'succeeded', summary: remote ? 'Waiting for the main server.' : 'Change recorded.', requestedAt: this.now(), updatedAt: this.now() };
      const stored: StoredOperation = { operation, actor, capability, action: remote?.action, parameters: remote?.parameters, expiresAt: new Date(this.clock() + 300_000).toISOString() };
      this.saveOperation(stored);
      this.db.prepare('INSERT INTO cs_idempotency VALUES (?,?,?,?,?,?)').run(actor.id, action, key, hash, operation.id, this.clock());
      this.audit(actor.id, action, operation.id, operation.state);
      return operation;
    });
  }
  saveOperation(stored: StoredOperation): void {
    this.db.prepare('INSERT INTO cs_operations VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(stored.operation.id, JSON.stringify(stored));
  }
  storedOperation(id: string): StoredOperation | null {
    const row = this.db.prepare('SELECT data FROM cs_operations WHERE id=?').get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as StoredOperation : null;
  }
  operation(id: string, actor: Actor): Operation {
    const row = this.storedOperation(id);
    if (!row || !roleCapabilities[actor.role].includes(row.capability)) throw new ServiceError(404, 'NOT_FOUND', 'Operation not found.');
    return row.operation;
  }
  operations(actor: Actor): Operation[] {
    return this.operationRows().filter(row => roleCapabilities[actor.role].includes(row.capability)).map(row => row.operation).slice(0, 50);
  }
  pendingOperations(): StoredOperation[] {
    return (this.db.prepare("SELECT data FROM cs_operations WHERE json_extract(data,'$.operation.state') IN ('requested','approved','running') AND COALESCE(json_extract(data,'$.nextAt'),0)<=? ORDER BY rowid LIMIT 2").all(this.clock()) as { data: string }[]).map(row => JSON.parse(row.data) as StoredOperation);
  }
  operationRows(): StoredOperation[] {
    return (this.db.prepare('SELECT data FROM cs_operations ORDER BY rowid DESC LIMIT 500').all() as { data: string }[]).map(row => JSON.parse(row.data) as StoredOperation);
  }
  enqueue(id: string, audience: 'staff' | 'public', message: string): void {
    this.db.prepare('INSERT OR IGNORE INTO cs_outbox(id,audience,message) VALUES (?,?,?)').run(id + ':' + audience, audience, message.slice(0, 1500));
  }
  outbox(): OutboxItem[] {
    return this.db.prepare('SELECT * FROM cs_outbox WHERE message_id IS NULL AND next_at<=? ORDER BY rowid LIMIT 50').all(this.clock()) as unknown as OutboxItem[];
  }
  delivered(id: string, messageId: string): void { this.db.prepare('UPDATE cs_outbox SET message_id=? WHERE id=?').run(messageId, id); }
  retry(item: OutboxItem): void {
    this.db.prepare('UPDATE cs_outbox SET attempts=attempts+1,next_at=? WHERE id=?').run(this.clock() + Math.min(3_600_000, 5000 * 2 ** Math.min(item.attempts, 10)), item.id);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
