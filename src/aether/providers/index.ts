import type { AetherAiProviderName } from '../config';
import { DisabledModelProvider } from './disabledProvider';
import { FallbackModelProvider } from './fallbackProvider';
import { ScriptedModelProvider } from './scriptedProvider';
import type { AetherModelProvider } from './types';

export function createAetherModelProvider(name: AetherAiProviderName): AetherModelProvider {
  const fallback = new ScriptedModelProvider();
  if (name === 'scripted') {
    return fallback;
  }

  return new FallbackModelProvider(new DisabledModelProvider(), fallback);
}

export type { AetherModelProvider } from './types';
