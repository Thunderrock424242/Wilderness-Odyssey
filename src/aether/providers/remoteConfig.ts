import { z } from 'zod';

const remoteConfig = z.object({
  origin: z.url().max(2048).refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash;
  }),
  token: z.string().regex(/^[A-Za-z0-9._~-]{32,256}$/),
  serverId: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/),
  timeoutMs: z.coerce.number().int().min(1000).max(60000),
  concurrency: z.coerce.number().int().min(1).max(4),
  guildRequests: z.coerce.number().int().min(1).max(100),
  globalRequests: z.coerce.number().int().min(1).max(100),
});
export type AetherRemoteConfig = z.infer<typeof remoteConfig>;

/** Operator-only fixed destination; interactions cannot change this connection. */
export function loadRemoteConfig(env: NodeJS.ProcessEnv): AetherRemoteConfig | undefined {
  const parsed = remoteConfig.safeParse({
    origin: env.AETHER_INFERENCE_ORIGIN?.trim(), token: env.AETHER_INFERENCE_TOKEN?.trim(),
    serverId: env.AETHER_INFERENCE_SERVER_ID?.trim(), model: env.AETHER_INFERENCE_MODEL?.trim(),
    timeoutMs: env.AETHER_INFERENCE_TIMEOUT_MS ?? 35000,
    concurrency: env.AETHER_INFERENCE_CONCURRENCY ?? 1,
    guildRequests: env.AETHER_INFERENCE_GUILD_REQUESTS_PER_MINUTE ?? 20,
    globalRequests: env.AETHER_INFERENCE_GLOBAL_REQUESTS_PER_MINUTE ?? 30,
  });
  if (!parsed.success) return undefined;
  const otherSecrets = [
    'AETHER_GATEWAY_ADMINISTRATION_TOKEN', 'AETHER_GATEWAY_MONITORING_TOKEN',
    'AETHER_ADMINISTRATION_TOKEN', 'AETHER_MONITORING_TOKEN', 'AETHER_MINECRAFT_BRIDGE_SECRET',
    'MAIN_SERVER_READ_TOKEN', 'MAIN_SERVER_WRITE_TOKEN', 'MAIN_SERVER_INGEST_TOKEN',
    'IDENTITY_SERVICE_TOKEN', 'METRICS_TOKEN', 'DISCORD_TOKEN', 'TOKEN',
  ];
  if (otherSecrets.some(name => env[name]?.trim() === parsed.data.token)) return undefined;
  return {...parsed.data, origin: new URL(parsed.data.origin).origin};
}
