import { z } from 'zod';
import { modelsSchema, operationSchema, roleCapabilities } from '../contracts/v1/admin';
import type { Capabilities, RemoteControl, StaffRecheck } from './admin';
import type { ConnectedConfig } from './config';
import { observationSchema } from './contracts';
import { ConnectedStore, ServiceError, type StoredOperation } from './store';
const capabilitiesSchema = z.object({ schema_version: z.literal('1.0'), server_id: z.string(), actions: z.array(z.enum(['ai.pause', 'model.activate', 'inference.settings', 'inference.probe', 'model.unload'])).max(20), models: modelsSchema, ai_requests_revision: z.string().min(1).max(120) });
class RemoteError extends Error { constructor(readonly status: number) { super('Main-server request failed.'); } }
export class MainServerClient implements RemoteControl {
  private cached?: { time: number; value: Capabilities };
  private stopped = false;
  private processing = false;
  private controllers = new Set<AbortController>();
  constructor(readonly config: ConnectedConfig, readonly fetcher: typeof fetch = fetch, readonly recheck?: StaffRecheck) {}
  stop(): void { this.stopped = true; for (const controller of this.controllers) controller.abort(); }
  async health() { return observationSchema.parse(await this.request('/v1/service/health')); }
  async capabilities(): Promise<Capabilities> {
    if (this.cached && Date.now() - this.cached.time < 10000) return this.cached.value;
    try {
      const data = capabilitiesSchema.parse(await this.request('/v1/service/capabilities'));
      if (data.server_id !== this.config.serverId) throw new Error();
      const value = { actions: this.config.writeToken ? data.actions : [], models: data.models, aiRequestsRevision: data.ai_requests_revision };
      this.cached = { time: Date.now(), value };
      return value;
    } catch { throw new ServiceError(503, 'UNAVAILABLE', 'Main-server controls are unavailable.'); }
  }
  private async request(path: string, body?: unknown): Promise<unknown> {
    if (this.stopped || !this.config.mainOrigin || !this.config.readToken || (body && !this.config.writeToken)) throw new ServiceError(503, 'UNAVAILABLE', 'Main-server connection is unavailable.');
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await this.fetcher(new URL(path, this.config.mainOrigin), { method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal, headers: { authorization: 'Bearer ' + (body ? this.config.writeToken : this.config.readToken), accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) { await response.body?.cancel(); throw new RemoteError(response.status); }
      if (!response.body) throw new Error('Missing response.');
      const reader = response.body.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 262144) { await reader.cancel(); throw new Error('Main-server response too large.'); }
          parts.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  async process(store: ConnectedStore): Promise<void> {
    if (this.stopped || this.processing || !this.config.mainOrigin) return;
    this.processing = true;
    try {
      for (const row of store.pendingOperations()) {
        if (this.stopped) break;
        if ((row.nextAt ?? 0) > store.clock()) continue;
        try {
          const split = row.actor.id.lastIndexOf('|');
          const actor = this.recheck ? await this.recheck(row.actor, row.capability) : split > 0 ? store.staff(row.actor.id.slice(0, split), row.actor.id.slice(split + 1)) : null;
          const permitted = actor && roleCapabilities[actor.role].includes(row.capability);
          const expired = Date.parse(row.expiresAt) <= store.clock();
          if (row.operation.state === 'requested' && (!permitted || expired || !this.config.writeToken)) {
            this.finish(store, row, 'cancelled', 'The request expired or permission was withdrawn before dispatch.'); continue;
          }
          let found: unknown;
          try { found = await this.request('/v1/service/operations/' + encodeURIComponent(row.operation.id)); }
          catch (error) { if (!(error instanceof RemoteError && error.status === 404)) throw error; }
          if (this.stopped) return;
          if (found) {
            const operation = operationSchema.parse(found);
            if (operation.id !== row.operation.id || operation.kind !== row.action) throw new Error('Unexpected operation identity.');
            // Upstream diagnostic text can contain paths or credentials. Use a bounded local summary.
            row.operation.state = operation.state;
            row.operation.summary = operation.state === 'succeeded' ? 'Main server confirmed the change.' : operation.state === 'failed' ? 'Main server rejected or could not apply the change.' : operation.state === 'cancelled' ? 'Main server cancelled the request.' : 'Main server is processing the request.';
            row.operation.updatedAt = store.now();
            row.nextAt = store.clock() + 5000;
            store.saveOperation(row);
            this.cached = undefined;
            if (['succeeded', 'failed', 'cancelled'].includes(operation.state)) store.audit(row.actor.id, row.operation.kind, row.operation.id, operation.state);
            continue;
          }
          const current = this.recheck ? await this.recheck(row.actor, row.capability) : split > 0 ? store.staff(row.actor.id.slice(0, split), row.actor.id.slice(split + 1)) : null;
          if (!current || !roleCapabilities[current.role].includes(row.capability) || Date.parse(row.expiresAt) <= store.clock()) { this.finish(store, row, 'cancelled', 'No accepted remote operation was found; the request is no longer authorized.'); continue; }
          const input = row.parameters as Record<string, unknown>;
          const { reason, revision, ...parameters } = input;
          row.operation.state = 'running'; row.operation.summary = 'Waiting for main-server confirmation.'; row.operation.updatedAt = store.now();
          store.saveOperation(row); // Persist dispatch before any network side effect.
          const result = operationSchema.parse(await this.request('/v1/service/operations', { operation_id: row.operation.id, server_id: this.config.serverId, action: row.action, parameters, expected_revision: revision, created_at: row.operation.requestedAt, expires_at: row.expiresAt, actor: actor!.id, reason }));
          if (this.stopped) return;
          if (result.id !== row.operation.id || result.kind !== row.action) throw new Error('Unexpected operation identity.');
          this.finish(store, row, result.state, result.state === 'succeeded' ? 'Main server confirmed the change.' : result.state === 'failed' ? 'Main server could not apply the change.' : 'Waiting for main-server confirmation.');
          this.cached = undefined;
        } catch (error) {
          if (this.stopped) return;
          if (error instanceof ServiceError && [401, 403].includes(error.status)) this.finish(store, row, 'cancelled', 'Permission was withdrawn or the dashboard session expired before dispatch.');
          else if (error instanceof RemoteError && [400, 403, 409, 422].includes(error.status)) this.finish(store, row, 'failed', 'Main server rejected the request. Refresh its state before retrying.');
          else {
            row.attempts = (row.attempts ?? 0) + 1;
            row.nextAt = store.clock() + Math.min(60000, 1000 * 2 ** Math.min(row.attempts, 6));
            store.saveOperation(row);
          }
        }
      }
    } finally { this.processing = false; }
  }
  private finish(store: ConnectedStore, row: StoredOperation, state: StoredOperation['operation']['state'], summary: string): void {
    row.operation = { ...row.operation, state, summary, updatedAt: store.now() };
    row.nextAt = store.clock() + 5000;
    store.saveOperation(row);
    store.audit(row.actor.id, row.operation.kind, row.operation.id, state);
  }
}
