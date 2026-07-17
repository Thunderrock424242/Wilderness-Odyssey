import { config } from '../config';
import { getDb } from '../db';
import { logger } from '../utils/logger';
import { createAetherAgents } from './agents';
import { AuthenticatedHttpMinecraftBridge } from './bridge/authenticatedBridge';
import { DisabledMinecraftBridge } from './bridge/disabledBridge';
import { AetherContextBuilder } from './contextBuilder';
import { AetherCore, type AetherCoreStatus } from './core';
import { createLoreSource } from './lore/loreSource';
import { AetherSqliteMemory, DisabledAetherMemory } from './memory';
import { AetherPermissionManager } from './permissionManager';
import { createAetherModelProvider } from './providers';
import { AetherRateLimiter } from './rateLimiter';
import { AetherRouter } from './router';

let aetherCore: AetherCore | null = null;

export function initializeAether(): void {
  if (aetherCore) {
    return;
  }

  const memory = config.aether.memoryEnabled
    ? new AetherSqliteMemory(getDb())
    : new DisabledAetherMemory();
  const modelProvider = createAetherModelProvider(config.aether.aiProvider);
  const lore = createLoreSource(config.aether.loreFile);
  const minecraftBridge = config.aether.minecraftBridgeEnabled
    && config.aether.minecraftBridgeSecret
    ? new AuthenticatedHttpMinecraftBridge(config.aether.minecraftBridgeSecret)
    : new DisabledMinecraftBridge();
  const contextBuilder = new AetherContextBuilder(memory);
  const router = new AetherRouter(
    createAetherAgents({ modelProvider, loreSource: lore.source }),
    contextBuilder
  );

  aetherCore = new AetherCore(
    config.aether,
    memory,
    modelProvider,
    minecraftBridge,
    router,
    new AetherPermissionManager(),
    new AetherRateLimiter(
      config.aether.rateLimitRequests,
      config.aether.rateLimitWindowSeconds * 1000
    )
  );

  if (config.aether.issues.length > 0 || lore.warning) {
    logger.warn({
      issues: [...config.aether.issues, ...(lore.warning ? [lore.warning] : [])]
    }, 'Aether configuration warnings detected.');
  }

  try {
    aetherCore.initialize();
    if (aetherCore.isOperational()) {
      logger.info({
        aiProvider: modelProvider.getProviderName(),
        memoryProvider: memory.getProviderName(),
        minecraftBridge: minecraftBridge.getBridgeName()
      }, 'Aether Core initialized.');
    } else {
      logger.info('Aether Core is disabled; existing bot features remain active.');
    }
  } catch (error) {
    aetherCore.disable('Aether initialization failed; see the warning log.');
    logger.warn({ error }, 'Aether initialization failed; Aether was disabled without stopping the bot.');
  }
}

export function getAetherCore(): AetherCore | null {
  return aetherCore;
}

export function getAetherStatus(): AetherCoreStatus {
  if (!aetherCore) {
    return {
      enabled: false,
      configuredEnabled: config.aether.enabled,
      initialized: false,
      commandEnabled: config.aether.commandEnabled,
      aiProvider: {
        name: config.aether.aiProvider,
        available: false,
        fallbackAvailable: true
      },
      memoryProvider: {
        name: config.aether.memoryEnabled ? 'sqlite' : 'disabled',
        available: false
      },
      minecraftBridge: {
        name: config.aether.minecraftBridgeEnabled ? 'authenticated-http' : 'disabled',
        available: false,
        allowedActions: []
      },
      agents: [],
      configurationIssues: [...config.aether.issues],
      failureReason: 'Aether has not initialized.'
    };
  }

  return aetherCore.getStatus();
}

export function isAetherBridgeAvailable(): boolean {
  return Boolean(aetherCore?.isOperational() && aetherCore.minecraftBridge.isAvailable());
}

export function shutdownAether(): void {
  aetherCore?.close();
  aetherCore = null;
}
