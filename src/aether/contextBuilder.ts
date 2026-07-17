import type { AetherMemoryProvider } from './memory';
import { DEFAULT_AETHER_PREFERENCES } from './memory/types';
import type { AetherContext, AetherRequest } from './types';

export class AetherContextBuilder {
  constructor(private readonly memory: AetherMemoryProvider) {}

  build(request: AetherRequest): AetherContext {
    if (!this.memory.isAvailable()) {
      return {
        profile: null,
        preferences: { ...DEFAULT_AETHER_PREFERENCES },
        conversationSummary: null,
        loreDiscoveries: [],
        playerContext: { ...(request.playerContext ?? {}) }
      };
    }

    const profile = this.memory.getProfile(request.userIdentity.platformUserId);
    return {
      profile,
      preferences: profile.preferences,
      conversationSummary: profile.preferences.conversationMemoryEnabled
        ? this.memory.getConversationSummary(request.userIdentity.platformUserId)
        : null,
      loreDiscoveries: this.memory.getLoreDiscoveries(request.userIdentity.platformUserId),
      playerContext: { ...(request.playerContext ?? {}) }
    };
  }
}
