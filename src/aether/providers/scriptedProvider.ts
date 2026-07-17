import type { AetherModelProvider } from './types';
import type { AetherContext, AetherRequest } from '../types';

export class ScriptedModelProvider implements AetherModelProvider {
  isAvailable(): boolean {
    return true;
  }

  async generateResponse(request: AetherRequest, context: AetherContext): Promise<string> {
    const linkState = context.profile?.minecraftLink
      ? `Your linked Minecraft identity is ${context.profile.minecraftLink.minecraftName}.`
      : 'No linked Minecraft identity is available in this request.';

    return [
      `I received: "${request.message.slice(0, 500)}"`,
      linkState,
      'A hosted or local model is not required for this fallback. I can still route lore, diagnostics, support, quest, and report questions using deterministic modules.'
    ].join('\n\n');
  }

  getProviderName(): string {
    return 'scripted';
  }

  close(): void {}
}
