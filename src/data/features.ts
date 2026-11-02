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
    title: 'Bunkers & Research Sites',
    description:
      'Bunkers and research sites are being developed as places to discover survival resources and records of Earth’s collapse, Project Eden, and Reservoir-9.',
    status: 'In development',
  },
  {
    category: 'Creatures',
    eyebrow: 'Adapted life',
    title: 'Life After the Impact',
    description:
      'Meteor-derived material affected organisms differently. Surviving wildlife and altered ecosystems make Earth both hazardous and habitable.',
    status: 'Foundation',
  },
  {
    category: 'Survival',
    eyebrow: 'First session',
    title: 'Survive, Build & Explore',
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
      'Eden’s preservation AI helps reconstruct history from damaged records. Its reason for prioritizing the player and the awakening signal remain unexplained.',
    status: 'Foundation',
  },
  {
    category: 'Dimensions',
    eyebrow: 'Accidental refuge',
    title: 'Echo Earth',
    description:
      'Human settlements have developed on Echo Earth for 150 years. Reconnection begins with communication and regulated research through the single original rift; broader travel remains restricted.',
    status: 'Planned',
  },
  {
    category: 'Lore',
    eyebrow: 'Recovered history',
    title: 'The Buried Truth',
    description:
      'Discover the collapse through records and environmental clues, including the legacy of independent journalists Beal and Nathan. Their evacuation records begin with an unresolved boarding mystery.',
    status: 'Foundation',
  },
];
