import { z } from 'zod';

export const timestamp = z.iso.datetime({ offset: true });
export const serviceName = z.enum(['minecraft', 'aether']);
export const maintenanceSchema = z.object({
  active: z.boolean(), message: z.string().max(500),
  startsAt: timestamp.nullable(), endsAt: timestamp.nullable(),
  services: z.array(serviceName).max(2),
});
export const incidentSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,96}$/),
  title: z.string().max(180), message: z.string().max(2000),
  severity: z.enum(['info', 'minor', 'major', 'critical']),
  state: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
  services: z.array(serviceName).max(2), updatedAt: timestamp,
});
export const publicStatusSchema = z.object({
  schemaVersion: z.literal('1.0'),
  observedAt: timestamp,
  staleAfterSeconds: z.number().int().min(15).max(300),
  minecraft: z.object({
    state: z.enum(['online', 'offline', 'degraded', 'unknown']),
    players: z.object({ online: z.number().int().nonnegative(), max: z.number().int().positive() }).nullable(),
    tps: z.number().min(0).max(20).nullable(),
    mspt: z.number().nonnegative().nullable(),
    minecraftVersion: z.string().max(80).nullable(),
    modpackVersion: z.string().max(80).nullable(),
    loader: z.string().max(80).nullable(),
  }),
  aether: z.object({
    ollama: z.enum(['ready', 'starting', 'unavailable', 'unknown']),
    inference: z.enum(['ready', 'starting', 'unavailable', 'unknown']),
    requestsPaused: z.boolean().nullable(),
    responseLatency: z.object({
      p50Ms: z.number().nonnegative(), p95Ms: z.number().nonnegative(),
      sampleCount: z.number().int().positive(), windowSeconds: z.number().int().positive().max(86400),
      observedAt: timestamp,
    }).nullable(),
  }),
  maintenance: maintenanceSchema,
  incidents: z.array(incidentSchema).max(30),
});
export type PublicStatus = z.infer<typeof publicStatusSchema>;