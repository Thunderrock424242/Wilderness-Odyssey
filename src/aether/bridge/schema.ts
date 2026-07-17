import { z } from 'zod';

const requestId = z.string().trim().min(8).max(100);
const serverId = z.string().trim().min(1).max(100);
const minecraftUuid = z.string().trim().min(32).max(36);
const playerContextValue = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean()
]);
const playerContext = z.record(z.string().max(80), playerContextValue)
  .refine((value) => Object.keys(value).length <= 40, 'Player context has too many fields.')
  .optional();

export const aetherBridgeRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete_link'),
    requestId,
    serverId,
    code: z.string().trim().min(6).max(32),
    minecraftUuid,
    minecraftName: z.string().trim().min(1).max(64)
  }).strict(),
  z.object({
    action: z.literal('player_question'),
    requestId,
    serverId,
    minecraftUuid,
    message: z.string().trim().min(1).max(2000),
    playerContext
  }).strict(),
  z.object({
    action: z.literal('crash_report'),
    requestId,
    serverId,
    minecraftUuid,
    fileName: z.string().trim().min(1).max(160),
    log: z.string().min(1).max(48_000),
    playerContext
  }).strict(),
  z.object({
    action: z.literal('server_status'),
    requestId,
    serverId
  }).strict()
]);

export type AetherBridgeRequest = z.infer<typeof aetherBridgeRequestSchema>;

export function parseAetherBridgeRequest(input: unknown):
  | { ok: true; request: AetherBridgeRequest }
  | { ok: false; reason: string } {
  const parsed = aetherBridgeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((issue) => issue.message).join('; ')
    };
  }

  return { ok: true, request: parsed.data };
}
