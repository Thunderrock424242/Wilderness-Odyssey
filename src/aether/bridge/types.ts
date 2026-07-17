export const AETHER_BRIDGE_ACTIONS = [
  'complete_link',
  'player_question',
  'crash_report',
  'server_status'
] as const;

export type AetherBridgeAction = typeof AETHER_BRIDGE_ACTIONS[number];

export interface AetherMinecraftBridge {
  isAvailable(): boolean;
  getBridgeName(): string;
  getAllowedActions(): readonly AetherBridgeAction[];
  authenticate(presentedSecret: string | undefined): boolean;
  close(): void;
}
