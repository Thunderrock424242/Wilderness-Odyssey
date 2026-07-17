import { timingSafeEqual } from 'node:crypto';
import { AETHER_BRIDGE_ACTIONS, type AetherMinecraftBridge } from './types';

export class AuthenticatedHttpMinecraftBridge implements AetherMinecraftBridge {
  constructor(private readonly sharedSecret: string) {}

  isAvailable(): boolean {
    return this.sharedSecret.length >= 32;
  }

  getBridgeName(): string {
    return 'authenticated-http';
  }

  getAllowedActions(): typeof AETHER_BRIDGE_ACTIONS {
    return AETHER_BRIDGE_ACTIONS;
  }

  authenticate(presentedSecret: string | undefined): boolean {
    if (!presentedSecret || !this.isAvailable()) {
      return false;
    }

    const expected = Buffer.from(this.sharedSecret, 'utf8');
    const presented = Buffer.from(presentedSecret, 'utf8');
    return expected.length === presented.length && timingSafeEqual(expected, presented);
  }

  close(): void {}
}
