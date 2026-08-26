import { TRANSMISSION_TYPES, type TransmissionType } from '../../data/site';
import { slugify } from '../urls';
import type { AdminGalleryImage, AdminTransmission, AdminTransmissionInput, AdminTransmissionSummary } from './types';

export const IMAGE_MIME_TYPES = ['image/webp', 'image/avif', 'image/png', 'image/jpeg', 'image/gif'] as const;
export const IMAGE_FILE_ACCEPT = '.webp,.avif,.png,.jpg,.jpeg,.gif';
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export const TRANSMISSION_TEMPLATES: Partial<Record<TransmissionType, string>> = {
  patch: '## Added\n\n\n\n## Changed\n\n\n\n## Fixed\n\n\n\n## Known issues\n\n',
  devlog: '## What changed\n\n\n\n## What we discovered\n\n\n\n## Testing\n\n\n\n## Next steps\n\n',
  news: '## Situation report\n\n\n\n## What this means\n\n',
  announcement: '## Priority signal\n\n\n\n## Required action\n\n',
};

export function createTransmissionDraft(author: string, date = new Date()): AdminTransmissionInput {
  return {
    slug: '',
    title: '',
    description: '',
    publishedAt: toDateInput(date),
    type: 'blog',
    author,
    tags: [],
    featured: false,
    draft: true,
    galleryImages: [],
    bodyMarkdown: '',
  };
}

export function transmissionSlug(title: string): string {
  return slugify(title).slice(0, 96);
}

export function buildTransmissionMediaPath(slug: string, fileName: string): string {
  const safeSlug = transmissionSlug(slug);
  const extensionMatch = fileName.toLowerCase().match(/\.(webp|avif|png|jpe?g|gif|webm|mp4)$/);
  const extension = extensionMatch?.[0] ?? '';
  const stem = fileName
    .slice(0, extension ? -extension.length : undefined)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'media';
  if (!safeSlug) throw new Error('A valid transmission slug is required before adding media.');
  return `/images/transmissions/${safeSlug}/${stem}${extension}`;
}

export function normalizeTags(value: string | string[]): string[] {
  const source = Array.isArray(value) ? value : value.split(',');
  return [...new Set(source.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function validateTransmission(input: AdminTransmissionInput, roadmapIds: readonly string[], existingIds: readonly string[] = [], currentId?: string): string[] {
  const errors: string[] = [];
  if (input.title.trim().length < 3) errors.push('Title must contain at least 3 characters.');
  if (input.description.trim().length < 10 || input.description.trim().length > 320) errors.push('Description must contain 10–320 characters.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) errors.push('Slug must use lowercase letters, numbers, and single hyphens.');
  if (existingIds.includes(input.slug) && currentId !== input.slug) errors.push(`The slug “${input.slug}” is already in use.`);
  if (!(TRANSMISSION_TYPES as readonly string[]).includes(input.type)) errors.push('Choose a supported transmission type.');
  if (!input.author.trim()) errors.push('Author is required.');
  if (input.tags.length === 0) errors.push('Add at least one tag.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt)) errors.push('Publication date is required.');
  if (input.updatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.updatedAt)) errors.push('Updated date must use YYYY-MM-DD.');
  if (input.coverImage && !input.coverImage.startsWith('/images/')) errors.push('Cover image must use a site-root /images/ path.');
  if (input.relatedRoadmapItem && !roadmapIds.includes(input.relatedRoadmapItem)) errors.push('Choose a valid roadmap item.');
  input.galleryImages.forEach((image, index) => {
    if (!image.src.startsWith('/images/')) errors.push(`Gallery image ${index + 1} must use a site-root /images/ path.`);
    if (image.alt.trim().length < 3) errors.push(`Gallery image ${index + 1} needs useful alt text.`);
  });
  if (!input.bodyMarkdown.trim()) errors.push('Transmission content cannot be empty.');
  return errors;
}

export function generateTransmissionMarkdown(input: AdminTransmissionInput): string {
  const lines = [
    '---',
    `title: ${yamlString(input.title.trim())}`,
    `description: ${yamlString(input.description.trim())}`,
    `publishedAt: ${input.publishedAt}`,
  ];
  if (input.updatedAt) lines.push(`updatedAt: ${input.updatedAt}`);
  lines.push(
    `type: ${input.type}`,
    `author: ${yamlString(input.author.trim())}`,
    'tags:',
    ...input.tags.map((tag) => `  - ${yamlString(tag)}`),
  );
  if (input.coverImage) lines.push(`coverImage: ${yamlString(input.coverImage)}`);
  lines.push(`featured: ${input.featured}`, `draft: ${input.draft}`);
  if (input.version) lines.push(`version: ${yamlString(input.version)}`);
  if (input.relatedRoadmapItem) lines.push(`relatedRoadmapItem: ${yamlString(input.relatedRoadmapItem)}`);
  if (input.galleryImages.length) {
    lines.push('galleryImages:');
    input.galleryImages.forEach((image) => {
      lines.push(`  - src: ${yamlString(image.src)}`, `    alt: ${yamlString(image.alt)}`);
      if (image.caption) lines.push(`    caption: ${yamlString(image.caption)}`);
    });
  }
  lines.push('---', '', input.bodyMarkdown.trim(), '');
  return lines.join('\n');
}

export function toTransmissionSummary(transmission: AdminTransmission): AdminTransmissionSummary {
  const { bodyMarkdown: _bodyMarkdown, galleryImages, ...summary } = transmission;
  return { ...summary, galleryImageCount: galleryImages.length };
}

export function cloneSummaryAsTransmission(summary: AdminTransmissionSummary): AdminTransmission {
  const { galleryImageCount: _galleryImageCount, ...transmission } = summary;
  return {
    ...transmission,
    galleryImages: [],
    bodyMarkdown: `## ${transmission.title}\n\n${transmission.description}\n`,
  };
}

export function sanitizeGalleryImages(images: AdminGalleryImage[]): AdminGalleryImage[] {
  return images.map(({ src, alt, caption, previewUrl }) => ({
    src: src.trim(),
    alt: alt.trim(),
    ...(caption?.trim() ? { caption: caption.trim() } : {}),
    ...(previewUrl ? { previewUrl } : {}),
  }));
}

export function toDateInput(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}
