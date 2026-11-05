import type { AetherModelProvider } from '../providers';
import { InferenceFailure } from '../providers/remoteProvider';
import type { AetherAgent, AetherContext, AetherRequest, AetherResponse } from '../types';

export class GeneralAgent implements AetherAgent {
  readonly name = 'general' as const;

  constructor(private readonly provider: AetherModelProvider) {}

  isAvailable(): boolean {
    return true;
  }

  async handle(request: AetherRequest, context: AetherContext): Promise<AetherResponse> {
    let responseText: string;
    try { responseText = await this.provider.generateResponse(request, context); }
    catch (failure) {
      if (!(failure instanceof InferenceFailure)) throw failure;
      return {requestId: request.requestId, agentName: this.name, status: 'error', confidence: 'high', responseText: failure.message};
    }
    return {
      requestId: request.requestId,
      agentName: this.name,
      responseText,
      status: this.provider.isAvailable() ? 'ok' : 'limited',
      confidence: this.provider.isAvailable() ? 'medium' : 'low',
      metadata: {
        provider: this.provider.getProviderName(),
        fallbackActive: !this.provider.isAvailable()
      }
    };
  }
}
