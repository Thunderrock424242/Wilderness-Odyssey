import type { CollectionEntry } from 'astro:content';
import { slugify } from './urls';

export type Transmission = CollectionEntry<'transmissions'>;

export const NEWS_TYPES = new Set(['news', 'announcement', 'devlog', 'patch']);

export function sortTransmissions(entries: Transmission[]): Transmission[] {
  return [...entries].sort((a, b) => {
    const dateDifference = b.data.publishedAt.getTime() - a.data.publishedAt.getTime();
    return dateDifference || a.id.localeCompare(b.id);
  });
}

export function getPublishedTransmissions(entries: Transmission[]): Transmission[] {
  return sortTransmissions(entries.filter((entry) => !entry.data.draft));
}

export function filterByType(entries: Transmission[], ...types: string[]): Transmission[] {
  const accepted = new Set(types);
  return entries.filter((entry) => accepted.has(entry.data.type));
}

export function relatedTransmissions(current: Transmission, entries: Transmission[], limit = 3): Transmission[] {
  const currentTags = new Set(current.data.tags.map((tag) => tag.toLowerCase()));
  return entries
    .filter((entry) => entry.id !== current.id)
    .map((entry) => ({
      entry,
      score:
        entry.data.tags.filter((tag) => currentTags.has(tag.toLowerCase())).length * 3 +
        (entry.data.type === current.data.type ? 2 : 0) +
        (entry.data.relatedRoadmapItem && entry.data.relatedRoadmapItem === current.data.relatedRoadmapItem ? 2 : 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.entry.data.publishedAt.getTime() - a.entry.data.publishedAt.getTime())
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(value);
}

export function uniqueTags(entries: Transmission[]): string[] {
  return [...new Set(entries.flatMap((entry) => entry.data.tags))].sort((a, b) => a.localeCompare(b));
}

export function transmissionSearchText(entry: Transmission): string {
  return [
    entry.data.title,
    entry.data.description,
    entry.data.type,
    entry.data.author,
    entry.data.version ?? '',
    ...entry.data.tags,
  ]
    .join(' ')
    .toLowerCase();
}

export function tagArchives(entries: Transmission[]) {
  const archives = new Map<string, { slug: string; tag: string; entries: Transmission[] }>();
  for (const entry of entries) {
    for (const tag of entry.data.tags) {
      const slug = slugify(tag);
      const archive = archives.get(slug) ?? { slug, tag, entries: [] };
      if (!archive.entries.includes(entry)) archive.entries.push(entry);
      archives.set(slug, archive);
    }
  }
  return [...archives.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
