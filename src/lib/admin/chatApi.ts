import { z } from 'zod';
import * as s from '../../../contracts/v1/playtester-chat';
import { HostedAdminApi } from './hostedApi';
import { AdminApiError } from './types';
import { rememberedFetch } from '../../services/rememberedFetch';

export class ChatApi extends HostedAdminApi {
  private keys = new Map<string, string>();
  private downloadGeneration = 0;
  override invalidate() { this.downloadGeneration++; this.keys.clear(); super.invalidate(); }
  async change<T>(path: string, schema: z.ZodType<T>, payload: unknown) {
    if (!this.can('server:write') || this.session?.authMethod !== 'discord') throw new AdminApiError('Discord administrator access is required.', 403);
    const signature = path + ':' + JSON.stringify(payload), key = this.keys.get(signature) ?? crypto.randomUUID();
    this.keys.set(signature, key);
    const value = await this.request('/playtester-chat' + path, schema, { method: 'POST', body: JSON.stringify(payload), headers: { 'Idempotency-Key': key } });
    this.keys.delete(signature); return value;
  }
  home(cursor?: string) { return this.request('/playtester-chat' + (cursor ? '?cursor=' + cursor : ''), s.chatHomeSchema); }
  async thread(campaignId: string, userId: string, before?: string) {
    const value = await this.request('/playtester-chat/threads/' + campaignId + '/' + userId + (before ? '?before=' + before : ''), s.chatThreadSchema);
    if (value.messages.some(message => message.campaignId !== campaignId || message.userId !== userId)) throw new AdminApiError('This conversation could not be verified.', 502);
    return value;
  }
  async download(file: z.infer<typeof s.chatFileSchema>) {
    const generation = this.downloadGeneration;
    let response: Response;
    try { response = await rememberedFetch('/api/admin/v1/playtester-chat/attachments/' + file.id, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) }, this.fetcher); }
    catch { throw new AdminApiError('This private download could not be confirmed.', 0); }
    if (!response.ok) { await response.body?.cancel(); if ([401, 403].includes(response.status)) this.invalidate(); throw new AdminApiError('This private attachment is unavailable. Refresh your access.', response.status); }
    const type = response.headers.get('Content-Type') ?? '';
    if (!response.body || !(file.kind === 'spark' ? type === 'application/x-spark-sampler' : ['text/plain', 'text/plain; charset=utf-8'].includes(type))) { await response.body?.cancel(); throw new AdminApiError('This private attachment could not be verified.', 502); }
    const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 5 * 1024 * 1024) throw new AdminApiError('This attachment exceeds the download limit.', 413); chunks.push(new Uint8Array(part.value)); } }
    finally { await reader.cancel().catch(() => undefined); }
    if (generation !== this.downloadGeneration) throw new AdminApiError('Your inbox access changed. Refresh to continue.', 403);
    return new Blob(chunks, { type });
  }
}
