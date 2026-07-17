import type { AetherContext, AetherRequest } from '../types';

export interface AetherModelProvider {
  isAvailable(): boolean;
  generateResponse(request: AetherRequest, context: AetherContext): Promise<string>;
  getProviderName(): string;
  close(): void;
}
