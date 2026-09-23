import { z } from 'zod';
import { incidentSchema, maintenanceSchema, publicStatusSchema, timestamp } from './status';

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/);
export const uuid = z.uuid();
export const revision = z.string().min(1).max(120);
export const reason = z.string().trim().min(10).max(1000);
export const roleSchema = z.enum(['viewer', 'moderator', 'administrator']);
export const capabilitySchema = z.enum(['status:read', 'server:write', 'players:read', 'players:write', 'reports:read', 'reports:write', 'models:read', 'models:write']);
export type Capability = z.infer<typeof capabilitySchema>;
export const roleCapabilities: Record<z.infer<typeof roleSchema>, readonly Capability[]> = {
  viewer: ['status:read', 'models:read'],
  moderator: ['status:read', 'models:read', 'players:read', 'players:write', 'reports:read', 'reports:write'],
  administrator: capabilitySchema.options,
};
export const sessionSchema = z.object({
  schemaVersion: z.literal('1.0'),
  user: z.object({ id: z.string().min(1).max(200), displayName: z.string().max(100), role: roleSchema }),
  capabilities: z.array(capabilitySchema).max(8),
});
export const browserSessionSchema = sessionSchema.extend({ csrfToken: z.string().min(1) });
export const operationSchema = z.object({
  id, kind: z.string().max(80),
  state: z.enum(['requested', 'approved', 'running', 'succeeded', 'failed', 'cancelled']),
  summary: z.string().max(1000), requestedAt: timestamp, updatedAt: timestamp,
});
export const mutationSchema = z.object({ schemaVersion: z.literal('1.0'), operation: operationSchema });
export const overviewSchema = z.object({
  schemaVersion: z.literal('1.0'), status: publicStatusSchema,
  maintenanceRevision: revision, aiRequestsRevision: revision,
  performance: z.array(z.object({ observedAt: timestamp, tps: z.number().min(0).max(20).nullable(), mspt: z.number().nonnegative().nullable(), players: z.number().int().nonnegative().nullable() })).max(120),
  operations: z.array(operationSchema).max(50),
  allowedServiceOperations: z.array(z.object({ id, label: z.string().max(100), description: z.string().max(500) })).max(20),
});
export const incidentsSchema = z.object({ schemaVersion: z.literal('1.0'), incidents: z.array(incidentSchema.extend({ internalNote: z.string().max(4000).nullable() })).max(100) });
export const playerSchema = z.object({ uuid, username: z.string().min(1).max(32), verifiedAt: timestamp });
export const historySchema = z.object({ id, action: z.string().max(100), reason: z.string().max(1000), createdAt: timestamp, moderator: z.string().max(100) });
export const restrictionSchema = z.object({ id, scope: z.enum(['aether']), reason: z.string().max(1000), expiresAt: timestamp.nullable(), revokedAt: timestamp.nullable(), revision });
export const appealSchema = z.object({ id, state: z.enum(['open', 'accepted', 'rejected', 'escalated']), message: z.string().max(4000), createdAt: timestamp, revision });
export const playersSchema = z.object({ schemaVersion: z.literal('1.0'), players: z.array(playerSchema).max(50), nextCursor: z.string().max(200).nullable() });
export const playerDetailSchema = z.object({ schemaVersion: z.literal('1.0'), player: playerSchema, history: z.array(historySchema).max(100), restrictions: z.array(restrictionSchema).max(50), appeals: z.array(appealSchema).max(50) });
export const reportSummarySchema = z.object({ id, player: playerSchema, summary: z.string().max(500), state: z.enum(['open', 'resolved', 'escalated']), submittedAt: timestamp, revision });
export const reportsSchema = z.object({ schemaVersion: z.literal('1.0'), reports: z.array(reportSummarySchema).max(50), nextCursor: z.string().max(200).nullable() });
export const reportDetailSchema = z.object({
  schemaVersion: z.literal('1.0'), report: reportSummarySchema,
  excerpts: z.array(z.object({ speaker: z.enum(['player', 'aether']), text: z.string().max(6000), sentAt: timestamp })).max(40),
  provenance: z.string().min(1).max(500), retentionUntil: timestamp,
  actions: z.array(historySchema).max(100),
});
const settingRange = z.object({ min: z.number().finite(), max: z.number().finite() });
export const inferenceSettingsSchema = z.object({ temperature: z.number().min(0).max(2), numPredict: z.number().int().min(1).max(8192), numCtx: z.number().int().min(512).max(131072) }).strict();
export const modelsSchema = z.object({
  schemaVersion: z.literal('1.0'), activeModelId: id.nullable(), revision,
  models: z.array(z.object({ id, name: z.string().max(120), approved: z.literal(true), readiness: z.enum(['ready', 'loading', 'unavailable']), detail: z.string().max(500) })).max(50),
  settings: inferenceSettingsSchema,
  permittedSettings: z.object({ temperature: settingRange, numPredict: settingRange, numCtx: settingRange }),
});
export const maintenanceInput = maintenanceSchema.extend({ reason, revision }).strict();
export const aiRequestsInput = z.object({ paused: z.boolean(), reason, revision }).strict();
export const serviceInput = z.object({ operationId: id, reason }).strict();
export const warningInput = z.object({ reason }).strict();
export const restrictionInput = z.object({ reason, expiresAt: timestamp, scope: z.literal('aether') }).strict();
export const revokeInput = z.object({ reason, revision }).strict();
export const appealInput = z.object({ decision: z.enum(['accepted', 'rejected', 'escalated']), reason, revision }).strict();
export const reportInput = z.object({ decision: z.enum(['resolved', 'escalated']), reason, revision }).strict();
export const modelInput = z.object({ modelId: id, reason, revision }).strict();
export const settingsInput = z.object({ settings: inferenceSettingsSchema, reason, revision }).strict();
export type BrowserSession = z.infer<typeof browserSessionSchema>;
export type Operation = z.infer<typeof operationSchema>;