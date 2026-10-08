import siteData from './editable/site.json';
import { siteDataSchema } from '../../contracts/v1/content';

export const SITE = siteDataSchema.parse(siteData);

export const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Status', href: '/status/' },
  { label: 'Support', href: '/support/' },
  { label: 'Roadmap', href: '/roadmap/' },
  { label: 'Features', href: '/features/' },
  { label: 'Gallery', href: '/gallery/' },
  { label: 'News', href: '/news/' },
  { label: 'Dev Logs', href: '/devlogs/' },
  { label: 'Patches', href: '/patches/' },
  { label: 'Lore', href: '/lore/' },
  { label: 'Blog', href: '/blog/' },
] as const;

export const TRANSMISSION_TYPES = ['news', 'blog', 'devlog', 'patch', 'lore', 'announcement'] as const;
export type TransmissionType = (typeof TRANSMISSION_TYPES)[number];

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  news: 'Latest News',
  blog: 'Field Note',
  devlog: 'Engineering Log',
  patch: 'Patch Record',
  lore: 'Recovered Record',
  announcement: 'Priority Signal',
};
