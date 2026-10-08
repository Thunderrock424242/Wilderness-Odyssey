import { z } from 'zod';
import { browserSessionSchema, roleCapabilities, type BrowserSession } from '../../../contracts/v1/admin';
import * as c from '../../../contracts/v1/content';
import { logoutSchema } from '../../../contracts/v1/auth';
import { AdminApiError, type AdminCmsService, type AdminMediaPurpose, type AdminTransmissionInput } from './types';
export class HostedAdminApi {
  session: BrowserSession | null = null;
  private generation = 0;
  constructor(readonly fetcher: typeof fetch = fetch, readonly onInvalidate?: () => void) {}
  invalidate() { this.generation++; this.session = null; this.onInvalidate?.(); }
  async initialize() { this.session = await this.request('/session', browserSessionSchema); return this.session; }
  async request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const generation = this.generation;
    const headers = new Headers(init.headers);
    if (init.method && init.method !== 'GET') {
      headers.set('X-CSRF-Token', this.session?.csrfToken ?? ''); headers.set('Idempotency-Key', crypto.randomUUID());
      if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    }
    let response: Response;
    const fetcher = this.fetcher;
    try { response = await fetcher('/api/admin/v1' + path, { ...init, headers, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000) }); }
    catch { throw new AdminApiError('The request could not be confirmed. Refresh before retrying.', 0); }
    if (!response.ok) {
      await response.body?.cancel(); if ([401, 403].includes(response.status)) this.invalidate();
      const messages: Record<number, string> = { 401: 'Sign in again to continue. Credential replacement needs a recent sign-in.', 403: 'Current administrator permission is required.', 404: 'This record or service is not available. The backend may need its initial content import.', 409: 'This record changed. Refresh before saving again.', 413: 'This document or image is too large.', 422: 'Check the settings, approved connection, and referenced images.', 429: 'Wait briefly before trying again.', 503: 'The backend is unavailable or needs its one-time setup.' };
      throw new AdminApiError(messages[response.status] ?? 'The editing request failed.', response.status);
    }
    try {
      if (!response.body) throw new Error(); const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2 * 1024 * 1024) throw new Error(); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => undefined); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (generation !== this.generation) throw new AdminApiError('Sign in again to continue.', 401);
      return schema.parse(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    } catch (error) { if (error instanceof AdminApiError) throw error; throw new AdminApiError('The service returned an unsupported response. No change has been confirmed.', 502); }
  }
  can(capability: BrowserSession['capabilities'][number]) { return !!this.session && roleCapabilities[this.session.user.role].includes(capability) && this.session.capabilities.includes(capability); }
  async logout() {
    const session = this.session; this.invalidate();
    if (session?.authMethod === 'access') { location.assign('/cdn-cgi/access/logout'); return; }
    const fetcher = this.fetcher;
    const response = await fetcher('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session?.csrfToken ?? '' }, credentials: 'same-origin', signal: AbortSignal.timeout(12000) });
    if (!response.ok || !logoutSchema.safeParse(await response.json()).success) throw new AdminApiError('Sign-out could not be confirmed. Close this page and sign in again.', response.status);
  }
}
export class HostedAdminCmsService implements AdminCmsService {
  readonly mode = 'api' as const;
  readonly api: HostedAdminApi;
  private records = new Map<string, c.Transmission>();
  private previews = new Map<string, string>();
  constructor(fetcher: typeof fetch = fetch) { this.api = new HostedAdminApi(fetcher, () => { this.records.clear(); this.previews.clear(); }); }
  async getSession() {
    try { const value = await this.api.initialize(); if (!this.api.can('content:read')) throw new AdminApiError('Administrator content access is required.', 403); return { authenticated: true, user: { id: value.user.id, displayName: value.user.displayName, clearance: value.user.role }, csrfToken: value.csrfToken }; }
    catch (error) { if (error instanceof AdminApiError && error.status === 401) return { authenticated: false }; throw error; }
  }
  async login() { location.assign('/login/'); return { authenticated: false }; }
  async logout() { try { await this.api.logout(); } finally { this.records.clear(); this.previews.clear(); } }
  async listTransmissions() { return (await this.api.request('/content/transmissions', c.transmissionListSchema)).records; }
  private decorate(value: z.infer<typeof c.transmissionEnvelope>) {
    this.records.set(value.transmission.id, value.transmission);
    for (const media of value.media ?? []) this.previews.set(media.src, media.previewUrl);
    return { ...value.transmission, coverPreviewUrl: value.transmission.coverImage ? this.assetPreview(value.transmission.coverImage) : undefined, galleryImages: value.transmission.galleryImages.map(image => ({ ...image, previewUrl: this.assetPreview(image.src) })) };
  }
  async getTransmission(id: string) { return this.decorate(await this.api.request('/content/transmissions/' + c.contentId.parse(id), c.transmissionEnvelope)); }
  async createTransmission(content: AdminTransmissionInput) { const value = await this.api.request('/content/transmissions', c.contentMutationSchema, { method: 'POST', body: JSON.stringify(c.contentSaveInput.parse({ content, revision: null, sourceRevision: null })) }); return { transmission: this.decorate(value), publishing: value.publishing }; }
  async updateTransmission(id: string, content: AdminTransmissionInput) {
    const old = this.records.get(id); if (!old) throw new AdminApiError('Load the record before saving it.', 409);
    const value = await this.api.request('/content/transmissions/' + c.contentId.parse(id), c.contentMutationSchema, { method: 'PUT', body: JSON.stringify(c.contentSaveInput.parse({ content, revision: old.revision, sourceRevision: old.sourceRevision })) }); return { transmission: this.decorate(value), publishing: value.publishing };
  }
  async deleteTransmission(id: string) { const old = this.records.get(id); if (!old) throw new AdminApiError('Load this record first.', 409); await this.api.request('/content/transmissions/' + c.contentId.parse(id), z.object({ schemaVersion: z.literal('1.0'), deleted: z.literal(true) }), { method: 'DELETE', body: JSON.stringify({ revision: old.revision }) }); this.records.delete(id); }
  async uploadMedia(file: File, slug: string, purpose: AdminMediaPurpose) {
    if (file.size > 12 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new AdminApiError('Use a PNG, JPEG, WebP, or GIF image up to 12 MiB.', 413);
    const body = new FormData(); body.set('file', file); body.set('slug', c.contentId.parse(slug)); body.set('purpose', purpose);
    const media = await this.api.request('/content/media', c.mediaSchema, { method: 'POST', body }); this.previews.set(media.src, media.previewUrl); return media;
  }
  assetPreview(path: string) { return this.previews.get(path) ?? path; }
  async publishTransmission(id: string, action: 'publish' | 'unpublish', acknowledgePublicSource: boolean) { const old = this.records.get(id); if (!old) throw new AdminApiError('Load the record first.', 409); return this.api.request('/content/transmissions/' + c.contentId.parse(id) + '/publication', c.publicationSchema, { method: 'POST', body: JSON.stringify(c.publicationInput.parse({ revision: old.revision, action, acknowledgePublicSource })) }); }
  getPublishingStatus(id: string) { return this.api.request('/content/publications/' + c.contentId.parse(id), c.publicationSchema); }
}
