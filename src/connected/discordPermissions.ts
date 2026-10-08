import { DiscordAPIError, PermissionFlagsBits, Routes, type Client } from 'discord.js';
import { z } from 'zod';
import { discordIdSchema } from '../contracts/v1/auth';
import { ServiceError } from './store';

/** REST reads bypass gateway caches; only a confirmed unknown member or permission loss is a demotion. */
export async function requireDiscordAdministrator(rest: Client['rest'], guildId: string, userId: string): Promise<void> {
  discordIdSchema.parse(guildId); discordIdSchema.parse(userId);
  const controller = new AbortController();
  let timeout!: NodeJS.Timeout;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Discord permissions could not be verified. Try again later.')); }, 5000);
  });
  // discord.js rate-limit sleeps can ignore its request signal. Bound the entire lookup as well.
  const get = (route: Parameters<Client['rest']['get']>[0]) => Promise.race([rest.get(route, { signal: controller.signal }), deadline]);
  try {
    const guild = z.object({ id: discordIdSchema, owner_id: discordIdSchema }).parse(await get(Routes.guild(guildId)));
    if (guild.id !== guildId) throw new Error('Unexpected guild.');
    let member: { user: { id: string; bot?: boolean }; roles: string[] };
    try {
      member = z.object({ user: z.object({ id: discordIdSchema, bot: z.boolean().optional() }), roles: z.array(discordIdSchema).max(250) }).parse(await get(Routes.guildMember(guildId, userId)));
    } catch (error) {
      if (error instanceof DiscordAPIError && error.status === 404 && error.code === 10007) throw new ServiceError(403, 'MEMBERSHIP_LOST', 'Membership in the configured Discord server is required.');
      throw error;
    }
    if (member.user.id !== userId) throw new Error('Unexpected member.');
    if (member.user.bot) throw new ServiceError(403, 'FORBIDDEN', 'A human Discord identity is required.');
    if (guild.owner_id === userId) return;
    const roles = z.array(z.object({ id: discordIdSchema, permissions: z.string().regex(/^\d{1,30}$/) })).max(1000).parse(await get(Routes.guildRoles(guildId)));
    if (!roles.some(role => (role.id === guildId || member.roles.includes(role.id)) && (BigInt(role.permissions) & PermissionFlagsBits.Administrator) !== 0n)) {
      throw new ServiceError(403, 'PERMISSION_LOST', 'Current Discord Administrator permission is required.');
    }
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Discord permissions could not be verified. Try again later.');
  } finally { clearTimeout(timeout); }
}
