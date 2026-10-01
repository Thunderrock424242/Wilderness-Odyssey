import { z } from 'zod';
export const timestamp = z.iso.datetime({ offset: true });
export const state = z.enum(['online', 'degraded', 'offline', 'maintenance', 'unknown']);
const metric = z.number().finite().nonnegative().nullable();
export const minecraftSchema = z.object({
  status: state, checked_at: timestamp.nullable(), players_online: z.number().int().nonnegative().nullable(), players_max: z.number().int().positive().nullable(),
  tps: z.number().min(0).max(20).nullable(), mspt: metric, minecraft_version: z.string().max(80).nullable(), modpack_version: z.string().max(80).nullable(),
}).refine(value => value.players_online === null || value.players_max === null || value.players_online <= value.players_max);
export const aetherSchema = z.object({ status: state, checked_at: timestamp.nullable(), ollama_reachable: z.boolean().nullable(), inference_available: z.boolean().nullable(), latency_ms: metric, requests_paused: z.boolean().nullable() });
export const observationSchema = z.object({
  schema_version: z.literal('1.0'), server_id: z.string().min(1).max(100), boot_id: z.string().min(1).max(100), sequence: z.number().int().nonnegative(), observed_at: timestamp,
  minecraft: minecraftSchema, aether: aetherSchema,
});
export type Observation = z.infer<typeof observationSchema>;
export const incidentSchema = z.object({
  id: z.string().max(96), component: z.enum(['minecraft', 'ollama', 'aether', 'main_server', 'monitoring']), status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']), summary: z.string().max(500),
  timestamps: z.object({ started_at: timestamp, updated_at: timestamp, resolved_at: timestamp.nullable() }),
});
export type Incident = z.infer<typeof incidentSchema>;
export const publicStatusV2Schema = z.object({
  schema_version: z.literal('2.0'), generated_at: timestamp, stale_after_seconds: z.number().int().min(15).max(300), minecraft: minecraftSchema, aether: aetherSchema,
  maintenance: z.object({ active: z.boolean(), affected_components: z.array(z.enum(['minecraft', 'aether'])).max(2), message: z.string().max(500), starts_at: timestamp.nullable(), ends_at: timestamp.nullable() }),
  incidents: z.array(incidentSchema).max(30), announcements: z.array(z.object({ id: z.string().max(96), title: z.string().max(180), message: z.string().max(2000), published_at: timestamp, url: z.url().optional() })).max(20),
});
export type PublicStatus = z.infer<typeof publicStatusV2Schema>;
export function unknownMinecraft(): PublicStatus['minecraft'] { return { status: 'unknown', checked_at: null, players_online: null, players_max: null, tps: null, mspt: null, minecraft_version: null, modpack_version: null }; }
export function unknownAether(): PublicStatus['aether'] { return { status: 'unknown', checked_at: null, ollama_reachable: null, inference_available: null, latency_ms: null, requests_paused: null }; }
