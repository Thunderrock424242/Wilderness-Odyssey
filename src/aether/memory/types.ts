export type AetherResponseDetail = 'concise' | 'standard' | 'detailed';
export type AetherPrivacyMode = 'private' | 'minimal';

export interface AetherUserPreferences {
  conversationMemoryEnabled: boolean;
  minecraftNotificationsEnabled: boolean;
  responseDetail: AetherResponseDetail;
  privacyMode: AetherPrivacyMode;
}

export interface AetherMinecraftLink {
  discordUserId: string;
  minecraftUuid: string;
  minecraftName: string;
  linkedAt: string;
  updatedAt: string;
}

export interface AetherProfile {
  discordUserId: string;
  minecraftLink: AetherMinecraftLink | null;
  preferences: AetherUserPreferences;
}

export interface AetherLinkCode {
  code: string;
  discordUserId: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'used' | 'expired';
}

export type AetherLinkCompletionResult =
  | { ok: true; link: AetherMinecraftLink }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'uuid_in_use' | 'unavailable' };

export interface AetherMemoryProvider {
  initialize(): void;
  isAvailable(): boolean;
  getProviderName(): string;
  createLinkCode(input: {
    discordUserId: string;
    username: string;
    expiresInMinutes: number;
  }): AetherLinkCode;
  completeLink(input: {
    code: string;
    minecraftUuid: string;
    minecraftName: string;
  }): AetherLinkCompletionResult;
  getProfile(discordUserId: string): AetherProfile;
  getLinkByMinecraftUuid(minecraftUuid: string): AetherMinecraftLink | null;
  unlink(discordUserId: string): boolean;
  updatePreferences(
    discordUserId: string,
    preferences: Partial<AetherUserPreferences>
  ): AetherUserPreferences;
  getConversationSummary(discordUserId: string): string | null;
  saveConversationSummary(discordUserId: string, summary: string): boolean;
  getLoreDiscoveries(discordUserId: string): string[];
  addLoreDiscovery(discordUserId: string, discoveryKey: string): void;
  recordDiagnosticReference(input: {
    discordUserId: string;
    reference: string;
    summary: string;
  }): void;
  close(): void;
}

export const DEFAULT_AETHER_PREFERENCES: AetherUserPreferences = {
  conversationMemoryEnabled: false,
  minecraftNotificationsEnabled: false,
  responseDetail: 'standard',
  privacyMode: 'private'
};
