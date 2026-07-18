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
    title: 'Earth Reclaimed',
    description:
      'Environments unlike vanilla Minecraft: changed terrain, dynamic ecosystems, and exploration routes shaped around a planet that kept evolving without humanity.',
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
    title: 'Bunkers & Threshold Ruins',
    description:
      'Bunkers, safehouses, military ruins, and excavation sites carry survival resources and fragments of the Blackout Archive across fresh worlds.',
    status: 'In development',
  },
  {
    category: 'Creatures',
    eyebrow: 'Displaced life',
    title: 'A Broken Bestiary',
    description:
      'Prehistoric animals from broken layers of Earth history now share the wilderness with surviving wildlife, mutations, and things from Echo Earth.',
    status: 'Foundation',
  },
  {
    category: 'Survival',
    eyebrow: 'First session',
    title: 'Adapt, Don’t Restore',
    description:
      'The opening loop is built around waking, reading the land, securing resources, and proving humanity can survive the Earth that remains.',
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
    eyebrow: 'Damaged intelligence',
    title: 'Aether Remembers',
    description:
      'Aether guides the survivor through incomplete records and survival directives while its missing memories keep Project Threshold’s truth uncertain.',
    status: 'Foundation',
  },
  {
    category: 'Dimensions',
    eyebrow: 'Damaged reflection',
    title: 'Echo Earth',
    description:
      'A familiar world reflected incorrectly waits beyond stabilized rifts, where terrain repeats, ruins stand in the wrong places, and safe return is never assumed.',
    status: 'Planned',
  },
  {
    category: 'Lore',
    eyebrow: 'Blackout Archive',
    title: 'The Buried Truth',
    description:
      'Follow lizard and Oliver symbols through bunkers, terminals, items, and ruins to uncover what forced humanity into space without turning discovery into a forced campaign.',
    status: 'Foundation',
  },
];
