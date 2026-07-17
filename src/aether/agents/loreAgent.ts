import type { AetherLoreSource } from '../lore/loreSource';
import type { AetherAgent, AetherContext, AetherRequest, AetherResponse } from '../types';

export class LoreAgent implements AetherAgent {
  readonly name = 'lore' as const;

  constructor(private readonly loreSource: AetherLoreSource) {}

  isAvailable(): boolean {
    return this.loreSource.isAvailable();
  }

  async handle(request: AetherRequest, _context: AetherContext): Promise<AetherResponse> {
    const matches = this.loreSource.search(request.message);
    if (matches.length === 0) {
      return {
        requestId: request.requestId,
        agentName: this.name,
        responseText: 'The current lore archive has no matching approved entry. This is not a canon answer; ask staff or configure a richer lore source.',
        status: 'limited',
        confidence: 'low',
        metadata: { loreSource: this.loreSource.getSourceName() }
      };
    }

    return {
      requestId: request.requestId,
      agentName: this.name,
      responseText: matches
        .map((match) => `**${match.title}**\n${match.text}`)
        .join('\n\n')
        .slice(0, 3800),
      status: this.loreSource.getSourceName() === 'placeholder' ? 'limited' : 'ok',
      confidence: this.loreSource.getSourceName() === 'placeholder' ? 'low' : 'medium',
      metadata: {
        loreSource: this.loreSource.getSourceName(),
        matchCount: matches.length
      }
    };
  }
}
