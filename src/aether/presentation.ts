import type { AetherAgentName } from './types';

export const AETHER_LABELS: Record<AetherAgentName | 'core', string> = {
  core: 'AETHER // CORE',
  general: 'AETHER // CORE',
  lore: 'AETHER // LORE ARCHIVE',
  support: 'AETHER // PLAYER SUPPORT',
  diagnostics: 'AETHER // DIAGNOSTICS',
  quest: 'AETHER // QUEST SYSTEM',
  reports: 'AETHER // REPORTS'
};

export function aetherLabel(agentName: AetherAgentName | 'core'): string {
  return AETHER_LABELS[agentName];
}
