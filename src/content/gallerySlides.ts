// Corresponds to the Gallery section.
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

type GalleryEntry = {
  tag: string;
  title: string;
  description: string;
  imageFile?: string;
  imageAlt?: string;
  placeholderIcon?: string;
  placeholderLabel?: string;
  placeholderHint?: string;
};

// To add a real screenshot: put it in public/gallery, then add imageFile: 'file-name.png'.
// To add another placeholder slot: copy one entry and leave imageFile out.
const GALLERY_ENTRIES: GalleryEntry[] = [
  {
    tag: '// Biome',
    title: 'The Living World',
    description: 'Fifty years of untouched wilderness, stretching to the horizon.',
    placeholderIcon: '\u{1F33F}',
  },
  {
    tag: '// Impact Zone',
    title: 'The Crater Lands',
    description: 'Where the meteor struck, the land remembers.',
    placeholderIcon: '\u2604\uFE0F',
  },
  {
    tag: '// Dimension',
    title: 'The Beyond',
    description: 'A doorway torn open by the impact. Step through if you dare.',
    placeholderIcon: '\u{1F300}',
  },
  {
    tag: '// Wildlife',
    title: 'New Creatures',
    description: 'Evolved, mutated, magnificent - and not always friendly.',
    placeholderIcon: '\u{1F98E}',
  },
  {
    tag: '// Discovery',
    title: 'Lost Civilisation',
    description: 'What was left behind tells a story nobody was meant to find.',
    placeholderIcon: '\u{1F3DB}\uFE0F',
  },
  {
    tag: '// Anomaly',
    title: 'Unknown Energy',
    description: 'It radiates from the crater. It touches everything. It never stops.',
    placeholderIcon: '\u26A1',
  },
];

const toGallerySlide = (entry: GalleryEntry, index: number): GallerySlide => {
  const screenshotNumber = String(index + 1).padStart(2, '0');

  return {
    tag: entry.tag,
    title: entry.title,
    description: entry.description,
    placeholderIcon: entry.placeholderIcon ?? '\u25A3',
    placeholderLabel: entry.placeholderLabel ?? `Screenshot ${screenshotNumber} - ${entry.title}`,
    placeholderHint: entry.placeholderHint ?? 'Visual record pending',
    image: entry.imageFile
      ? {
          src: `gallery/${entry.imageFile}`,
          alt: entry.imageAlt ?? entry.title,
        }
      : undefined,
  };
};

export const GALLERY_SLIDES: GallerySlide[] = GALLERY_ENTRIES.map(toGallerySlide);
