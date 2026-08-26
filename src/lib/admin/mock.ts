import { buildTransmissionMediaPath, cloneSummaryAsTransmission, toTransmissionSummary } from './cms';
import { AdminApiError, type AdminCmsService, type AdminMediaPurpose, type AdminMediaUpload, type AdminMutationResult, type AdminSession, type AdminTransmission, type AdminTransmissionInput, type AdminTransmissionSummary, type PublishingStatus } from './types';

type MockStore = {
  records: Record<string, AdminTransmission>;
  deletedSeedIds: string[];
};

const STORAGE_KEY = 'wo-admin-mock-v1';

export class MockAdminCmsService implements AdminCmsService {
  readonly mode = 'mock' as const;
  private authenticated = false;

  constructor(private readonly seeds: AdminTransmissionSummary[]) {}

  getSession(): Promise<AdminSession> {
    return Promise.resolve({
      authenticated: this.authenticated,
      ...(this.authenticated ? { user: { id: 'local-mock', displayName: 'Development Operator', clearance: 'LOCAL MOCK' } } : {}),
    });
  }

  login(username: string, password: string): Promise<AdminSession> {
    if (!username.trim() || !password) throw new AdminApiError('Enter any non-empty development credentials to open mock mode.', 400, 'MOCK_LOGIN_REQUIRED');
    this.authenticated = true;
    return this.getSession();
  }

  logout(): Promise<void> {
    this.authenticated = false;
    return Promise.resolve();
  }

  listTransmissions(): Promise<AdminTransmissionSummary[]> {
    this.assertAuthenticated();
    const store = this.readStore();
    const seeded = this.seeds.filter((seed) => !store.deletedSeedIds.includes(seed.id));
    const merged = new Map(seeded.map((seed) => [seed.id, seed]));
    Object.values(store.records).forEach((record) => merged.set(record.id, toTransmissionSummary(record)));
    return Promise.resolve([...merged.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title)));
  }

  getTransmission(id: string): Promise<AdminTransmission> {
    this.assertAuthenticated();
    const store = this.readStore();
    const record = store.records[id];
    if (record) return Promise.resolve(structuredClone(record));
    const seed = this.seeds.find((item) => item.id === id && !store.deletedSeedIds.includes(id));
    if (!seed) throw new AdminApiError('Transmission not found in the local mock store.', 404, 'NOT_FOUND');
    return Promise.resolve(cloneSummaryAsTransmission(seed));
  }

  async createTransmission(input: AdminTransmissionInput): Promise<AdminMutationResult> {
    this.assertAuthenticated();
    const existing = await this.listTransmissions();
    if (existing.some((item) => item.id === input.slug)) throw new AdminApiError('That slug is already in use.', 409, 'SLUG_CONFLICT');
    const now = new Date().toISOString();
    const transmission: AdminTransmission = { ...structuredClone(input), id: input.slug, revision: `mock-${Date.now()}`, createdAt: now };
    const store = this.readStore();
    store.records[transmission.id] = transmission;
    this.writeStore(store);
    return this.mockResult(transmission);
  }

  async updateTransmission(id: string, input: AdminTransmissionInput): Promise<AdminMutationResult> {
    this.assertAuthenticated();
    const existing = await this.listTransmissions();
    if (input.slug !== id && existing.some((item) => item.id === input.slug)) throw new AdminApiError('That slug is already in use.', 409, 'SLUG_CONFLICT');
    const previous = await this.getTransmission(id);
    const transmission: AdminTransmission = {
      ...structuredClone(input),
      id: input.slug,
      createdAt: previous.createdAt,
      revision: `mock-${Date.now()}`,
    };
    const store = this.readStore();
    delete store.records[id];
    store.records[transmission.id] = transmission;
    if (id !== transmission.id && this.seeds.some((seed) => seed.id === id)) store.deletedSeedIds.push(id);
    this.writeStore(store);
    return this.mockResult(transmission);
  }

  deleteTransmission(id: string): Promise<void> {
    this.assertAuthenticated();
    const store = this.readStore();
    delete store.records[id];
    if (this.seeds.some((seed) => seed.id === id) && !store.deletedSeedIds.includes(id)) store.deletedSeedIds.push(id);
    this.writeStore(store);
    return Promise.resolve();
  }

  async uploadMedia(file: File, slug: string, _purpose: AdminMediaPurpose): Promise<AdminMediaUpload> {
    this.assertAuthenticated();
    const previewUrl = await fileToDataUrl(file);
    return {
      src: buildTransmissionMediaPath(slug, file.name),
      previewUrl,
      fileName: file.name,
      mimeType: file.type,
      kind: file.type.startsWith('video/') ? 'video' : 'image',
    };
  }

  getPublishingStatus(): Promise<PublishingStatus> {
    return Promise.resolve({ state: 'mock-saved', message: 'Saved in this browser only. No GitHub commit or deployment was created.' });
  }

  private mockResult(transmission: AdminTransmission): AdminMutationResult {
    return {
      transmission,
      publishing: { state: 'mock-saved', message: 'Saved in this browser only. No GitHub commit or deployment was created.' },
    };
  }

  private assertAuthenticated() {
    if (!this.authenticated) throw new AdminApiError('Development mock access has not been opened.', 401, 'UNAUTHENTICATED');
  }

  private readStore(): MockStore {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as MockStore;
      return parsed?.records && Array.isArray(parsed.deletedSeedIds) ? parsed : { records: {}, deletedSeedIds: [] };
    } catch {
      return { records: {}, deletedSeedIds: [] };
    }
  }

  private writeStore(store: MockStore) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(new AdminApiError('The selected media file could not be read.', 400, 'MEDIA_READ_FAILED')));
    reader.readAsDataURL(file);
  });
}
