export type GalleryImage = {
  src: string;
  alt: string;
};

export type GallerySlide = {
  tag: string;
  title: string;
  description: string;
  placeholderIcon: string;
  placeholderLabel: string;
  placeholderHint: string;
  image?: GalleryImage;
};

// Add screenshots to public/gallery, then set image: { src: 'gallery/file-name.png', alt: '...' }.
export const GALLERY_SLIDES: GallerySlide[] = [
  {
    tag: '// Biome',
    title: 'The Living World',
    description: 'Fifty years of untouched wilderness, stretching to the horizon.',
    placeholderIcon: '\u{1F33F}',
    placeholderLabel: 'Screenshot 01 - Lush Biome',
    placeholderHint: 'Visual record pending',
  },
  {
    tag: '// Impact Zone',
    title: 'The Crater Lands',
    description: 'Where the meteor struck, the land remembers.',
    placeholderIcon: '\u2604\uFE0F',
    placeholderLabel: 'Screenshot 02 - Impact Zone',
    placeholderHint: 'Visual record pending',
  },
  {
    tag: '// Dimension',
    title: 'The Beyond',
    description: 'A doorway torn open by the impact. Step through if you dare.',
    placeholderIcon: '\u{1F300}',
    placeholderLabel: 'Screenshot 03 - Dimension',
    placeholderHint: 'Visual record pending',
  },
  {
    tag: '// Wildlife',
    title: 'New Creatures',
    description: 'Evolved, mutated, magnificent - and not always friendly.',
    placeholderIcon: '\u{1F98E}',
    placeholderLabel: 'Screenshot 04 - Creatures',
    placeholderHint: 'Visual record pending',
  },
  {
    tag: '// Discovery',
    title: 'Lost Civilisation',
    description: 'What was left behind tells a story nobody was meant to find.',
    placeholderIcon: '\u{1F3DB}\uFE0F',
    placeholderLabel: 'Screenshot 05 - Ruins',
    placeholderHint: 'Visual record pending',
  },
  {
    tag: '// Anomaly',
    title: 'Unknown Energy',
    description: 'It radiates from the crater. It touches everything. It never stops.',
    placeholderIcon: '\u26A1',
    placeholderLabel: 'Screenshot 06 - Anomaly',
    placeholderHint: 'Visual record pending',
  },
];
