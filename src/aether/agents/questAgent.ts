import type { AetherAgent, AetherContext, AetherRequest, AetherResponse } from '../types';

export class QuestAgent implements AetherAgent {
  readonly name = 'quest' as const;

  isAvailable(): boolean {
    return true;
  }

  async handle(request: AetherRequest, context: AetherContext): Promise<AetherResponse> {
    const contextNote = Object.keys(context.playerContext).length > 0
      ? 'Trusted server-side player context was available for this request.'
      : 'No trusted server-side quest context is connected yet.';
    return {
      requestId: request.requestId,
      agentName: this.name,
      responseText: `${contextNote} Quest routing is ready, but authoritative quest/progression data remains a future Minecraft bridge integration.`,
      status: 'limited',
      confidence: 'low'
    };
  }
}
