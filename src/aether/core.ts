import type { AetherConfig } from './config';
import type { AetherMinecraftBridge } from './bridge/types';
import type { AetherBridgeRequest } from './bridge/schema';
import type { AetherMemoryProvider, AetherProfile, AetherUserPreferences } from './memory';
import type { AetherModelProvider } from './providers';
import type { AetherPermission } from './types';
import type { AetherRouter } from './router';
import type { AetherPermissionManager } from './permissionManager';
import type { AetherRateLimiter } from './rateLimiter';
import type { AetherRequest, AetherResponse } from './types';

export interface AetherCoreStatus {
  enabled: boolean;
  configuredEnabled: boolean;
  initialized: boolean;
  commandEnabled: boolean;
  aiProvider: {
    name: string;
    available: boolean;
    fallbackAvailable: boolean;
  };
  memoryProvider: {
    name: string;
    available: boolean;
  };
  minecraftBridge: {
    name: string;
    available: boolean;
    allowedActions: readonly string[];
  };
  agents: Array<{ name: string; available: boolean }>;
  configurationIssues: string[];
  failureReason?: string;
}

export class AetherCore {
  private initialized = false;
  private failureReason: string | undefined;

  constructor(
    private readonly config: AetherConfig,
    private readonly memory: AetherMemoryProvider,
    private readonly modelProvider: AetherModelProvider,
    readonly minecraftBridge: AetherMinecraftBridge,
    private readonly router: AetherRouter,
    private readonly permissionManager: AetherPermissionManager,
    private readonly rateLimiter: AetherRateLimiter
  ) {}

  initialize(): void {
    if (!this.config.enabled) {
      return;
    }

    this.memory.initialize();
    this.initialized = true;
  }

  disable(reason: string): void {
    this.initialized = false;
    this.failureReason = reason;
  }

  close(): void {
    this.minecraftBridge.close();
    this.modelProvider.close();
    this.memory.close();
    this.initialized = false;
  }

  isOperational(): boolean {
    return this.config.enabled && this.initialized;
  }

  getStatus(): AetherCoreStatus {
    return {
      enabled: this.isOperational(),
      configuredEnabled: this.config.enabled,
      initialized: this.initialized,
      commandEnabled: this.config.commandEnabled,
      aiProvider: {
        name: this.modelProvider.getProviderName(),
        available: this.modelProvider.isAvailable(),
        fallbackAvailable: true
      },
      memoryProvider: {
        name: this.memory.getProviderName(),
        available: this.memory.isAvailable()
      },
      minecraftBridge: {
        name: this.minecraftBridge.getBridgeName(),
        available: this.minecraftBridge.isAvailable(),
        allowedActions: this.minecraftBridge.getAllowedActions()
      },
      agents: this.router.getAgentStatuses(),
      configurationIssues: [...this.config.issues],
      failureReason: this.failureReason
    };
  }

  async routeRequest(request: AetherRequest): Promise<AetherResponse> {
    if (!this.isOperational()) {
      return disabledResponse(request);
    }

    const rateLimit = this.rateLimiter.consume(
      `${request.sourcePlatform}:${request.userIdentity.platformUserId}`
    );
    if (!rateLimit.allowed) {
      return {
        requestId: request.requestId,
        agentName: request.agentHint ?? 'general',
        responseText: `Aether is receiving requests too quickly. Try again in ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds.`,
        status: 'error',
        confidence: 'high',
        metadata: { rateLimited: true }
      };
    }

    const response = await this.router.route(request);
    if (
      response.agentName === 'diagnostics'
      && response.status !== 'error'
      && this.memory.isAvailable()
    ) {
      try {
        this.memory.recordDiagnosticReference({
          discordUserId: request.userIdentity.platformUserId,
          reference: request.requestId,
          summary: String(response.metadata?.likelyCause ?? 'Diagnostic analysis completed.')
        });
      } catch {
        // Diagnostic history is optional and must not hide an otherwise useful result.
      }
    }

    return response;
  }

