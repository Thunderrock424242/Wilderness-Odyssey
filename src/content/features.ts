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
    title: 'Displaced Creatures',
    body: 'Prehistoric animals from broken layers of Earth history now share the wilderness with surviving wildlife, mutations, and things that came from Echo Earth.',
  },
  {
    icon: '\u{1F300}',
    title: 'Echo Earth',
    body: 'Enter a damaged reflection of Earth where familiar terrain repeats incorrectly, ruins stand where they should not, and reality cannot be trusted.',
  },
  {
    icon: '\u26A1',
    title: 'Anomaly Energy',
    body: 'Meteor material activated by Project Threshold still weakens reality, feeds rift storms, contaminates old sites, and changes anything exposed for too long.',
  },
  {
    icon: '\u{1F3DB}\uFE0F',
    title: 'The Buried Truth',
    body: 'Follow Blackout Archive symbols through bunkers, safehouses, terminals, and containment ruins to uncover what really forced humanity into space.',
  },
];
