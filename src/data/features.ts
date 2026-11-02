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
      'Explore varied terrain and ecosystems, with room to build and routes worth wandering.',
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
      'Search abandoned structures for resources and environmental clues.',
    status: 'In development',
  },
  {
    category: 'Creatures',
    eyebrow: 'Adapted life',
    title: 'Wildlife',
    description:
      'Encounter wildlife across varied environments as you explore.',
    status: 'Foundation',
  },
  {
    category: 'Survival',
    eyebrow: 'First session',
    title: 'Survive, Build & Explore',
    description:
      'Gather resources, build, and explore at your own pace.',
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
    eyebrow: 'A voice in the records',
    title: 'Aether',
    description:
      'Aether offers a thread to follow through incomplete records. Discover its story in play.',
    status: 'Foundation',
  },
  {
    category: 'Dimensions',
    eyebrow: 'An unanswered name',
    title: 'Echo Earth',
    description:
      'A name in the archives hints at something beyond the familiar. Details are left for discovery.',
    status: 'Planned',
  },
  {
    category: 'Lore',
    eyebrow: 'Follow the clues',
    title: 'Stories in the Wilderness',
    description:
      'Find the story through exploration and environmental clues, at your own pace.',
    status: 'Foundation',
  },
];
