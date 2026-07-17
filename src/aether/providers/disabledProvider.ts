import type { AetherModelProvider } from './types';
import type { AetherContext, AetherRequest } from '../types';

export class DisabledModelProvider implements AetherModelProvider {
  isAvailable(): boolean {
    return false;
  }

  async generateResponse(_request: AetherRequest, _context: AetherContext): Promise<string> {
    throw new Error('The configured AI provider is disabled.');
  }

  getProviderName(): string {
    return 'disabled';
  }

  close(): void {}
}
