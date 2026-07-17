import type { AetherModelProvider } from '../providers';
import type { AetherAgent, AetherContext, AetherRequest, AetherResponse } from '../types';

export class GeneralAgent implements AetherAgent {
  readonly name = 'general' as const;

  constructor(private readonly provider: AetherModelProvider) {}

  isAvailable(): boolean {
    return true;
  }

  async handle(request: AetherRequest, context: AetherContext): Promise<AetherResponse> {
    return {
      requestId: request.requestId,
      agentName: this.name,
      responseText: await this.provider.generateResponse(request, context),
      status: this.provider.isAvailable() ? 'ok' : 'limited',
      confidence: this.provider.isAvailable() ? 'medium' : 'low',
      metadata: {
        provider: this.provider.getProviderName(),
        fallbackActive: !this.provider.isAvailable()
      }
    };
  }
}
