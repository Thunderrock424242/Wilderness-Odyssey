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
    description: 'Earth changed without humanity, but it never stopped living.',
    placeholderIcon: '\u{1F33F}',
  },
  {
    tag: '// Anomaly Zone',
    title: 'The Threshold Scars',
    description: 'Where Project Threshold failed, reality still remembers the wound.',
    placeholderIcon: '\u2604\uFE0F',
  },
  {
    tag: '// Dimension',
    title: 'Echo Earth',
    description: 'A familiar world reflected incorrectly. Step through if you dare.',
    placeholderIcon: '\u{1F300}',
  },
  {
    tag: '// Wildlife',
    title: 'Displaced Creatures',
    description: 'Prehistoric, surviving, altered - and not automatically your enemy.',
    placeholderIcon: '\u{1F98E}',
  },
  {
    tag: '// Discovery',
    title: 'The Blackout Trail',
    description: 'Lizard and Oliver symbols mark a truth someone tried to preserve.',
    placeholderIcon: '\u{1F3DB}\uFE0F',
  },
  {
    tag: '// Anomaly',
    title: 'Unknown Energy',
    description: 'It leaks through old excavation sites and rifts. It never truly stops.',
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
