import type { AetherBridgeAction, AetherMinecraftBridge } from './types';

export class DisabledMinecraftBridge implements AetherMinecraftBridge {
  isAvailable(): boolean {
    return false;
  }

  getBridgeName(): string {
    return 'disabled';
  }

  getAllowedActions(): readonly AetherBridgeAction[] {
    return [];
  }

  authenticate(_presentedSecret: string | undefined): boolean {
    return false;
  }

  close(): void {}
}
