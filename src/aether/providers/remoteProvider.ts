import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { chatRequestSchema, chatResponseSchema } from '../../contracts/v1/aether-chat';
import { AetherRateLimiter } from '../rateLimiter';
import type { AetherContext, AetherRequest } from '../types';
import type { AetherRemoteConfig } from './remoteConfig';
import type { AetherModelProvider } from './types';

export class InferenceFailure extends Error {
  constructor(readonly category: 'busy' | 'timeout' | 'unavailable') {
    super(category === 'busy' ? 'Aether inference is busy. Try again shortly.'
      : category === 'timeout' ? 'Aether inference timed out. Try again shortly.'
        : 'Hosted Aether inference is unavailable. No model answer was generated.');
  }
}

/** Inference-only transport. Never imports the administration client or retries generation. */
export class RemoteModelProvider implements AetherModelProvider {
  private readonly pending = new Set<AbortController>();
  private readonly guildLimit: AetherRateLimiter;
  private readonly globalLimit: AetherRateLimiter;
  private verifiedAt?: number;
  private statusCheckedAt?: number;
  private statusRefresh?: Promise<void>;
  private closed = false;
  private active = 0;
  constructor(
    private readonly config: AetherRemoteConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
    private readonly onFailure?: (requestId: string, category: string) => void,
  ) {
    this.guildLimit = new AetherRateLimiter(config.guildRequests, 60000, clock);
    this.globalLimit = new AetherRateLimiter(config.globalRequests, 60000, clock);
  }
  getProviderName(): string { return 'remote-qwen'; }
  isAvailable(): boolean {
    return !this.closed && this.verifiedAt !== undefined && this.clock() - this.verifiedAt < 30000;
  }
  async refreshAvailability(): Promise<void> {
    if (this.closed) return;
    if (this.statusRefresh) return this.statusRefresh;
    if (this.statusCheckedAt !== undefined && this.clock() - this.statusCheckedAt < 5000) return;
    this.statusRefresh = this.checkAvailability().finally(() => {
      this.statusCheckedAt = this.clock(); this.statusRefresh = undefined;
    });
    return this.statusRefresh;
  }
  private async checkAvailability(): Promise<void> {
    try {
      const result = z.strictObject({schemaVersion: z.literal('1.0'), serverId: z.string().max(64), model: z.string().max(120), available: z.boolean()})
        .parse(await this.request('/v1/aether/chat/status', undefined, 3000));
      if (result.serverId !== this.config.serverId || result.model !== this.config.model) throw new InferenceFailure('unavailable');
      this.verifiedAt = result.available ? this.clock() : undefined;
    } catch { this.verifiedAt = undefined; }
  }
  async generateResponse(request: AetherRequest, _context: AetherContext): Promise<string> {
    if (this.closed || request.sourcePlatform === 'internal') throw new InferenceFailure('unavailable');
    const opaque = (parts: string[]) => createHmac('sha256', this.config.token).update(JSON.stringify(parts)).digest('hex');
    const principalId = opaque([request.sourcePlatform, request.userIdentity.platformUserId]);
    const body = chatRequestSchema.parse({
      schemaVersion: '1.0',
      // The existing bot bridge accepts opaque request IDs. Keep its outward ID;
      // use a fresh UUID only for this single, non-retried gateway transaction.
      requestId: z.uuid().safeParse(request.requestId).success ? request.requestId : randomUUID(),
      serverId: this.config.serverId,
      surface: request.sourcePlatform, principalId,
      scopeId: opaque([request.sourcePlatform, request.userIdentity.platformUserId, request.guildOrServerId ?? 'direct']),
      message: request.message,
    });
    if (this.active >= this.config.concurrency
      || !this.globalLimit.consume('global').allowed
      || !this.guildLimit.consume(`${request.sourcePlatform}:${request.guildOrServerId ?? principalId}`).allowed) {
      throw new InferenceFailure('busy');
    }
    this.active++;
    try {
      const reply = chatResponseSchema.parse(await this.request('/v1/aether/chat', body, this.config.timeoutMs));
      if (reply.requestId !== body.requestId || reply.serverId !== this.config.serverId || reply.model !== this.config.model) {
        throw new InferenceFailure('unavailable');
      }
      this.verifiedAt = this.clock();
      return reply.response;
    } catch (failure) {
      this.verifiedAt = undefined;
      const error = failure instanceof InferenceFailure ? failure : new InferenceFailure('unavailable');
      this.onFailure?.(body.requestId, error.category);
      throw error;
    } finally { this.active--; }
  }
  private async request(path: '/v1/aether/chat' | '/v1/aether/chat/status', body: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closed) throw new InferenceFailure('unavailable');
    const controller = new AbortController();
    this.pending.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const json = body === undefined ? undefined : JSON.stringify(body);
      if (json && Buffer.byteLength(json) > 16384) throw new InferenceFailure('unavailable');
      const response = await this.fetcher(this.config.origin + path, {
        method: json ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: {Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json', Accept: 'application/json'},
        body: json,
      });
      if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
        || Number(response.headers.get('content-length')) > 32768) {
        await response.body?.cancel(); throw new InferenceFailure('unavailable');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new InferenceFailure('unavailable');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 32768) { await reader.cancel(); throw new InferenceFailure('unavailable'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const value: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)));
      if (!response.ok) {
        const code = z.object({error: z.string().max(100)}).safeParse(value);
        throw new InferenceFailure(response.status === 429 || (response.status === 503 && code.success && code.data.error === 'OVERLOADED')
          ? 'busy' : response.status === 408 ? 'timeout' : 'unavailable');
      }
      return value;
    } catch (failure) {
      if (controller.signal.aborted) throw new InferenceFailure('timeout');
      throw failure instanceof InferenceFailure ? failure : new InferenceFailure('unavailable');
    } finally { clearTimeout(timer); this.pending.delete(controller); }
  }
  close(): void {
    this.closed = true; this.verifiedAt = undefined;
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }
}
