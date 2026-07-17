const SUPPORTED_DIAGNOSTIC_TYPES = new Set(['txt', 'log', 'md', 'json', 'crash']);

export type AetherAiProviderName = 'disabled' | 'scripted';

export interface AetherConfig {
  enabled: boolean;
  commandEnabled: boolean;
  aiProvider: AetherAiProviderName;
  memoryEnabled: boolean;
  minecraftBridgeEnabled: boolean;
  minecraftBridgeSecret?: string;
  linkCodeExpirationMinutes: number;
  maximumAttachmentSize: number;
  allowedDiagnosticFileTypes: string[];
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  loreFile?: string;
  issues: string[];
}

export function loadAetherConfig(env: NodeJS.ProcessEnv): AetherConfig {
  const issues: string[] = [];
  const enabled = booleanValue(env.AETHER_ENABLED, false, 'AETHER_ENABLED', issues);
  const commandEnabled = booleanValue(
    env.AETHER_COMMAND_ENABLED,
    enabled,
    'AETHER_COMMAND_ENABLED',
    issues
  );
  const memoryEnabled = booleanValue(
    env.AETHER_MEMORY_ENABLED,
    enabled,
    'AETHER_MEMORY_ENABLED',
    issues
  );
  let minecraftBridgeEnabled = booleanValue(
    env.AETHER_MINECRAFT_BRIDGE_ENABLED,
    false,
    'AETHER_MINECRAFT_BRIDGE_ENABLED',
    issues
  );

  const rawProvider = env.AETHER_AI_PROVIDER?.trim().toLowerCase() || 'scripted';
  const aiProvider: AetherAiProviderName = rawProvider === 'scripted' || rawProvider === 'disabled'
    ? rawProvider
    : 'disabled';
  if (rawProvider !== 'scripted' && rawProvider !== 'disabled') {
    issues.push('AETHER_AI_PROVIDER is unsupported; the AI provider was disabled.');
  }

  const minecraftBridgeSecret = trimmed(env.AETHER_MINECRAFT_BRIDGE_SECRET);
  if (minecraftBridgeEnabled && (!minecraftBridgeSecret || minecraftBridgeSecret.length < 32)) {
    minecraftBridgeEnabled = false;
    issues.push('AETHER_MINECRAFT_BRIDGE_SECRET must contain at least 32 characters; the bridge was disabled.');
  }

  return {
    enabled,
    commandEnabled,
    aiProvider,
    memoryEnabled,
    minecraftBridgeEnabled,
    minecraftBridgeSecret,
    linkCodeExpirationMinutes: integerValue(
      env.AETHER_LINK_CODE_EXPIRATION_MINUTES,
      15,
      1,
      60,
      'AETHER_LINK_CODE_EXPIRATION_MINUTES',
      issues
    ),
    maximumAttachmentSize: integerValue(
      env.AETHER_MAX_ATTACHMENT_BYTES,
      2 * 1024 * 1024,
      1024,
      10 * 1024 * 1024,
      'AETHER_MAX_ATTACHMENT_BYTES',
      issues
    ),
    allowedDiagnosticFileTypes: diagnosticTypes(env.AETHER_ALLOWED_DIAGNOSTIC_FILE_TYPES, issues),
    rateLimitRequests: integerValue(
      env.AETHER_RATE_LIMIT_REQUESTS,
      8,
      1,
      100,
      'AETHER_RATE_LIMIT_REQUESTS',
      issues
    ),
    rateLimitWindowSeconds: integerValue(
      env.AETHER_RATE_LIMIT_WINDOW_SECONDS,
      60,
      10,
      3600,
      'AETHER_RATE_LIMIT_WINDOW_SECONDS',
      issues
    ),
    loreFile: trimmed(env.AETHER_LORE_FILE),
    issues
  };
}

function booleanValue(
  value: string | undefined,
  fallback: boolean,
  name: string,
  issues: string[]
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  issues.push(`${name} is invalid; its safe default was used.`);
  return fallback;
}

function integerValue(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
  issues: string[]
): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    issues.push(`${name} is invalid; its safe default was used.`);
    return fallback;
  }

  return parsed;
}

function diagnosticTypes(value: string | undefined, issues: string[]): string[] {
  if (!value?.trim()) {
    return ['txt', 'log', 'crash'];
  }

  const requested = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
  const allowed = [...new Set(requested.filter((entry) => SUPPORTED_DIAGNOSTIC_TYPES.has(entry)))];
  if (allowed.length !== requested.length) {
    issues.push('AETHER_ALLOWED_DIAGNOSTIC_FILE_TYPES contained unsupported entries; they were ignored.');
  }

  if (allowed.length === 0) {
    issues.push('AETHER_ALLOWED_DIAGNOSTIC_FILE_TYPES had no safe entries; diagnostic uploads were limited to txt and log.');
    return ['txt', 'log'];
  }

  return allowed;
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}
