import { z } from 'zod';

export const contentId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(96);
export const contentRevision = z.string().min(1).max(120);
const text = (max: number) => z.string().trim().min(1).max(max);
export const publicLink = z.string().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}, 'Use a complete HTTPS link.');
export const imagePath = z.string().regex(/^\/images\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|gif)$/).max(512).refine(value => !value.includes('..'));
const previewPath = z.string().regex(/^\/api\/admin\/v1\/content\/media\/[a-zA-Z0-9_-]{1,96}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/).refine(value => Number.isFinite(Date.parse(value)));
const galleryImage = z.object({ src: imagePath, alt: text(500), caption: z.string().max(1000).optional(), previewUrl: previewPath.optional() });
export const transmissionInputSchema = z.object({
  slug: contentId, title: text(200), description: text(500), publishedAt: date, updatedAt: date.optional(),
  type: z.enum(['news', 'blog', 'devlog', 'patch', 'lore', 'announcement']), author: text(100),
  tags: z.array(text(60)).min(1).max(30), coverImage: imagePath.optional(), coverPreviewUrl: previewPath.optional(),
  featured: z.boolean(), draft: z.boolean(), version: z.string().max(100).optional(),
  relatedRoadmapItem: contentId.optional(), galleryImages: z.array(galleryImage).max(100), bodyMarkdown: z.string().min(1).max(1_500_000),
}).strict();
export const transmissionSchema = transmissionInputSchema.extend({ id: contentId, revision: contentRevision, sourceRevision: contentRevision.nullable() }).strip();
export const transmissionSummarySchema = transmissionSchema.omit({ bodyMarkdown: true, galleryImages: true }).extend({ galleryImageCount: z.number().int().min(0).max(100) });
export const mediaSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/), src: imagePath, previewUrl: previewPath, fileName: text(160), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']), kind: z.literal('image') });
export const transmissionEnvelope = z.object({ schemaVersion: z.literal('1.0'), transmission: transmissionSchema, media: z.array(mediaSchema).max(200).optional() });
export const transmissionListSchema = z.object({ schemaVersion: z.literal('1.0'), records: z.array(transmissionSummarySchema).max(1000) });
export const contentSaveInput = z.object({ content: transmissionInputSchema, revision: contentRevision.nullable(), sourceRevision: contentRevision.nullable() }).strict();
export const publicationSchema = z.object({
  state: z.enum(['draft-saved', 'requested', 'awaiting-review', 'awaiting-approval', 'deploying', 'published', 'failed', 'cancelled']),
  message: z.string().max(1000), operationId: z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/).optional(),
  pullRequestUrl: publicLink.refine(value => new URL(value).hostname === 'github.com').optional(),
  deploymentUrl: publicLink.optional(),
});
export const contentMutationSchema = transmissionEnvelope.extend({ publishing: publicationSchema.extend({ state: z.literal('draft-saved') }).omit({ operationId: true, pullRequestUrl: true, deploymentUrl: true }) });
export const publicationInput = z.object({ revision: contentRevision, action: z.enum(['publish', 'unpublish']), acknowledgePublicSource: z.literal(true) }).strict();
export const deleteContentInput = z.object({ revision: contentRevision }).strict();
export const featureCategories = ['World Generation', 'Weather', 'Water System', 'Structures', 'Creatures', 'Survival', 'Performance', 'Aether', 'Dimensions', 'Lore'] as const;
export const siteDataSchema = z.object({
  name: text(100), tagline: text(200), description: text(1000), status: text(500), version: text(100), minecraftVersion: text(100), neoForgeVersion: text(100),
  downloadStatus: text(500), featuredTransmission: contentId,
  links: z.object({ curseForge: publicLink, discord: publicLink, github: publicLink }).strict(),
  social: z.object({ title: text(200), description: text(500), image: imagePath }).strict(), footer: text(500), author: text(100),
}).strict();
export const roadmapDataSchema = z.array(z.object({
  id: contentId, phase: text(100), title: text(200), description: text(2000), category: z.enum(featureCategories),
  status: z.enum(['Planned', 'Research', 'In Development', 'Testing', 'Blocked', 'Complete']), progress: z.number().min(0).max(100),
  progressLabel: text(500), priority: z.enum(['Critical', 'High', 'Medium', 'Later']), milestone: text(500),
  dependencies: z.array(text(1000)).max(100), relatedTransmissions: z.array(contentId).max(100),
  tasks: z.array(z.object({ label: text(1000), complete: z.boolean() }).strict()).max(100),
  exitConditions: z.array(text(1000)).max(100), communitySignal: text(1000), image: imagePath.optional(),
}).strict()).max(200).refine(records => new Set(records.map(record => record.id)).size === records.length, 'Use unique roadmap IDs.');
export const galleryDataSchema = z.array(z.object({
  id: contentId, category: z.enum([...featureCategories, 'Anomaly']), title: text(200), caption: text(2000), version: text(100),
  relatedTransmission: contentId.optional(), lore: z.string().max(4000).optional(), image: imagePath.optional(), alt: z.string().max(500).optional(), placeholderSymbol: text(100),
}).strict().refine(record => !record.image || Boolean(record.alt?.trim()), 'Describe the gallery image.')).max(500).refine(records => new Set(records.map(record => record.id)).size === records.length, 'Use unique gallery IDs.');
const pageBase = { schemaVersion: z.literal('1.0'), revision: contentRevision, sourceRevision: contentRevision.nullable() };
export const pageDocumentSchema = z.discriminatedUnion('kind', [
  z.object({ ...pageBase, kind: z.literal('site'), data: siteDataSchema }),
  z.object({ ...pageBase, kind: z.literal('roadmap'), data: roadmapDataSchema }),
  z.object({ ...pageBase, kind: z.literal('gallery'), data: galleryDataSchema }),
]);
export const pageSaveInput = z.object({ revision: contentRevision, sourceRevision: contentRevision.nullable(), document: pageDocumentSchema }).strict();
export type Transmission = z.infer<typeof transmissionSchema>;
export type PageDocument = z.infer<typeof pageDocumentSchema>;
