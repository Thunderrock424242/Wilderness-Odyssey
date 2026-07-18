import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TRANSMISSION_TYPES } from './data/site';

const transmissions = defineCollection({
  loader: glob({ base: './src/content/transmissions', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().min(3),
    description: z.string().min(10).max(320),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    type: z.enum(TRANSMISSION_TYPES),
    author: z.string().min(1),
    tags: z.array(z.string().min(1)).min(1),
    coverImage: z.string().startsWith('/').optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    version: z.string().optional(),
    relatedRoadmapItem: z.string().optional(),
    galleryImages: z
      .array(
        z.object({
          src: z.string().startsWith('/'),
          alt: z.string().min(3),
          caption: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

export const collections = { transmissions };
