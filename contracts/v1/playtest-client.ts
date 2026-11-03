import { z } from 'zod';
import { id } from './admin';

export const enrollInput = z.object({ schemaVersion: z.literal('1.0'), installationId: z.uuid(), invitation: z.string().regex(/^[A-Za-z0-9_-]{43}$/), consentVersion: z.literal('1') }).strict();
export const artifactInput = z.object({
  schemaVersion: z.literal('1.0'), artifactId: z.uuid(), campaignId: id, testerId: id,
  collectionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), sessionId: z.uuid(),
  kind: z.enum(['session', 'log', 'crash', 'spark']), scope: z.literal('client'), capturedAt: z.iso.datetime(),
  contentType: z.enum(['application/json', 'text/plain', 'application/x-spark-sampler']), encoding: z.enum(['utf8', 'base64']), content: z.string().max(1536 * 1024),
}).strict();
export const enrollSchema = z.object({ schemaVersion: z.literal('1.0'), testerId: id, campaignId: id, accessToken: z.string().min(32) }).strict();
export const policySchema = z.union([
  z.object({ schemaVersion: z.literal('1.0'), enabled: z.literal(false) }).strict(),
  z.object({ schemaVersion: z.literal('1.0'), enabled: z.literal(true), campaignId: id, testerId: id, collectionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), captureLogs: z.boolean(), captureSpark: z.boolean(), leaseSeconds: z.number().int().min(1).max(60) }).strict(),
]);
export const acceptedSchema = z.object({ schemaVersion: z.literal('1.0'), accepted: z.literal(true), artifactId: z.uuid() }).strict();
