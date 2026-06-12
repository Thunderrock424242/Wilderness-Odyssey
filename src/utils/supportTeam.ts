import type { MessageMentionOptions } from 'discord.js';
import { config } from '../config';

export function supportTeamPing(label = 'New support item needs review.'): string | undefined {
  return config.support.teamRoleId ? `<@&${config.support.teamRoleId}> ${label}` : undefined;
}

export function supportTeamAllowedMentions(): MessageMentionOptions {
  return config.support.teamRoleId ? { parse: [], roles: [config.support.teamRoleId] } : { parse: [] };
}
