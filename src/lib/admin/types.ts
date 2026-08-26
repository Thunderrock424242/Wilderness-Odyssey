import type { TransmissionType } from '../../data/site';

export const ADMIN_TRANSMISSION_TYPES = ['news', 'blog', 'devlog', 'patch', 'lore', 'announcement'] as const satisfies readonly TransmissionType[];

export type AdminGalleryImage = {
  src: string;
  alt: string;
  caption?: string;
  previewUrl?: string;
};

export type AdminTransmissionInput = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  type: TransmissionType;
  author: string;
  tags: string[];
  coverImage?: string;
  coverPreviewUrl?: string;
  featured: boolean;
  draft: boolean;
  version?: string;
  relatedRoadmapItem?: string;
  galleryImages: AdminGalleryImage[];
  bodyMarkdown: string;
};

export type AdminTransmission = AdminTransmissionInput & {
  id: string;
  revision?: string;
  createdAt?: string;
};

export type AdminTransmissionSummary = Omit<AdminTransmission, 'bodyMarkdown' | 'galleryImages'> & {
  galleryImageCount: number;
};

export type AdminUser = {
  id: string;
  displayName: string;
  clearance?: string;
};

export type AdminSession = {
  authenticated: boolean;
  user?: AdminUser;
  csrfToken?: string;
};

export type AdminMediaPurpose = 'cover' | 'body' | 'gallery';

export type AdminMediaUpload = {
  src: string;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video';
};

export type PublishingState =
  | 'idle'
  | 'saving'
  | 'commit-created'
  | 'build-running'
  | 'deploying'
  | 'published'
  | 'mock-saved'
  | 'failed';

export type PublishingStatus = {
  state: PublishingState;
  message: string;
  operationId?: string;
  commitUrl?: string;
  deploymentUrl?: string;
};

export type AdminMutationResult = {
  transmission: AdminTransmission;
  publishing: PublishingStatus;
};

export interface AdminCmsService {
  readonly mode: 'api' | 'mock' | 'unavailable';
  getSession(): Promise<AdminSession>;
  login(username: string, password: string): Promise<AdminSession>;
  logout(): Promise<void>;
  listTransmissions(): Promise<AdminTransmissionSummary[]>;
  getTransmission(id: string): Promise<AdminTransmission>;
  createTransmission(input: AdminTransmissionInput): Promise<AdminMutationResult>;
  updateTransmission(id: string, input: AdminTransmissionInput): Promise<AdminMutationResult>;
  deleteTransmission(id: string): Promise<void>;
  uploadMedia(file: File, slug: string, purpose: AdminMediaPurpose): Promise<AdminMediaUpload>;
  getPublishingStatus(operationId: string): Promise<PublishingStatus>;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'ADMIN_API_ERROR',
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}
