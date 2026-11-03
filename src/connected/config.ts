import { z } from 'zod';
import type { AccessTrust } from './auth';
import { discordIdSchema } from '../contracts/v1/auth';
import { contentRepositoryConfig } from './contentRepository';

const origin = z.string().url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; });
const optional = (value: string | undefined) => value?.trim() || undefined;
const accessCredential = z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/);
export interface AetherGatewayConfig {
  origin: string; serverId: string; monitoringToken: string; administrationToken?: string;
  accessClientId?: string; accessClientSecret?: string; environment: 'preview' | 'production';
}
function accessPair(clientId: string | undefined, clientSecret: string | undefined) {
  if (!!clientId !== !!clientSecret || (clientId && !accessCredential.safeParse(clientId).success) || (clientSecret && !accessCredential.safeParse(clientSecret).success)) throw new Error('Service Access credentials must be a valid paired client ID and secret.');
}
export function loadConnectedConfig(env: NodeJS.ProcessEnv) {
  const enabled = env.CONNECTED_SERVICES_ENABLED === 'true';
  const schema = z.object({
    enabled: z.boolean(), mainOrigin: origin.optional(), readToken: z.string().min(32).optional(), writeToken: z.string().min(32).optional(), ingestToken: z.string().min(32).optional(), identityToken: z.string().min(32).optional(),
    playtestPublicApiOrigin: origin.optional(),
    intervalMs: z.coerce.number().int().min(5000).max(300000), failures: z.coerce.number().int().min(2).max(20), recoveries: z.coerce.number().int().min(2).max(20),
    staleSeconds: z.coerce.number().int().min(15).max(300), serverId: z.string().min(1).max(100),
  });
  const parsed = schema.safeParse({ enabled, playtestPublicApiOrigin: optional(env.PLAYTEST_PUBLIC_API_ORIGIN), mainOrigin: optional(env.MAIN_SERVER_ORIGIN), readToken: optional(env.MAIN_SERVER_READ_TOKEN), writeToken: optional(env.MAIN_SERVER_WRITE_TOKEN), ingestToken: optional(env.MAIN_SERVER_INGEST_TOKEN), identityToken: optional(env.IDENTITY_SERVICE_TOKEN), intervalMs: optional(env.MONITOR_INTERVAL_MS) ?? 30000, failures: optional(env.MONITOR_FAILURE_THRESHOLD) ?? 3, recoveries: optional(env.MONITOR_RECOVERY_THRESHOLD) ?? 2, staleSeconds: optional(env.MONITOR_STALE_SECONDS) ?? 120, serverId: optional(env.MAIN_SERVER_ID) ?? 'official' });
  if (!parsed.success) throw new Error('Invalid connected services configuration. Check HTTPS origin, token lengths, and monitoring limits.');
  if (enabled && parsed.data.mainOrigin && !parsed.data.readToken) throw new Error('Main-server monitoring requires a read credential.');
  const mainAccessClientId = optional(env.MAIN_SERVER_ACCESS_CLIENT_ID);
  const mainAccessClientSecret = optional(env.MAIN_SERVER_ACCESS_CLIENT_SECRET);
  accessPair(mainAccessClientId, mainAccessClientSecret);
  let aetherGateway: AetherGatewayConfig | undefined;
  if (Object.entries(env).some(([key, value]) => key.startsWith('AETHER_GATEWAY_') && optional(value))) {
    const result = z.object({ origin, serverId:z.string().regex(/^[A-Za-z0-9_-]{1,96}$/), monitoringToken:accessCredential.min(32), administrationToken:accessCredential.min(32).optional(), accessClientId:accessCredential.optional(), accessClientSecret:accessCredential.optional(), environment:z.enum(['preview','production']) }).safeParse({ origin:optional(env.AETHER_GATEWAY_ORIGIN), serverId:optional(env.AETHER_GATEWAY_SERVER_ID), monitoringToken:optional(env.AETHER_GATEWAY_MONITORING_TOKEN), administrationToken:optional(env.AETHER_GATEWAY_ADMINISTRATION_TOKEN), accessClientId:optional(env.AETHER_GATEWAY_ACCESS_CLIENT_ID), accessClientSecret:optional(env.AETHER_GATEWAY_ACCESS_CLIENT_SECRET), environment:env.CONNECTED_ENVIRONMENT === 'preview' ? 'preview' : 'production' });
    if (!result.success) throw new Error('Invalid Aether gateway configuration. Set an HTTPS origin, server ID and monitoring credential.');
    accessPair(result.data.accessClientId, result.data.accessClientSecret);
    aetherGateway = result.data;
  }
  const credentials = [parsed.data.readToken, parsed.data.writeToken, parsed.data.ingestToken, parsed.data.identityToken, optional(env.METRICS_TOKEN), optional(env.AETHER_MINECRAFT_BRIDGE_SECRET), aetherGateway?.monitoringToken, aetherGateway?.administrationToken].filter(Boolean);
  if (new Set(credentials).size !== credentials.length) throw new Error('Use a different credential for every connected-service scope.');
  if (parsed.data.intervalMs >= parsed.data.staleSeconds * 1000) throw new Error('Monitoring interval must be shorter than its freshness limit.');
  if (env.CONNECTED_ENVIRONMENT && !['preview', 'production'].includes(env.CONNECTED_ENVIRONMENT)) throw new Error('Unknown connected environment.');
  const trust: AccessTrust = { issuer: optional(env.ACCESS_TEAM_DOMAIN) ?? '', machineAudience: optional(env.BACKEND_ACCESS_AUDIENCE) ?? '', staffAudience: optional(env.WEBSITE_ACCESS_AUDIENCE) ?? '', machineIdentity: optional(env.GATEWAY_SERVICE_ID) ?? '', environment: env.CONNECTED_ENVIRONMENT === 'preview' ? 'preview' : 'production' };
  const adminEnabled = env.CONNECTED_ADMIN_ENABLED === 'true';
  const mode = optional(env.STAFF_AUTH_MODE);
  if (mode && !['access', 'discord'].includes(mode)) throw new Error('Unknown staff authentication mode.');
  const staffAuthMode = mode === 'discord' ? 'discord' as const : mode === 'access' ? 'access' as const : undefined;
  if (adminEnabled && (!enabled || !staffAuthMode || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(trust.issuer) || !trust.machineAudience || !trust.machineIdentity)) throw new Error('Administration requires connected services, an explicit staff authentication mode and machine Access trust settings.');
  if (adminEnabled && staffAuthMode === 'access' && (!trust.staffAudience || trust.staffAudience === trust.machineAudience)) throw new Error('Legacy staff Access requires a distinct human audience.');
  let discord: { guildId: string; clientId: string; clientSecret: string; redirectUri: string } | undefined;
  if (adminEnabled && staffAuthMode === 'discord') {
    const settings = z.object({
      guildId: discordIdSchema, clientId: discordIdSchema, clientSecret: z.string().min(1).max(4096),
      redirectUri: z.url().max(2048).refine(value => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/api/auth/discord/callback' && !url.search && !url.hash;
      }),
    }).safeParse({ guildId: optional(env.GUILD_ID), clientId: optional(env.CLIENT_ID), clientSecret: optional(env.DISCORD_CLIENT_SECRET), redirectUri: optional(env.DISCORD_REDIRECT_URI) });
    if (!settings.success) throw new Error('Discord administration requires GUILD_ID, CLIENT_ID, DISCORD_CLIENT_SECRET and one exact HTTPS DISCORD_REDIRECT_URI.');
    discord = settings.data;
  }
  return { ...parsed.data, mainAccessClientId, mainAccessClientSecret, aetherGateway, adminEnabled, staffAuthMode, discord, trust, contentRepository:contentRepositoryConfig(env), accountAudience: optional(env.ACCOUNT_ACCESS_AUDIENCE), staffChannel: optional(env.MONITOR_STAFF_CHANNEL_ID), publicChannel: optional(env.MONITOR_PUBLIC_CHANNEL_ID), guildId: optional(env.GUILD_ID) };
}
export type ConnectedConfig = ReturnType<typeof loadConnectedConfig>;
