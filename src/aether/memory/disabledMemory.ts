import type {
  AetherLinkCode,
  AetherLinkCompletionResult,
  AetherMemoryProvider,
  AetherMinecraftLink,
  AetherProfile,
  AetherUserPreferences
} from './types';

export class AetherMemoryUnavailableError extends Error {
  constructor() {
    super('Aether memory is disabled or unavailable.');
    this.name = 'AetherMemoryUnavailableError';
  }
}

export class DisabledAetherMemory implements AetherMemoryProvider {
  initialize(): void {}

  isAvailable(): boolean {
    return false;
  }

  getProviderName(): string {
    return 'disabled';
  }

  createLinkCode(_input: {
    discordUserId: string;
    username: string;
    expiresInMinutes: number;
  }): AetherLinkCode {
    throw new AetherMemoryUnavailableError();
  }

  completeLink(_input: {
    code: string;
    minecraftUuid: string;
    minecraftName: string;
  }): AetherLinkCompletionResult {
    return { ok: false, reason: 'unavailable' };
  }

  getProfile(_discordUserId: string): AetherProfile {
    throw new AetherMemoryUnavailableError();
  }

  getLinkByMinecraftUuid(_minecraftUuid: string): AetherMinecraftLink | null {
    return null;
  }

  unlink(_discordUserId: string): boolean {
    throw new AetherMemoryUnavailableError();
  }

  updatePreferences(
    _discordUserId: string,
    _preferences: Partial<AetherUserPreferences>
  ): AetherUserPreferences {
    throw new AetherMemoryUnavailableError();
  }

  getConversationSummary(_discordUserId: string): string | null {
    return null;
  }

  saveConversationSummary(_discordUserId: string, _summary: string): boolean {
    return false;
  }

  getLoreDiscoveries(_discordUserId: string): string[] {
    return [];
  }

  addLoreDiscovery(_discordUserId: string, _discoveryKey: string): void {
    throw new AetherMemoryUnavailableError();
  }

  recordDiagnosticReference(_input: {
    discordUserId: string;
    reference: string;
    summary: string;
  }): void {
    throw new AetherMemoryUnavailableError();
  }

  close(): void {}
}
