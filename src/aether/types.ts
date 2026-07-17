import type { AetherProfile, AetherUserPreferences } from './memory/types';

export type AetherSourcePlatform = 'discord' | 'minecraft' | 'internal';

export type AetherAgentName =
  | 'general'
  | 'lore'
  | 'support'
  | 'diagnostics'
  | 'quest'
  | 'reports';

export type AetherPermission =
  | 'profile:self'
  | 'profile:any'
  | 'settings:self'
  | 'bridge:trusted-server';

export interface AetherAttachment {
  name: string;
  size: number;
  mediaType?: string;
  content?: string;
  reference?: string;
}

export interface AetherRequest {
  requestId: string;
  sourcePlatform: AetherSourcePlatform;
  userIdentity: {
    platformUserId: string;
    displayName?: string;
    linkedMinecraftUuid?: string;
  };
  guildOrServerId?: string;
  message: string;
  attachments: AetherAttachment[];
  permissions: AetherPermission[];
  playerContext?: Record<string, string | number | boolean>;
  timestamp: string;
  agentHint?: AetherAgentName;
}

export interface AetherContext {
  profile: AetherProfile | null;
  preferences: AetherUserPreferences;
  conversationSummary: string | null;
  loreDiscoveries: string[];
  playerContext: Record<string, string | number | boolean>;
}

export interface AetherResponse {
  requestId: string;
  agentName: AetherAgentName;
  responseText: string;
  status: 'ok' | 'limited' | 'error';
  confidence: 'low' | 'medium' | 'high';
  metadata?: Record<string, string | number | boolean>;
  actions?: Array<{
    type: string;
    label: string;
  }>;
}

export interface AetherAgent {
  readonly name: AetherAgentName;
  isAvailable(): boolean;
  handle(request: AetherRequest, context: AetherContext): Promise<AetherResponse>;
}
