import { z } from 'zod';
import { discordIdSchema, opaqueTokenSchema } from './auth';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const date = z.iso.datetime();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const stats = z.object({ recordedSeconds: count, sessions: count, unknownDurationSessions: count });
export const participantSessionSchema = z.object({ schemaVersion: z.literal('1.0'), user: z.object({ id: discordIdSchema, displayName: z.string().max(100) }), guildId: discordIdSchema, expiresAt: date, campaignIds: z.array(id).max(100).default([]) });
export const participantCampaignSchema = z.object({
  id, title: z.string().max(120), claimedAt: date, collectionActive: z.boolean(),
  instructions: z.string().max(4000), announcement: z.string().max(4000), tasks: z.array(z.string().max(300)).max(20), stats,
});
export const participantHomeSchema = z.object({
  schemaVersion: z.literal('1.0'), user: z.object({ id: discordIdSchema, displayName: z.string().max(100) }),
  stats, campaigns: z.array(participantCampaignSchema).max(100),
  invitations: z.array(z.object({ id, campaignId: id, title: z.string().max(120), expiresAt: date })).max(100),
});
export const participantHistorySchema = z.object({
  schemaVersion: z.literal('1.0'), userId: discordIdSchema,
  sessions: z.array(z.object({ id, campaignId: id, title: z.string().max(120), build: z.string().max(120).nullable(), startedAt: date.nullable(), durationSeconds: count.nullable(), state: z.enum(['recording', 'ended', 'interrupted', 'unknown']) })).max(25),
  nextCursor: z.string().regex(/^\d{1,9}$/).nullable(),
});
export const participantClaimInput = z.object({ token: opaqueTokenSchema }).strict();
export const participantClaimSchema = z.object({ schemaVersion: z.literal('1.0'), claimed: z.literal(true), campaignId: id });
export const participantInviteInput = z.object({ discordUserId: discordIdSchema, campaignId: id, expiresInHours: z.number().int().min(1).max(168) }).strict();
export const participantInviteSchema = z.object({ schemaVersion: z.literal('1.0'), invitationId: id, expiresAt: date, delivery: z.enum(['sent', 'failed', 'unknown']), claimUrl: z.url().max(2048) });
export const participantRevokeInput = z.object({ discordUserId: discordIdSchema, campaignId: id }).strict();
export const participantRevokeSchema = z.object({ schemaVersion: z.literal('1.0'), revoked: z.literal(true) });
export const participantContentInput = z.object({ campaignId: id, instructions: z.string().max(4000), announcement: z.string().max(4000), tasks: z.array(z.string().trim().min(1).max(300)).max(20) }).strict();
export const participantContentSchema = z.object({ schemaVersion: z.literal('1.0'), saved: z.literal(true) });
export const participantQuery = z.object({ cursor: z.string().regex(/^\d{1,9}$/).optional() }).strict();
export type ParticipantHome = z.infer<typeof participantHomeSchema>;
export type ParticipantHistory = z.infer<typeof participantHistorySchema>;
