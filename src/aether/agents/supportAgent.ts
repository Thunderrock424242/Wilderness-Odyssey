import type { AetherAgent, AetherContext, AetherRequest, AetherResponse } from '../types';

export class SupportAgent implements AetherAgent {
  readonly name = 'support' as const;

  isAvailable(): boolean {
    return true;
  }

  async handle(request: AetherRequest, _context: AetherContext): Promise<AetherResponse> {
    const normalized = request.message.toLowerCase();
    const responseText = normalized.includes('install') || normalized.includes('curseforge')
      ? 'Use `/installhelp` for the maintained launcher/import flow. Keep the pack ZIP intact, import it through your launcher, and avoid manually replacing bundled mods or the loader.'
      : normalized.includes('lag') || normalized.includes('fps') || normalized.includes('performance')
        ? 'Use `/performance` for the checklist or `/perfreport` and `/sparkreport` to submit structured evidence. Include what you were doing, where the lag occurred, and the current pack version.'
        : 'For guided support, use `/help`. Bugs belong in `/bugreport`, crashes or logs in `/crash`, and known current problems in `/knownissues`.';

    return {
      requestId: request.requestId,
      agentName: this.name,
      responseText,
      status: 'ok',
      confidence: 'medium'
    };
  }
}
