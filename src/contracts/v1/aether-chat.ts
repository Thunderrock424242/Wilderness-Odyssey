import { z } from 'zod';

/** Shared gateway contract. Stateless dialogue, without Minecraft game context. */
export const chatRequestSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), requestId: z.uuid(),
  serverId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  surface: z.enum(['discord', 'minecraft']),
  principalId: z.string().regex(/^[a-f0-9]{64}$/), scopeId: z.string().regex(/^[a-f0-9]{64}$/),
  message: z.string().min(1).max(2000).refine(value => !!value.trim() && !value.includes('\0')),
});
export const chatResponseSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), requestId: z.uuid(), serverId: z.string().max(64),
  model: z.string().max(120), success: z.literal(true),
  response: z.string().min(1).max(2000).refine(value => !!value.trim() && !value.includes('\0')),
});
