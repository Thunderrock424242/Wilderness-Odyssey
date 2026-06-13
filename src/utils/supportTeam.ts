import type { MessageMentionOptions } from 'discord.js';
import { config } from '../config';

export type AlertTeam = 'support' | 'qa' | 'dev';

export function supportTeamPing(label = 'New support item needs review.'): string | undefined {
  return config.support.teamRoleId ? `<@&${config.support.teamRoleId}> ${label}` : undefined;
}

export function supportTeamAllowedMentions(): MessageMentionOptions {
  return config.support.teamRoleId ? { parse: [], roles: [config.support.teamRoleId] } : { parse: [] };
}

export function teamAlertContent(label: string, teams: AlertTeam[]): string {
  const mentions = alertRoleIds(teams).map((roleId) => `<@&${roleId}>`);
  return mentions.length > 0 ? `${mentions.join(' ')} ${label}` : label;
}

export function teamAlertAllowedMentions(teams: AlertTeam[]): MessageMentionOptions {
  const roles = alertRoleIds(teams);
  return roles.length > 0 ? { parse: [], roles } : { parse: [] };
}

function alertRoleIds(teams: AlertTeam[]): string[] {
  const roleIds = teams
    .map((team) => {
      if (team === 'qa') {
        return config.qa.alertRoleId ?? config.support.teamRoleId;
      }

      if (team === 'dev') {
        return config.dev.teamRoleId;
      }

      return config.support.teamRoleId;
    })
    .filter((roleId): roleId is string => Boolean(roleId));

  return [...new Set(roleIds)];
}
