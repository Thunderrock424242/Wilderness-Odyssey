import { z } from 'zod';
import { discordIdSchema } from '../contracts/v1/auth';
import { ServiceError } from './store';

export type DiscordOAuthOptions = { clientId: string; clientSecret: string; redirectUri: string };
export class DiscordOAuth {
  constructor(readonly options: DiscordOAuthOptions, readonly fetcher: typeof fetch = fetch) {}
  private async request(path: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await this.fetcher('https://discord.com/api/v10' + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) throw new ServiceError(429, 'RATE_LIMITED', 'Please try signing in shortly.');
        if ([400, 401].includes(response.status)) throw new ServiceError(401, 'IDENTITY_INVALID', 'Discord sign-in could not be verified. Start again.');
        throw new Error('Discord request failed.');
      }
      if (!response.body) throw new Error('Missing response.');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 65536) { await reader.cancel(); throw new Error('Response too large.'); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Discord sign-in is temporarily unavailable.');
    }
  }
  async identify(code: string) {
    try {
      const grant = z.object({ access_token: z.string().min(1).max(4096), token_type: z.literal('Bearer'), scope: z.literal('identify') }).parse(await this.request('/oauth2/token', {
        method: 'POST',
        headers: { authorization: 'Basic ' + Buffer.from(this.options.clientId + ':' + this.options.clientSecret).toString('base64'), 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.options.redirectUri }).toString(),
      }));
      const user = z.object({ id: discordIdSchema, username: z.string().min(1).max(100), bot: z.boolean().optional() }).parse(await this.request('/users/@me', { headers: { authorization: 'Bearer ' + grant.access_token, accept: 'application/json' } }));
      if (user.bot) throw new ServiceError(403, 'IDENTITY_INVALID', 'A human Discord identity is required.');
      // Only identity leaves this method. Access/refresh tokens are never persisted or logged.
      return { id: user.id, name: user.username };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Discord returned an unsupported identity response.');
    }
  }
}
