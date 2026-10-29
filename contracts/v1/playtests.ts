import { z } from 'zod';
import { revision } from './admin';
import { timestamp } from './status';

const version = z.literal('1.0');
const cursor = z.string().max(200).nullable();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const collectionId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const campaignSchema = z.object({
  id, title: z.string().trim().min(1).max(120), build: z.string().trim().min(1).max(120),
  collect: z.boolean(), collectionId: collectionId.nullable(), changedAt: timestamp, createdAt: timestamp, revision,
  retentionDays: z.number().int().min(1).max(90),
}).refine(value => value.collect === (value.collectionId !== null));
export const testerSchema = z.object({
  id, label: z.string().min(1).max(100), permission: z.enum(['allowed', 'paused', 'revoked']), collectionId: collectionId.nullable(), revision, changedAt: timestamp,
  reportedName: z.string().max(100).nullable(), lastSeenAt: timestamp.nullable(), lastUploadAt: timestamp.nullable(),
  acknowledgement: z.object({ collectionId, state: z.enum(['recording', 'ended', 'interrupted']), observedAt: timestamp }).nullable(),
  uploadErrorAt: timestamp.nullable(), droppedArtifacts: count.nullable(),
});
export const artifactSummarySchema = z.object({
  id, kind: z.enum(['session', 'log', 'crash', 'spark']), scope: z.literal('client'), capturedAt: timestamp,
  durationSeconds: count.nullable(), bytes: count.max(1024 * 1024), redacted: z.boolean(),
}).refine(value => !['log', 'crash', 'session'].includes(value.kind) || value.redacted);
export const serverProfileSchema = z.object({ id, scope: z.literal('server'), capturedAt: timestamp, durationSeconds: count.nullable(), bytes: count.max(1024 * 1024) });
export const playtestSessionSchema = z.object({
  id, campaignId: id, testerId: id, build: z.string().min(1).max(120), reportedModVersion: z.string().max(120).nullable().optional(), startedAt: timestamp, endedAt: timestamp.nullable(),
  durationSeconds: count.nullable(), mode: z.enum(['singleplayer', 'multiplayer', 'unknown']), state: z.enum(['recording', 'ended', 'interrupted']),
  sparkStatus: z.enum(['recording', 'unavailable', 'busy', 'saved', 'failed', 'idle']), droppedArtifacts: count.nullable(), uploadErrors: count.nullable(),
  notes: z.string().max(4000), revision, artifacts: z.array(artifactSummarySchema).max(100), sharedServerProfiles: z.array(serverProfileSchema).max(20),
}).refine(value => value.sparkStatus !== 'saved' || value.artifacts.some(artifact => artifact.kind === 'spark'));
export const campaignEnvelope = z.object({ schemaVersion: version, campaign: campaignSchema });
export const campaignListSchema = z.object({ schemaVersion: version, campaigns: z.array(campaignSchema).max(50), nextCursor: cursor });
export const campaignDetailSchema = campaignEnvelope.extend({ testers: z.array(testerSchema).max(50), nextCursor: cursor });
export const testerHistoryGroupSchema = z.object({ campaign: campaignSchema, tester: testerSchema, sessions: z.array(playtestSessionSchema).max(50) });
export const testerHistorySchema = z.object({ schemaVersion: version, testerId: id, groups: z.array(testerHistoryGroupSchema).max(50), nextCursor: cursor });
export const profileSchema = testerHistoryGroupSchema.extend({ schemaVersion: version, nextCursor: cursor });
export const testerEnvelope = z.object({ schemaVersion: version, campaignId: id, tester: testerSchema });
export const sessionEnvelope = z.object({ schemaVersion: version, campaignId: id, testerId: id, session: playtestSessionSchema });
export const deletionSchema = z.object({ schemaVersion: version, campaignId: id, testerId: id, deleted: z.literal(true) });
const publicOrigin = z.url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/'; });
export const invitationSchema = z.object({ schemaVersion: version, campaignId: id, invitation: z.object({ id, code: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/), expiresAt: timestamp, testerLabel: z.string().min(1).max(100), publicApiOrigin: publicOrigin }) });
const artifactOwner = { schemaVersion: version, campaignId: id, testerId: id, sessionId: id, artifactId: id };
export const privateArtifactSchema = z.discriminatedUnion('encoding', [
  z.object({ ...artifactOwner, kind: z.enum(['log', 'crash', 'session']), scope: z.literal('client'), redacted: z.literal(true), contentType: z.literal('text/plain'), encoding: z.literal('utf8'), content: z.string().max(256 * 1024).refine(value => new TextEncoder().encode(value).byteLength <= 256 * 1024) }),
  z.object({ ...artifactOwner, kind: z.literal('spark'), scope: z.enum(['client', 'server']), redacted: z.boolean(), contentType: z.literal('application/x-spark-sampler'), encoding: z.literal('base64'), content: z.string().min(4).max(1398104).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).refine(value => value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) <= 1024 * 1024) }),
]);
export const createCampaignInput = z.object({ title: z.string().trim().min(1).max(120), build: z.string().trim().min(1).max(120), retentionDays: z.number().int().min(1).max(90) }).strict();
export const collectionInput = z.object({ collect: z.boolean(), revision }).strict();
export const invitationInput = z.object({ testerLabel: z.string().trim().min(1).max(100), testerId: id.optional(), expiresInHours: z.number().int().min(1).max(168), revision }).strict();
export const testerPermissionInput = z.object({ permission: z.enum(['allowed', 'paused', 'revoked']), revision }).strict();
export const sessionNotesInput = z.object({ notes: z.string().max(4000), revision }).strict();
export const deleteDataInput = z.object({ revision, confirmDelete: z.literal(true) }).strict();
export type Campaign = z.infer<typeof campaignSchema>;
export type Tester = z.infer<typeof testerSchema>;
export type PlaytestSession = z.infer<typeof playtestSessionSchema>;
export type HistoryGroup = z.infer<typeof testerHistoryGroupSchema>;
export type PrivateArtifact = z.infer<typeof privateArtifactSchema>;
