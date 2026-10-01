import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { AccessAuthenticator, bearer, secretMatches } from './auth';
import type { ConnectedConfig } from './config';
import { ConnectedStore, ServiceError } from './store';
import { identityRequestSchema, IdentityService } from './identity';
import { ServiceMonitor } from './monitor';
import { ModerationService } from './moderation';
import { AdminService } from './admin';
const idempotency = z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/);
export async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type'] ?? '')) throw new ServiceError(415, 'JSON_REQUIRED', 'Send a JSON request.');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 65536) throw new ServiceError(413, 'TOO_LARGE', 'Request is too large.');
    chunks.push(part);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new ServiceError(400, 'INVALID_JSON', 'Invalid JSON request.'); }
}
export function json(response: ServerResponse, status: number, value: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  response.end(JSON.stringify(value));
}
export class ConnectedHttp {
  readonly staffAuth: AccessAuthenticator;
  readonly accountAuth: AccessAuthenticator;
  private readonly buckets = new Map<string, { start: number; count: number }>();
  constructor(readonly config: ConnectedConfig, readonly store: ConnectedStore, readonly monitor: ServiceMonitor, readonly identity: IdentityService, readonly moderation: ModerationService, readonly admin: AdminService) {
    this.staffAuth = new AccessAuthenticator(store, config.trust);
    this.accountAuth = new AccessAuthenticator(store, { ...config.trust, staffAudience: config.accountAudience ?? '' });
  }
  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const raw = request.url ?? '';
    if (!raw.startsWith('/v1/') && !raw.startsWith('/v2/') && !raw.startsWith('/api/public/')) return false;
    if (!this.config.enabled) { json(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } }); return true; }
    try {
      this.rate('ip:' + (request.socket.remoteAddress ?? 'unknown'), 1200);
      const duplicate = new Set<string>();
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        const name = request.rawHeaders[i]!.toLowerCase();
        if (!['authorization', 'cf-access-jwt-assertion', 'x-wo-user-assertion', 'x-wo-environment', 'idempotency-key'].includes(name)) continue;
        if (duplicate.has(name)) throw new ServiceError(400, 'INVALID_HEADERS', 'Duplicate authentication header.');
        duplicate.add(name);
      }
      const url = new URL(raw, 'http://localhost');
      if (url.pathname !== raw.split('?')[0] || url.hash) throw new ServiceError(400, 'INVALID_PATH', 'Invalid request path.');
      const path = url.pathname, method = request.method ?? '';
      if ((path === '/api/public/v2/status' || path === '/v2/public/status') && method === 'GET') { json(response, 200, this.monitor.publicStatus()); return true; }
      if ((path === '/api/public/v1/status' || path === '/v1/public/status') && method === 'GET') { json(response, 200, this.monitor.legacyStatus()); return true; }
      if (path.startsWith('/v1/service/')) {
        if (method !== 'POST' || url.search) throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
        const token = path === '/v1/service/authenticate' ? this.config.identityToken : this.config.ingestToken;
        if (!secretMatches(bearer(request.headers), token)) throw new ServiceError(401, 'UNAUTHORIZED', 'Service authentication required.');
        const body = await readJson(request);
        if (path === '/v1/service/authenticate') json(response, 200, this.identity.authenticate(identityRequestSchema.parse(body)));
        else if (path === '/v1/service/observations') { this.monitor.accept(body); json(response, 200, { accepted: true }); }
        else if (path === '/v1/service/minecraft-link') {
          const data = z.object({ code: z.string().min(6).max(32), minecraft_uuid: z.uuid(), username: z.string().regex(/^[a-zA-Z0-9_]{1,16}$/) }).strict().parse(body);
          if (!this.identity.completeLink(data.code, data.minecraft_uuid, data.username)) throw new ServiceError(409, 'LINK_INVALID', 'Link code is invalid, expired, or already used.');
          json(response, 200, { linked: true });
        } else throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
        return true;
      }
      if (path.startsWith('/v1/admin/')) {
        if (!this.config.adminEnabled) throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
        const { actor, subject } = await this.staffAuth.authenticate(request.headers);
        this.rate('staff:' + actor.id, 120);
        const query: Record<string, string> = {};
        for (const [key, value] of url.searchParams) { if (key in query) throw new ServiceError(400, 'INVALID_QUERY', 'Duplicate query parameter.'); query[key] = value; }
        const body = ['POST', 'PUT'].includes(method) ? await readJson(request) : undefined;
        const key = typeof request.headers['idempotency-key'] === 'string' ? request.headers['idempotency-key'] : '';
        // Uploads can outlive a role assignment. Resolve current authority after the last await.
        const currentActor = this.store.staff(this.staffAuth.trust.issuer, subject);
        if (!currentActor) {
          this.store.audit(actor.id, 'admin.denied', path, 'assignment_revoked');
          throw new ServiceError(403, 'FORBIDDEN', 'No active staff permission assignment.');
        }
        let result: unknown;
        try { result = await this.admin.handle(currentActor, method, path.slice('/v1/admin'.length), body, query, key); }
        catch (error) {
          if (error instanceof ServiceError && error.status === 403) this.store.audit(actor.id, 'admin.denied', path, 'forbidden');
          throw error;
        }
        json(response, 200, result);
        return true;
      }
      if (path.startsWith('/v1/account/')) {
        if (!this.config.accountAudience) throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
        if (url.search) throw new ServiceError(400, 'INVALID_QUERY', 'Query parameters are not supported.');
        const verified = await this.accountAuth.identity(request.headers);
        const account = this.identity.account(verified.issuer, verified.subject);
        this.rate('account:' + account, 60);
        let result: unknown;
        if (method === 'GET' && path === '/v1/account/session') result = { schemaVersion: '1.0', user: { id: verified.subject, accountId: account, displayName: 'Aether user' } };
        else if (method === 'GET' && path === '/v1/account/tokens') result = { tokens: this.identity.tokens(account) };
        else if (method === 'POST') {
          const key = idempotency.parse(request.headers['idempotency-key']);
          const body = await readJson(request);
          const hash = createHash('sha256').update(account + '\n' + path + '\n' + key).digest('hex');
          if (path === '/v1/account/tokens') {
            const input = z.object({ label: z.string().trim().min(1).max(80) }).strict().parse(body);
            result = this.store.transaction(() => {
              if (this.store.record('account_request', hash)) throw new ServiceError(409, 'TOKEN_ALREADY_ISSUED', 'This request already issued a token. List and revoke it if needed, then create a new token.');
              const issued = this.identity.issue(account, input.label);
              this.store.put('account_request', hash, account, { createdAt: this.store.now() });
              return issued;
            });
          } else if (/^\/v1\/account\/tokens\/[a-zA-Z0-9_-]{1,96}\/revoke$/.test(path)) {
            z.object({}).strict().parse(body);
            result = this.identity.revoke(account, path.split('/')[4]!);
          } else if (path === '/v1/account/minecraft-link') {
            z.object({}).strict().parse(body);
            result = this.store.transaction(() => {
              const old = this.store.record<{ result: unknown }>('account_request', hash);
              if (old) return old.result;
              const result = this.identity.createLink(account);
              this.store.put('account_request', hash, account, { result, createdAt: this.store.now() });
              return result;
            });
          } else throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
        } else throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
        json(response, 200, result);
        return true;
      }
      throw new ServiceError(404, 'NOT_FOUND', 'Route not found.');
    } catch (error) {
      const safe = error instanceof ServiceError ? error : error instanceof z.ZodError ? new ServiceError(400, 'INVALID_INPUT', 'Invalid request data.') : new ServiceError(503, 'UNAVAILABLE', 'This service is temporarily unavailable.');
      // No submitted content, assertions, credentials, or upstream errors enter logs or responses.
      json(response, safe.status, { error: { code: safe.code, message: safe.message } });
      return true;
    }
  }
  private rate(key: string, limit: number): void {
    const now = this.store.clock();
    if (this.buckets.size > 4096) for (const [id, value] of this.buckets) if (now - value.start >= 60000) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.start >= 60000) { if (this.buckets.size >= 8192) throw new ServiceError(429, 'RATE_LIMITED', 'Please try again shortly.'); bucket = { start: now, count: 0 }; this.buckets.set(key, bucket); }
    if (++bucket.count > limit) throw new ServiceError(429, 'RATE_LIMITED', 'Please try again shortly.');
  }
}



