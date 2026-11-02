import { z } from 'zod';
import { sessionSchema } from './admin';
import { timestamp } from './status';

export const discordIdSchema = z.string().regex(/^\d{17,22}$/);
export const opaqueTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const redirectInput = z.object({ redirectUri: z.url().max(2048) }).strict();
export const discordStartInput = redirectInput.extend({ remember: z.boolean().optional() }).strict();
export const discordStartSchema = z.object({
  schemaVersion: z.literal('1.0'), authorizationUrl: z.url().max(4096),
  flowToken: opaqueTokenSchema, expiresAt: timestamp,
});
export const discordCallbackInput = redirectInput.extend({
  code: z.string().regex(/^[A-Za-z0-9._-]{1,2048}$/), state: opaqueTokenSchema, flowToken: opaqueTokenSchema,
}).strict();
export const discordCallbackSchema = z.object({
  schemaVersion: z.literal('1.0'), sessionToken: opaqueTokenSchema,
  userId: discordIdSchema, guildId: discordIdSchema, expiresAt: timestamp,
  rememberToken: opaqueTokenSchema.optional(), rememberExpiresAt: timestamp.optional(),
});
export const rememberRefreshInput = z.object({ rememberToken: opaqueTokenSchema }).strict();
export const rememberRefreshSchema = discordCallbackSchema.required({ rememberToken: true, rememberExpiresAt: true });
export const discordSessionSchema = sessionSchema.extend({ guildId: discordIdSchema, expiresAt: timestamp });
export const logoutSchema = z.object({ schemaVersion: z.literal('1.0'), revoked: z.literal(true) });
export type StaffCredential = { kind: 'access'; assertion: string } | { kind: 'discord'; token: string } | { kind: 'participant'; token: string };
