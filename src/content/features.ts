// Corresponds to the Features section.
export type FeatureCard = {
  icon: string;
  title: string;
  body: string;
};

export const FEATURES: FeatureCard[] = [
  {
    icon: '\u{1F33F}',
    title: 'Lush Biomes',
    body: 'Environments unlike anything in vanilla Minecraft. Vibrant colours, dynamic ecosystems, and terrains that feel genuinely alive.',
  },
  {
    icon: '\u26C8\uFE0F',
    title: 'Seasons & Storms',
    body: 'A living weather system cycles through seasons, rain, snow, and thunder, turning every journey into a fight against the world itself.',
  },
  {
    icon: '\u{1F98E}',
    title: 'New Creatures',
    body: 'The anomaly energy transformed wildlife over fifty years. Hundreds of evolved creatures - fascinating, deadly, and never seen before.',
  },
  {
    icon: '\u{1F300}',
    title: 'New Dimensions',
    body: 'Portal travel to dazzling alternate dimensions that defy natural law. Each one stranger, more beautiful, and more dangerous than the last.',
  },
  {
    icon: '\u26A1',
    title: 'Anomaly Energy',
    body: 'An unknown energy radiates from the impact zone - invisible, unpredictable, and deadly. It warps terrain, twists creatures, and leaves no survivor unchanged.',
  },
  {
    icon: '\u{1F3DB}\uFE0F',
    title: 'Lost Civilisation',
    body: "Piece together humanity's story through ancient ruins, forgotten caches, and journals left behind by those who didn't survive.",
  },
];