  createLinkCode(input: { discordUserId: string; username: string }) {
    this.assertMemoryAvailable();
    const rateLimit = this.rateLimiter.consume(`link:${input.discordUserId}`);
    if (!rateLimit.allowed) {
      throw new Error(`Please wait ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds before creating another link code.`);
    }
    return this.memory.createLinkCode({
      ...input,
      expiresInMinutes: this.config.linkCodeExpirationMinutes
    });
  }

  completeLink(input: { code: string; minecraftUuid: string; minecraftName: string }) {
    if (!this.isOperational() || !this.memory.isAvailable()) {
      return { ok: false as const, reason: 'unavailable' as const };
    }
    return this.memory.completeLink(input);
  }

  unlink(discordUserId: string): boolean {
    this.assertMemoryAvailable();
    return this.memory.unlink(discordUserId);
  }

  getProfile(input: {
    requesterUserId: string;
    targetUserId: string;
    permissions: AetherPermission[];
  }): AetherProfile {
    this.assertMemoryAvailable();
    this.permissionManager.assertCanAccessProfile(input);
    return this.memory.getProfile(input.targetUserId);
  }

  updatePreferences(input: {
    requesterUserId: string;
    targetUserId: string;
    permissions: AetherPermission[];
    preferences: Partial<AetherUserPreferences>;
  }): AetherUserPreferences {
    this.assertMemoryAvailable();
    this.permissionManager.assertCanUpdateSettings(input);
    return this.memory.updatePreferences(input.targetUserId, input.preferences);
  }

  async handleBridgeRequest(request: AetherBridgeRequest): Promise<Record<string, unknown>> {
    if (!this.isOperational() || !this.minecraftBridge.isAvailable()) {
      return { ok: false, error: 'aether_bridge_unavailable' };
    }

    if (request.action === 'complete_link') {
      const result = this.completeLink({
        code: request.code,
        minecraftUuid: request.minecraftUuid,
        minecraftName: request.minecraftName
      });
      return result.ok
        ? {
          ok: true,
          requestId: request.requestId,
          discordUserId: result.link.discordUserId,
          minecraftUuid: result.link.minecraftUuid
        }
        : { ok: false, requestId: request.requestId, error: `link_${result.reason}` };
    }

    if (request.action === 'server_status') {
      const status = this.getStatus();
      return {
        ok: true,
        requestId: request.requestId,
        aetherEnabled: status.enabled,
        agentsAvailable: status.agents.filter((agent) => agent.available).length,
        bridge: status.minecraftBridge.name
      };
    }

    const normalizedUuid = request.minecraftUuid;
    const link = this.memory.isAvailable()
      ? this.memory.getLinkByMinecraftUuid(normalizedUuid)
      : null;
    const aetherRequest: AetherRequest = {
      requestId: request.requestId,
      sourcePlatform: 'minecraft',
      userIdentity: {
        platformUserId: link?.discordUserId ?? `minecraft:${normalizedUuid}`,
        linkedMinecraftUuid: normalizedUuid
      },
      guildOrServerId: request.serverId,
      message: request.action === 'crash_report'
        ? 'Analyze this Minecraft crash report.'
        : request.message,
      attachments: request.action === 'crash_report'
        ? [{
          name: request.fileName,
          size: Buffer.byteLength(request.log, 'utf8'),
          mediaType: 'text/plain',
          content: request.log,
          reference: request.requestId
        }]
        : [],
      permissions: ['bridge:trusted-server'],
      playerContext: request.playerContext,
      timestamp: new Date().toISOString(),
      agentHint: request.action === 'crash_report' ? 'diagnostics' : undefined
    };
    const response = await this.routeRequest(aetherRequest);
    return { ok: response.status !== 'error', ...response };
  }

  private assertMemoryAvailable(): void {
    if (!this.isOperational() || !this.memory.isAvailable()) {
      throw new Error('Aether memory is disabled or unavailable.');
    }
  }
}

function disabledResponse(request: AetherRequest): AetherResponse {
  return {
    requestId: request.requestId,
    agentName: request.agentHint ?? 'general',
    responseText: 'Aether Core is disabled or unavailable. Existing Wilderness Odyssey bot features remain online.',
    status: 'error',
    confidence: 'high',
    metadata: { aetherEnabled: false }
  };
}
