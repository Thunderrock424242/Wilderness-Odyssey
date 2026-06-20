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
    date: '2026-06-20',
    label: 'Development Update',
    title: 'Version 0.1.0 takes shape',
    excerpt: 'Pack construction is underway with worldgen changes, bunker placement, performance tuning, and an SPH water VRAM investigation at the center of the first-alpha push.',
    body: [
      'Wilderness Odyssey is now being assembled, and version 0.1.0 will be the first alpha rather than an update to an existing public build.',
      'The active work is concentrated on world generation changes, reliable bunker placement, and performance tuning. The SPH water system is also under investigation for VRAM growth so its simulation and rendering do not become a long-session performance killer.',
      'The lore bible has also been revised as a separate internal document. Its revision number is not connected to the pack version; its canon will guide structures, items, terminals, and quests while keeping discovery open-ended.',
      'Version 0.1.0 will move forward when fresh worlds are stable, bunkers place reliably, and water-heavy exploration can run without progressive memory or frame-time collapse.',
    ],
    tags: ['first alpha', 'worldgen', 'performance', 'lore'],
    featured: true,
  },
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
