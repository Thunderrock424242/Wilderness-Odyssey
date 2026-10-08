import type { GatewayEnv } from './env';
import { GatewayError, httpsUrl } from './http';
import { discordIdSchema } from '../contracts/v1/auth';

export function validateStaffHost(request: Request, env: GatewayEnv) {
  const url = new URL(request.url);
  if (!['production', 'preview'].includes(env.ENVIRONMENT ?? '') || !env.ALLOWED_HOSTS) {
    throw new GatewayError(503, 'ACCESS_NOT_CONFIGURED', 'Staff access has not been configured.');
  }
  const hosts = env.ALLOWED_HOSTS.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const allowed = hosts.some(host => host === url.host.toLowerCase() ||
    (env.ENVIRONMENT === 'preview' && /^\*\.[a-z0-9-]+\.pages\.dev$/.test(host) &&
      url.hostname.endsWith(host.slice(1)) && !url.hostname.slice(0, -host.slice(1).length).includes('.')));
  if (!allowed || url.protocol !== 'https:') throw new GatewayError(403, 'HOST_DENIED', 'Staff access is not available on this hostname.');
  return url;
}

export function discordConfig(request: Request, env: GatewayEnv) {
  const url = validateStaffHost(request, env);
  const callback = httpsUrl(env.DISCORD_REDIRECT_URI);
  if (env.STAFF_AUTH_MODE !== 'discord' ||
    callback.pathname !== '/api/auth/discord/callback' || callback.search || !discordIdSchema.safeParse(env.DISCORD_GUILD_ID).success) {
    throw new GatewayError(503, 'DISCORD_NOT_CONFIGURED', 'Discord sign-in has not been configured for this website.');
  }
  if (callback.origin !== url.origin) throw new GatewayError(403, 'HOST_DENIED', 'Staff access is not available on this hostname.');
  return { url, redirectUri: callback.href, guildId: env.DISCORD_GUILD_ID! };
}
