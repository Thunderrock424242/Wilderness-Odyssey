import type { AetherAiProviderName } from '../config';
import { DisabledModelProvider } from './disabledProvider';
import { FallbackModelProvider } from './fallbackProvider';
import { ScriptedModelProvider } from './scriptedProvider';
import type { AetherModelProvider } from './types';
import { RemoteModelProvider } from './remoteProvider';
import type { AetherRemoteConfig } from './remoteConfig';

export function createAetherModelProvider(name: AetherAiProviderName, remote?: AetherRemoteConfig, onFailure?: (requestId: string, category: string) => void): AetherModelProvider {
  if (name === 'remote') return remote ? new RemoteModelProvider(remote, fetch, Date.now, onFailure) : new DisabledModelProvider();
  const fallback = new ScriptedModelProvider();
  if (name === 'scripted') {
    return fallback;
  }

  return new FallbackModelProvider(new DisabledModelProvider(), fallback);
}

export type { AetherModelProvider } from './types';
