import galleryData from './editable/gallery.json';
import { galleryDataSchema } from '../../contracts/v1/content';
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

export const GALLERY_ITEMS: GalleryItem[] = galleryDataSchema.parse(galleryData);
