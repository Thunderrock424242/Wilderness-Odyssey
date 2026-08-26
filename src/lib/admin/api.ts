import { AdminApiError, type AdminCmsService, type AdminMediaPurpose, type AdminMediaUpload, type AdminMutationResult, type AdminSession, type AdminTransmission, type AdminTransmissionInput, type AdminTransmissionSummary, type PublishingStatus } from './types';

type ApiEnvelope<T> = { data: T } | T;

export function unwrapApiEnvelope<T>(payload: ApiEnvelope<T>): T {
  return typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : payload;
}

export class HttpAdminCmsService implements AdminCmsService {
  readonly mode = 'api' as const;
  private csrfToken = '';

  constructor(private readonly apiBase: string) {}

  async getSession(): Promise<AdminSession> {
    const session = await this.request<AdminSession>('/api/admin/session');
    this.csrfToken = session.csrfToken ?? '';
    return session;
  }

  async login(username: string, password: string): Promise<AdminSession> {
    const session = await this.request<AdminSession>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.csrfToken = session.csrfToken ?? '';
    return session;
  }

  async logout(): Promise<void> {
    await this.request('/api/admin/logout', { method: 'POST' });
    this.csrfToken = '';
  }

  listTransmissions(): Promise<AdminTransmissionSummary[]> {
    return this.request('/api/admin/transmissions');
  }

  getTransmission(id: string): Promise<AdminTransmission> {
    return this.request(`/api/admin/transmissions/${encodeURIComponent(id)}`);
  }

  createTransmission(input: AdminTransmissionInput): Promise<AdminMutationResult> {
    return this.request('/api/admin/transmissions', { method: 'POST', body: JSON.stringify(input) });
  }

  updateTransmission(id: string, input: AdminTransmissionInput): Promise<AdminMutationResult> {
    return this.request(`/api/admin/transmissions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
  }

  async deleteTransmission(id: string): Promise<void> {
    await this.request(`/api/admin/transmissions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async uploadMedia(file: File, slug: string, purpose: AdminMediaPurpose): Promise<AdminMediaUpload> {
    const form = new FormData();
    form.set('file', file);
    form.set('slug', slug);
    form.set('purpose', purpose);
    return this.request('/api/admin/media', { method: 'POST', body: form });
  }

  getPublishingStatus(operationId: string): Promise<PublishingStatus> {
    return this.request(`/api/admin/publishing/${encodeURIComponent(operationId)}`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (this.csrfToken && init.method && init.method !== 'GET') headers.set('X-CSRF-Token', this.csrfToken);
    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${path}`, { ...init, headers, credentials: 'include' });
    } catch {
      throw new AdminApiError('The Wilderness Odyssey Admin API is unavailable.', 0, 'API_UNAVAILABLE');
    }
    if (!response.ok) {
      let message = `Admin API request failed (${response.status}).`;
      let code = 'ADMIN_API_ERROR';
      try {
        const error = (await response.json()) as { message?: string; code?: string };
        message = error.message ?? message;
        code = error.code ?? code;
      } catch {
        // Preserve the safe generic error when the response is not JSON.
      }
      throw new AdminApiError(message, response.status, code);
    }
    if (response.status === 204) return undefined as T;
    return unwrapApiEnvelope((await response.json()) as ApiEnvelope<T>);
  }
}

export class UnavailableAdminCmsService implements AdminCmsService {
  readonly mode = 'unavailable' as const;
  private unavailable<T>(): Promise<T> {
    return Promise.reject(new AdminApiError('No Admin API base is configured for this build.', 0, 'API_NOT_CONFIGURED'));
  }
  getSession(): Promise<AdminSession> { return Promise.resolve({ authenticated: false }); }
  login(): Promise<AdminSession> { return this.unavailable(); }
  logout(): Promise<void> { return Promise.resolve(); }
  listTransmissions(): Promise<AdminTransmissionSummary[]> { return this.unavailable(); }
  getTransmission(): Promise<AdminTransmission> { return this.unavailable(); }
  createTransmission(): Promise<AdminMutationResult> { return this.unavailable(); }
  updateTransmission(): Promise<AdminMutationResult> { return this.unavailable(); }
  deleteTransmission(): Promise<void> { return this.unavailable(); }
  uploadMedia(): Promise<AdminMediaUpload> { return this.unavailable(); }
  getPublishingStatus(): Promise<PublishingStatus> { return this.unavailable(); }
}
