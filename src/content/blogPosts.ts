// Corresponds to the Blog / Field Notes section.
export type BlogPost = {
  date: string;
  label: string;
  title: string;
  excerpt: string;
  body: string[];
  tags: string[];
  featured?: boolean;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    date: '2026-05-25',
    label: 'Website',
    title: 'The site moved into the main repo',
    excerpt: 'The website now builds from the main Wilderness Odyssey repository, with the GitHub Pages path updated for the new home.',
    body: [
      'The old website branch was built around the API repo path, so the move needed a small but important base-path update before Pages could serve assets correctly.',
      'The site content is also being split into focused data files, which makes logs, gallery slides, roadmap entries, feature cards, and blog posts easier to edit without touching the main page layout.',
    ],
    tags: ['site', 'pages', 'maintenance'],
    featured: true,
  },
  {
    date: '2026-05-24',
    label: 'Development',
    title: 'Modular content pass',
    excerpt: 'Survivor logs and gallery slides are becoming data-driven so future updates are less annoying to make.',
    body: [
      'The goal is to keep the cinematic one-page feel while moving repeatable content into clean TypeScript files.',
      'That means new screenshots, log entries, and development updates can be added in one predictable place instead of hunting through a long HTML file.',
    ],
    tags: ['content', 'workflow'],
  },
  {
    date: '2026-05-09',
    label: 'Field Note',
    title: 'First public terminal build',
    excerpt: 'The Bunker OS terminal became part of the site, giving the page a more first-person survival feel.',
    body: [
      'The terminal is not just decoration. It has command history, autocomplete, clickable command hints, and changelog output.',
      'That gives the site a place to expose lore, versions, and future secrets without breaking the mood of the page.',
    ],
    tags: ['terminal', 'lore'],
  },
];
