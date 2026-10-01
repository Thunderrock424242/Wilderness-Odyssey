import { z } from 'zod';
import type { AccessTrust } from './auth';

const origin = z.string().url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; });
const optional = (value: string | undefined) => value?.trim() || undefined;
export function loadConnectedConfig(env: NodeJS.ProcessEnv) {
  const enabled = env.CONNECTED_SERVICES_ENABLED === 'true';
  const schema = z.object({
    enabled: z.boolean(), mainOrigin: origin.optional(), readToken: z.string().min(32).optional(), writeToken: z.string().min(32).optional(), ingestToken: z.string().min(32).optional(), identityToken: z.string().min(32).optional(),
    intervalMs: z.coerce.number().int().min(5000).max(300000), failures: z.coerce.number().int().min(2).max(20), recoveries: z.coerce.number().int().min(2).max(20),
    staleSeconds: z.coerce.number().int().min(15).max(300), serverId: z.string().min(1).max(100),
  });
  const parsed = schema.safeParse({ enabled, mainOrigin: optional(env.MAIN_SERVER_ORIGIN), readToken: optional(env.MAIN_SERVER_READ_TOKEN), writeToken: optional(env.MAIN_SERVER_WRITE_TOKEN), ingestToken: optional(env.MAIN_SERVER_INGEST_TOKEN), identityToken: optional(env.IDENTITY_SERVICE_TOKEN), intervalMs: optional(env.MONITOR_INTERVAL_MS) ?? 30000, failures: optional(env.MONITOR_FAILURE_THRESHOLD) ?? 3, recoveries: optional(env.MONITOR_RECOVERY_THRESHOLD) ?? 2, staleSeconds: optional(env.MONITOR_STALE_SECONDS) ?? 120, serverId: optional(env.MAIN_SERVER_ID) ?? 'official' });
  if (!parsed.success) throw new Error('Invalid connected services configuration. Check HTTPS origin, token lengths, and monitoring limits.');
  if (enabled && parsed.data.mainOrigin && !parsed.data.readToken) throw new Error('Main-server monitoring requires a read credential.');
  const credentials = [parsed.data.readToken, parsed.data.writeToken, parsed.data.ingestToken, parsed.data.identityToken, optional(env.METRICS_TOKEN), optional(env.AETHER_MINECRAFT_BRIDGE_SECRET)].filter(Boolean);
  if (new Set(credentials).size !== credentials.length) throw new Error('Use a different credential for every connected-service scope.');
  if (parsed.data.intervalMs >= parsed.data.staleSeconds * 1000) throw new Error('Monitoring interval must be shorter than its freshness limit.');
  if (env.CONNECTED_ENVIRONMENT && !['preview', 'production'].includes(env.CONNECTED_ENVIRONMENT)) throw new Error('Unknown connected environment.');
  const trust: AccessTrust = { issuer: optional(env.ACCESS_TEAM_DOMAIN) ?? '', machineAudience: optional(env.BACKEND_ACCESS_AUDIENCE) ?? '', staffAudience: optional(env.WEBSITE_ACCESS_AUDIENCE) ?? '', machineIdentity: optional(env.GATEWAY_SERVICE_ID) ?? '', environment: env.CONNECTED_ENVIRONMENT === 'preview' ? 'preview' : 'production' };
  const adminEnabled = env.CONNECTED_ADMIN_ENABLED === 'true';
  if (adminEnabled && (!enabled || !trust.issuer || !trust.machineAudience || !trust.staffAudience || !trust.machineIdentity)) throw new Error('Administration requires connected services and explicit Access trust settings.');
  return { ...parsed.data, adminEnabled, trust, accountAudience: optional(env.ACCOUNT_ACCESS_AUDIENCE), staffChannel: optional(env.MONITOR_STAFF_CHANNEL_ID), publicChannel: optional(env.MONITOR_PUBLIC_CHANNEL_ID), guildId: optional(env.GUILD_ID) };
}
export type ConnectedConfig = ReturnType<typeof loadConnectedConfig>;
