export const FEATURE_CATEGORIES = [
  'World Generation',
  'Weather',
  'Water System',
  'Structures',
  'Creatures',
  'Survival',
  'Performance',
  'Aether',
  'Dimensions',
  'Lore',
] as const;

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export type Feature = {
  category: FeatureCategory;
  eyebrow: string;
  title: string;
  description: string;
  status: 'Active' | 'In development' | 'Planned' | 'Foundation';
};

export const FEATURES: Feature[] = [
  {
    category: 'World Generation',
    eyebrow: 'Living world',
    title: 'World Exploration',
    description:
      'Explore varied terrain and ecosystems. Story context: [REDACTED].',
    status: 'In development',
  },
  {
    category: 'Weather',
    eyebrow: 'Atmospheric threat',
    title: 'Seasons & Storms',
    description:
      'A living weather system cycles through seasons, rain, snow, thunder, and anomaly conditions that turn travel into a decision instead of background noise.',
    status: 'Active',
  },
  {
    category: 'Water System',
    eyebrow: 'Simulation',
    title: 'Ambitious Water',
    description:
      'The SPH water system is being profiled and tuned so rivers, oceans, and shorelines can stay distinctive without runaway VRAM or frame-time cost.',
    status: 'In development',
  },
  {
    category: 'Structures',
    eyebrow: 'Recovered sites',
    title: 'Bunkers & Research Sites',
    description:
      'Discover structures and survival resources. Story records: [REDACTED].',
    status: 'In development',
  },
  {
    category: 'Creatures',
    eyebrow: 'Adapted life',
    title: 'Wildlife',
    description:
      'Creature history and story details: [REDACTED].',
    status: 'Foundation',
  },
  {
    category: 'Survival',
    eyebrow: 'First session',
    title: 'Survive, Build & Explore',
    description:
      'Gather resources, build, and explore at your own pace. Opening story: [REDACTED].',
    status: 'In development',
  },
  {
    category: 'Performance',
    eyebrow: 'Release gate',
    title: 'Long-Session Stability',
    description:
      'World creation, chunk travel, dimension transitions, and water-heavy exploration are measured as full-session systems rather than isolated moments.',
    status: 'In development',
  },
  {
    category: 'Aether',
    eyebrow: 'Restricted records',
    title: '[REDACTED]',
    description:
      '[REDACTED] — Discover the story in play.',
    status: 'Foundation',
  },
  {
    category: 'Dimensions',
    eyebrow: 'Restricted records',
    title: '[REDACTED]',
    description:
      '[REDACTED] — Discover the story in play.',
    status: 'Planned',
  },
  {
    category: 'Lore',
    eyebrow: 'Restricted records',
    title: '[REDACTED]',
    description:
      '[REDACTED] — Discover the story in play.',
    status: 'Foundation',
  },
];
