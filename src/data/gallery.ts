import type { FeatureCategory } from './features';

export type GalleryItem = {
  id: string;
  category: FeatureCategory | 'Anomaly';
  title: string;
  caption: string;
  version: string;
  relatedTransmission?: string;
  lore?: string;
  image?: string;
  alt?: string;
  placeholderSymbol: string;
};

export const GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'living-world',
    category: 'World Generation',
    title: 'The Living World',
    caption: 'Earth changed without humanity, but it never stopped living.',
    version: 'Pre-alpha',
    relatedTransmission: 'version-0-1-0-takes-shape',
    placeholderSymbol: 'BIO-01',
  },
  {
    id: 'threshold-scars',
    category: 'Anomaly',
    title: 'The Threshold Scars',
    caption: 'Where Project Threshold failed, reality still remembers the wound.',
    version: 'Pre-alpha',
    lore: 'Visual record pending from a stable anomaly-zone build.',
    placeholderSymbol: 'ANM-02',
  },
  {
    id: 'echo-earth',
    category: 'Dimensions',
    title: 'Echo Earth',
    caption: 'A familiar world reflected incorrectly. Step through if you dare.',
    version: 'Planned',
    placeholderSymbol: 'ECH-03',
  },
  {
    id: 'displaced-creatures',
    category: 'Creatures',
    title: 'Displaced Creatures',
    caption: 'Prehistoric, surviving, altered — and not automatically your enemy.',
    version: 'Pre-alpha',
    placeholderSymbol: 'BIO-04',
  },
  {
    id: 'blackout-trail',
    category: 'Lore',
    title: 'The Blackout Trail',
    caption: 'Lizard and Oliver symbols mark a truth someone tried to preserve.',
    version: 'Canon mapped',
    placeholderSymbol: 'ARC-05',
  },
  {
    id: 'unknown-energy',
    category: 'Anomaly',
    title: 'Unknown Energy',
    caption: 'It leaks through old excavation sites and rifts. It never truly stops.',
    version: 'Pre-alpha',
    placeholderSymbol: 'NRG-06',
  },
];
