import { z } from 'zod';
import { id, reason, revision, mutationSchema } from './admin';

export const enrollInput = z.object({ schemaVersion: z.literal('1.0'), installationId: z.uuid(), invitation: z.string().regex(/^[A-Za-z0-9_-]{43}$/), consentVersion: z.literal('1') }).strict();
export const artifactInput = z.object({
  schemaVersion: z.literal('1.0'), artifactId: z.uuid(), campaignId: id, testerId: id,
  collectionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), sessionId: z.uuid(),
  kind: z.enum(['session', 'log', 'crash', 'spark']), scope: z.literal('client'), capturedAt: z.iso.datetime(),
  contentType: z.enum(['application/json', 'text/plain', 'application/x-spark-sampler']), encoding: z.enum(['utf8', 'base64']), content: z.string().max(1536 * 1024),
}).strict();
// The shared contract leaves game/build metadata extensible. Preserve it as private file content.
export const sessionContent = z.object({ state: z.enum(['recording', 'ended', 'interrupted']), sparkStatus: z.enum(['recording', 'unavailable', 'busy', 'saved', 'failed', 'idle']) }).passthrough();
export const campaignInput = z.object({ id, title: z.string().trim().min(1).max(100), reason }).strict();
export const collectionInput = z.object({ revision, enabled: z.boolean(), captureLogs: z.boolean(), captureSpark: z.boolean(), reason }).strict();
export const testerInput = z.object({ testerId: id, discordUserId: z.string().regex(/^\d{17,22}$/), displayName: z.string().trim().min(1).max(100), reason }).strict();
export const inviteInput = z.object({ id: z.uuid(), testerId: id, revision, expiresInSeconds: z.number().int().min(60).max(86400), reason }).strict();
export const revokeInput = z.object({ revision, reason }).strict();
export const installationRevokeInput = z.object({ campaignId: id, testerId: id, installationId: z.uuid(), revision, reason }).strict();
export const pageInput = z.object({ cursor: z.string().regex(/^\d{1,7}$/).optional() }).strict();
export const artifactsQuery = pageInput.extend({ sessionId: z.uuid().optional(), kind: artifactInput.shape.kind.optional() }).strict();
export type ArtifactInput = z.infer<typeof artifactInput>;

const timestamp = z.iso.datetime();
export const campaignSchema = z.object({ id, title: z.string().max(100), enabled: z.boolean(), collectionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).nullable(), captureLogs: z.boolean(), captureSpark: z.boolean(), revision, createdAt: timestamp, updatedAt: timestamp });
export const testerSchema = z.object({ id, campaignId: id, discordUserId: z.string().regex(/^\d{17,22}$/), displayName: z.string().max(100), revision, approvedAt: timestamp, revokedAt: timestamp.nullable() });
export const invitationSchema = z.object({ id: z.uuid(), campaignId: id, testerId: id, expiresAt: timestamp, redeemedAt: timestamp.nullable(), revokedAt: timestamp.nullable(), revision });
export const installationSchema = z.object({ installationId: z.uuid(), campaignId: id, testerId: id, consentVersion: z.literal('1'), enrolledAt: timestamp, lastSeenAt: timestamp.nullable(), revokedAt: timestamp.nullable(), revision });
export const artifactSchema = artifactInput.omit({ content: true, encoding: true, schemaVersion: true }).extend({ receivedAt: timestamp, bytes: z.number().int().nonnegative().max(1024 * 1024), revision, deletedAt: timestamp.nullable() });
export const sessionSchema = z.object({ id: z.uuid(), campaignId: id, testerId: id, collectionId: z.string(), firstArtifactAt: timestamp, lastArtifactAt: timestamp, state: z.enum(['recording', 'ended', 'interrupted', 'unknown']), sparkStatus: z.enum(['recording', 'unavailable', 'busy', 'saved', 'failed', 'idle', 'unknown']), observedAt: timestamp.nullable(), observedReceivedAt: timestamp.nullable() });
export const sessionViewSchema = sessionSchema.extend({ collectionActive: z.boolean(), observation: z.enum(['waiting', 'recording', 'stop requested', 'stopped', 'offline', 'ended', 'interrupted']), lastSeenAt: timestamp.nullable(), sparkArtifactCount: z.number().int().nonnegative() });
export const listSchemas = {
  campaigns: campaignSchema, testers: testerSchema, invitations: invitationSchema,
  installations: installationSchema, sessions: sessionViewSchema, artifacts: artifactSchema,
};
export const invitationIssueSchema = mutationSchema.extend({ invitation: z.object({ id: z.uuid(), invitation: z.string().regex(/^[A-Za-z0-9_-]{43}$/), expiresAt: timestamp }).nullable() });
export const enrollSchema = z.object({ schemaVersion: z.literal('1.0'), testerId: id, campaignId: id, accessToken: z.string().min(32) }).strict();
export const policySchema = z.union([
  z.object({ schemaVersion: z.literal('1.0'), enabled: z.literal(false) }).strict(),
  z.object({ schemaVersion: z.literal('1.0'), enabled: z.literal(true), campaignId: id, testerId: id, collectionId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), captureLogs: z.boolean(), captureSpark: z.boolean(), leaseSeconds: z.number().int().min(1).max(60) }).strict(),
]);
export const acceptedSchema = z.object({ schemaVersion: z.literal('1.0'), accepted: z.literal(true), artifactId: z.uuid() }).strict();
