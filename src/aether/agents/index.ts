import type { AetherLoreSource } from '../lore/loreSource';
import type { AetherModelProvider } from '../providers';
import type { AetherAgent } from '../types';
import { DiagnosticsAgent } from './diagnosticsAgent';
import { GeneralAgent } from './generalAgent';
import { LoreAgent } from './loreAgent';
import { QuestAgent } from './questAgent';
import { ReportsAgent } from './reportsAgent';
import { SupportAgent } from './supportAgent';

export function createAetherAgents(input: {
  modelProvider: AetherModelProvider;
  loreSource: AetherLoreSource;
}): AetherAgent[] {
  return [
    new GeneralAgent(input.modelProvider),
    new LoreAgent(input.loreSource),
    new SupportAgent(),
    new DiagnosticsAgent(),
    new QuestAgent(),
    new ReportsAgent()
  ];
}
