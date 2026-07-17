import type { AetherAgent, AetherContext, AetherRequest, AetherResponse } from '../types';

export class ReportsAgent implements AetherAgent {
  readonly name = 'reports' as const;

  isAvailable(): boolean {
    return true;
  }

  async handle(request: AetherRequest, _context: AetherContext): Promise<AetherResponse> {
    return {
      requestId: request.requestId,
      agentName: this.name,
      responseText: 'Aether does not replace the existing report workflows. Use `/bugreport`, `/crash`, `/perfreport`, `/sparkreport`, `/feedback`, or `/suggest` so the current database IDs, forums, triage controls, and staff notifications remain intact.',
      status: 'ok',
      confidence: 'high'
    };
  }
}
