import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as s from '../contracts/v1/admin';
import { adminRoutes } from '../contracts/v1/routes';
import { ConnectedStore, authorize, ServiceError, type Actor } from './store';
import { ServiceMonitor, type Maintenance } from './monitor';
import { ModerationService } from './moderation';
export type Capabilities = { actions: string[]; models: z.infer<typeof s.modelsSchema>; aiRequestsRevision: string };
export interface RemoteControl { capabilities(): Promise<Capabilities> }
export type StaffRecheck = (actor: Actor, capability: s.Capability) => Promise<Actor>;
type Revisioned = { id: string; revision: string; revokedAt?: string | null; state?: string };
function changed(expected: string, actual: string): void { if (expected !== actual) throw new ServiceError(409, 'REVISION_CONFLICT', 'This record changed. Refresh it before trying again.'); }
export class AdminService {
  constructor(readonly store: ConnectedStore, readonly monitor: ServiceMonitor, readonly moderation: ModerationService, readonly remote?: RemoteControl, readonly recheck?: StaffRecheck) {}
  async handle(actor: Actor, method: string, path: string, body: unknown, query: unknown = {}, key = ''): Promise<unknown> {
    if (this.recheck) actor = await this.recheck(actor, 'status:read');
    const accountLookup = /^\/players\/([0-9a-fA-F-]{36})\/account$/.exec(path);
    if (method === 'GET' && accountLookup) {
      authorize(actor, 'players:read');
      z.object({}).strict().parse(query);
      const player = this.moderation.player(accountLookup[1]!);
      const id = this.moderation.identity.accountForMinecraft(player.uuid);
      this.store.audit(actor.id, 'account.read', id, 'succeeded');
      return { schemaVersion: '1.0', account: { id, restrictions: this.store.records('account_restriction', id, 50).map(row => s.restrictionSchema.parse(row)) } };
    }
    const standaloneAccount = /^\/accounts\/([0-9a-fA-F-]{36})$/.exec(path);
    if (method === 'GET' && standaloneAccount) {
      authorize(actor, 'players:read');
      z.object({}).strict().parse(query);
      const id = this.moderation.identity.canonical(z.uuid().parse(standaloneAccount[1]));
      this.store.audit(actor.id, 'account.read', id, 'succeeded');
      return { schemaVersion: '1.0', account: { id, restrictions: this.store.records('account_restriction', id, 50).map(row => s.restrictionSchema.parse(row)) } };
    }
    const accountRoute = /^\/accounts\/([a-zA-Z0-9_-]{1,96})\/restrictions(?:\/([a-zA-Z0-9_-]{1,96})\/revoke)?$/.exec(path);
    if (accountRoute && method === 'POST') return this.accountRestriction(actor, accountRoute[1]!, accountRoute[2], body, key);
    const route = adminRoutes.find(item => item.method === method && item.pattern.test(path));
    if (!route) throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
    if (route.capability) authorize(actor, route.capability);
    const input = route.input?.parse(body);
    const parsedQuery = route.query ? route.query.parse(query) : z.object({}).strict().parse(query);
    const segments = path.split('/').filter(Boolean);
    let result: unknown;
    if (path === '/session') result = { schemaVersion: '1.0', user: { id: (actor.subject ?? actor.id).slice(0, 200), displayName: (actor.displayName ?? 'Staff member').slice(0, 100), role: actor.role }, capabilities: s.roleCapabilities[actor.role] };
    else if (path === '/overview') {
      const capabilities = await this.remote?.capabilities().catch(() => null);
      actor = await this.currentActor(actor, 'status:read');
      result = { schemaVersion: '1.0', status: this.monitor.legacyStatus(), maintenanceRevision: this.monitor.maintenance().revision, aiRequestsRevision: capabilities?.aiRequestsRevision ?? 'unavailable', performance: this.store.get('performance') ?? [], operations: this.store.operations(actor), allowedServiceOperations: (capabilities?.actions ?? []).filter(action => ['inference.probe', 'model.unload'].includes(action)).map(id => ({ id, label: id === 'inference.probe' ? 'Check inference' : 'Unload active model', description: id === 'inference.probe' ? 'Run a bounded inference health check.' : 'Release the approved active model from memory.' })) };
    } else if (path === '/incidents') result = { schemaVersion: '1.0', incidents: this.monitor.legacyStatus().incidents.map(item => ({ ...item, internalNote: null })) };
    else if (path === '/maintenance') {
      const data = s.maintenanceInput.parse(input);
      result = this.mutation(this.store.mutate(actor, path, key, data, 'server:write', () => {
        changed(data.revision, this.monitor.maintenance().revision);
        if (data.active && (!data.services.length || !data.message.trim())) throw new ServiceError(400, 'INVALID_INPUT', 'Select services and enter a maintenance message.');
        if (data.startsAt && data.endsAt && Date.parse(data.startsAt) >= Date.parse(data.endsAt)) throw new ServiceError(400, 'INVALID_INPUT', 'Maintenance end must be after its start.');
        const maintenance: Maintenance = { active: data.active, services: [...new Set(data.services)], message: data.message, startsAt: data.startsAt, endsAt: data.endsAt, revision: randomUUID() };
        this.store.set('maintenance', maintenance);
        this.history(actor, 'maintenance_history', maintenance.revision, 'maintenance.update', data.reason);
        this.store.enqueue(maintenance.revision, 'staff', data.active ? 'Maintenance scheduled: ' + data.message : 'Maintenance ended.');
      }));
    } else if (path === '/ai-requests' || path === '/model-changes' || path === '/inference-settings' || path === '/service-operations') {
      result = await this.remoteMutation(actor, path, input, key);
    } else if (segments[0] === 'operations') result = this.mutation(this.store.operation(segments[1]!, actor));
    else if (path === '/models') {
      if (!this.remote) throw new ServiceError(503, 'UNAVAILABLE', 'Main-server controls are unavailable.');
      result = (await this.remote.capabilities()).models;
      actor = await this.currentActor(actor, 'models:read');
    } else if (path === '/players') {
      const q = parsedQuery as { q: string; cursor?: string };
      const escaped = q.q.toLowerCase().replace(/[\\%_]/g, value => '\\' + value);
      const offset = this.cursor(q.cursor);
      const rows = this.store.db.prepare("SELECT data FROM cs_records WHERE kind='player' AND (lower(json_extract(data,'$.username')) LIKE ? ESCAPE '\' OR id=?) ORDER BY id LIMIT 51 OFFSET ?").all('%' + escaped + '%', q.q.toLowerCase(), offset) as { data: string }[];
      result = { schemaVersion: '1.0', players: rows.slice(0, 50).map(row => JSON.parse(row.data)), nextCursor: rows.length > 50 ? String(offset + 50) : null };
    } else if (segments[0] === 'players') result = this.playerAction(actor, method, segments, input, key);
    else if (path === '/reports') {
      const offset = this.cursor((parsedQuery as { cursor?: string }).cursor);
      const rows = this.store.db.prepare("SELECT data FROM cs_records WHERE kind='report' ORDER BY rowid DESC LIMIT 51 OFFSET ?").all(offset) as { data: string }[];
      result = { schemaVersion: '1.0', reports: rows.slice(0, 50).map(row => JSON.parse(row.data)), nextCursor: rows.length > 50 ? String(offset + 50) : null };
    } else if (segments[0] === 'reports') {
      const detail = this.moderation.detail(segments[1]!);
      if (method === 'GET') { this.store.audit(actor.id, 'report.read', segments[1]!, 'succeeded'); result = detail; }
      else {
        const data = s.reportInput.parse(input);
        result = this.mutation(this.store.mutate(actor, path, key, data, 'reports:write', () => {
          const current = this.moderation.detail(segments[1]!).report;
          changed(data.revision, current.revision);
          const record = this.store.record<Record<string, unknown>>('report', current.id)!;
          const owner = String(record.accountId);
          this.store.put('report', current.id, owner, { ...record, state: data.decision, revision: randomUUID() });
          this.history(actor, 'report_history', current.id, 'report.' + data.decision, data.reason);
        }));
      }
    }
    return route.output.parse(result);
  }
  private async currentActor(actor: Actor, capability: s.Capability): Promise<Actor> {
    if (this.recheck) return this.recheck(actor, capability);
    const current = actor.issuer && actor.subject ? this.store.staff(actor.issuer, actor.subject) : null;
    if (!current) throw new ServiceError(403, 'FORBIDDEN', 'This action is not permitted.');
    authorize(current, capability);
    return current;
  }
  private cursor(input?: string): number {
    if (input === undefined) return 0;
    if (!/^\d{1,7}$/.test(input)) throw new ServiceError(400, 'INVALID_CURSOR', 'Invalid page cursor.');
    return Number(input);
  }
  private mutation(operation: s.Operation) { return { schemaVersion: '1.0' as const, operation }; }
  private history(actor: Actor, kind: string, owner: string, action: string, reason: string) {
    const id = randomUUID();
    this.store.put(kind, id, owner, { id, action, reason, createdAt: this.store.now(), moderator: (actor.displayName ?? actor.id).slice(0, 100), actorId: actor.id });
  }
  private playerAction(actor: Actor, method: string, segments: string[], input: unknown, key: string) {
    const player = this.moderation.player(segments[1]!);
    const path = '/' + segments.join('/');
    if (method === 'GET') {
      this.store.audit(actor.id, 'player.read', player.uuid, 'succeeded');
      return { schemaVersion: '1.0', player, history: this.store.records('history', player.uuid, 100), restrictions: this.store.records('restriction', player.uuid, 50), appeals: this.store.records('appeal', player.uuid, 50) };
    }
    return this.mutation(this.store.mutate(actor, path, key, input, 'players:write', () => {
      if (segments[2] === 'warnings') { this.history(actor, 'history', player.uuid, 'warning', s.warningInput.parse(input).reason); return; }
      if (segments[2] === 'restrictions') {
        this.restriction(actor, 'restriction', player.uuid, segments[3], input);
        return;
      }
      const data = s.appealInput.parse(input);
      const appeal = this.owned<Revisioned>('appeal', player.uuid, segments[3]!);
      const authors = (appeal as Revisioned & { decisionAuthors?: string[] }).decisionAuthors ?? [];
      if (authors.includes(actor.id)) throw new ServiceError(403, 'INDEPENDENT_REVIEW_REQUIRED', 'Another staff member must review an appeal of your decision.');
      changed(data.revision, appeal.revision);
      this.store.put('appeal', appeal.id, player.uuid, { ...appeal, state: data.decision, revision: randomUUID() });
      // Accepting an appeal does not implicitly lift any restriction; revocation is separately audited.
      this.history(actor, 'history', player.uuid, 'appeal.' + data.decision, data.reason);
    }));
  }
  private owned<T>(kind: string, owner: string, id: string): T {
    const row = this.store.db.prepare('SELECT data FROM cs_records WHERE kind=? AND owner=? AND id=?').get(kind, owner, id) as { data: string } | undefined;
    if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Record not found.');
    return JSON.parse(row.data) as T;
  }
  private accountRestriction(actor: Actor, id: string, restrictionId: string | undefined, input: unknown, key: string) {
    authorize(actor, 'players:write');
    const accountId = this.moderation.identity.canonical(id);
    const data = restrictionId ? s.revokeInput.parse(input) : s.restrictionInput.parse(input);
    return this.mutation(this.store.mutate(actor, '/accounts/' + accountId + '/restrictions/' + (restrictionId ?? ''), key, data, 'players:write', () => this.restriction(actor, 'account_restriction', accountId, restrictionId, data)));
  }
  private restriction(actor: Actor, kind: string, owner: string, id: string | undefined, input: unknown) {
    if (id) {
      const data = s.revokeInput.parse(input);
      const current = this.owned<Revisioned>(kind, owner, id);
      changed(data.revision, current.revision);
      this.store.put(kind, id, owner, { ...current, revokedAt: this.store.now(), revision: randomUUID() });
      this.history(actor, 'history', owner, kind + '.revoke', data.reason);
    } else {
      const data = s.restrictionInput.parse(input);
      const duration = Date.parse(data.expiresAt) - this.store.clock();
      if (duration <= 0 || duration > 30 * 86400000) throw new ServiceError(400, 'INVALID_INPUT', 'Restriction duration must be between now and 30 days.');
      const id = randomUUID();
      this.store.put(kind, id, owner, { id, createdBy: actor.id, scope: data.scope, reason: data.reason, expiresAt: new Date(data.expiresAt).toISOString(), revokedAt: null, revision: randomUUID() });
      this.history(actor, 'history', owner, kind + '.create', data.reason);
    }
  }
  private async remoteMutation(actor: Actor, path: string, input: unknown, key: string) {
    if (!this.remote) throw new ServiceError(503, 'UNAVAILABLE', 'Main-server controls are unavailable.');
    const capabilities = await this.remote.capabilities();
    let action: string, capability: s.Capability = 'server:write';
    let parameters: Record<string, unknown>;
    if (path === '/ai-requests') { action = 'ai.pause'; parameters = s.aiRequestsInput.parse(input); }
    else if (path === '/model-changes') {
      action = 'model.activate'; capability = 'models:write'; parameters = s.modelInput.parse(input);
      if (!capabilities.models.models.some(model => model.id === parameters.modelId && model.approved)) throw new ServiceError(422, 'MODEL_DENIED', 'Choose a model approved by the main server.');
    } else if (path === '/inference-settings') { action = 'inference.settings'; capability = 'models:write'; parameters = s.settingsInput.parse(input); }
    else { const data = s.serviceInput.parse(input); action = data.operationId; parameters = { reason: data.reason }; if (!['inference.probe', 'model.unload'].includes(action)) throw new ServiceError(422, 'UNSUPPORTED', 'This operation is not supported.'); }
    actor = await this.currentActor(actor, capability);
    if (!capabilities.actions.includes(action)) throw new ServiceError(503, 'UNAVAILABLE', 'This operation is not available on the main server.');
    return this.mutation(this.store.mutate(actor, path, key, input, capability, () => {
      if (typeof parameters.revision === 'string') changed(parameters.revision, action === 'ai.pause' ? capabilities.aiRequestsRevision : capabilities.models.revision);
    }, { action, parameters }));
  }
}


