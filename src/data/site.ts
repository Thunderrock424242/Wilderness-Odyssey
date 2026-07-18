export const SITE = {
  name: 'Wilderness Odyssey',
  tagline: 'The World Reborn',
  description:
    'A cinematic post-Exodus Minecraft survival odyssey shaped by Project Threshold, Echo Earth, anomaly weather, and a world reclaimed by nature.',
  status: 'Pre-alpha — version 0.1.0 in development',
  version: '0.1.0',
  minecraftVersion: '1.21.1',
  neoForgeVersion: 'Not published',
  downloadStatus: 'No public build is available yet',
  featuredTransmission: 'version-0-1-0-takes-shape',
  links: {
    curseForge: 'https://www.curseforge.com/minecraft/modpacks/wilderness-odyssey',
    discord: 'https://discord.gg/XHSFDb7EM5',
    github: 'https://github.com/Thunderrock424242/Wilderness-Odyssey',
  },
  social: {
    title: 'Wilderness Odyssey // Surface Access Restored',
    description:
      'BUNKER_OS reports breathable air, hostile anomaly weather, and a world reclaimed by nature. Wake up, gear up, and step outside.',
    image: '/images/logo.png',
  },
  footer: 'A post-Exodus survival project by Thunderrock424242.',
  author: 'Thunderrock424242',
} as const;

export const NAV_ITEMS = [
  { label: 'Home', href: '/' },
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
