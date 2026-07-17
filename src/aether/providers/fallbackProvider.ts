import type { AetherModelProvider } from './types';
import type { AetherContext, AetherRequest } from '../types';

export class FallbackModelProvider implements AetherModelProvider {
  constructor(
    private readonly primary: AetherModelProvider,
    private readonly fallback: AetherModelProvider
  ) {}

  isAvailable(): boolean {
    return this.primary.isAvailable();
  }

  async generateResponse(request: AetherRequest, context: AetherContext): Promise<string> {
    if (this.primary.isAvailable()) {
      try {
        return await this.primary.generateResponse(request, context);
      } catch {
        return this.fallback.generateResponse(request, context);
      }
    }

    return this.fallback.generateResponse(request, context);
  }

  getProviderName(): string {
    return this.primary.getProviderName();
  }

  close(): void {
    this.primary.close();
    this.fallback.close();
  }
}
