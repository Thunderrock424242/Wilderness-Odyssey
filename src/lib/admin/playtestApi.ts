import { z } from 'zod';
import * as s from '../../../contracts/v1/playtests';
import { HostedAdminApi } from './hostedApi';
import { AdminApiError } from './types';

export class PlaytestApi extends HostedAdminApi {
  private keys = new Map<string, string>();
  override invalidate() { this.keys.clear(); super.invalidate(); }
  async change<T>(path: string, schema: z.ZodType<T>, method: string, payload: unknown) {
    if (!this.can('playtests:write')) throw new AdminApiError('Current playtest administrator permission is required.', 403);
    const signature = path + ':' + JSON.stringify(payload), key = this.keys.get(signature) ?? crypto.randomUUID();
    this.keys.set(signature, key);
    const value = await this.request(path, schema, { method, body: JSON.stringify(payload), headers: { 'Idempotency-Key': key } });
    this.keys.delete(signature); return value;
  }
  async history(testerId: string, cursor?: string) {
    const value = await this.request('/playtests/testers/' + testerId + '/history' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), s.testerHistorySchema);
    if (value.testerId !== testerId || value.groups.some(group => group.tester.id !== testerId || group.sessions.some(session => session.testerId !== testerId || session.campaignId !== group.campaign.id))) throw new AdminApiError('This tester history could not be verified.', 502);
    return value;
  }
  async artifact(path: string, campaignId: string, testerId: string, sessionId: string, artifactId: string) {
    const value = await this.request(path, s.privateArtifactSchema);
    if (value.campaignId !== campaignId || value.testerId !== testerId || value.sessionId !== sessionId || value.artifactId !== artifactId || value.scope !== 'client') throw new AdminApiError('This private report could not be verified.', 502);
    return value;
  }
  async download(path: string, spark: boolean) {
    let response: Response;
    try { const fetcher = this.fetcher; response = await fetcher('/api/admin/v1' + path + '/download', { credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) }); }
    catch { throw new AdminApiError('This private download could not be confirmed. Try refreshing.', 0); }
    if (!response.ok) {
      await response.body?.cancel(); if ([401, 403].includes(response.status)) this.invalidate();
      throw new AdminApiError([401, 403].includes(response.status) ? 'Sign in again to access private reports.' : 'This private report is unavailable.', response.status);
    }
    const type = spark ? 'application/x-spark-sampler' : 'text/plain; charset=utf-8';
    if (!response.body || response.headers.get('Content-Type') !== type) { await response.body?.cancel(); throw new AdminApiError('This private download could not be verified.', 502); }
    const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > (spark ? 1024 * 1024 : 256 * 1024)) throw new AdminApiError('This report exceeds the download limit.', 413); chunks.push(new Uint8Array(part.value)); }
    } finally { await reader.cancel().catch(() => undefined); }
    return new Blob(chunks, { type });
  }
}
