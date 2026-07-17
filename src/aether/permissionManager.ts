import type { AetherPermission } from './types';

export class AetherPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AetherPermissionError';
  }
}

export class AetherPermissionManager {
  assertCanAccessProfile(input: {
    requesterUserId: string;
    targetUserId: string;
    permissions: AetherPermission[];
  }): void {
    const ownsProfile = input.requesterUserId === input.targetUserId;
    if (ownsProfile && input.permissions.includes('profile:self')) {
      return;
    }

    if (input.permissions.includes('profile:any')) {
      return;
    }

    throw new AetherPermissionError('You can only access your own Aether profile.');
  }

  assertCanUpdateSettings(input: {
    requesterUserId: string;
    targetUserId: string;
    permissions: AetherPermission[];
  }): void {
    if (
      input.requesterUserId === input.targetUserId
      && input.permissions.includes('settings:self')
    ) {
      return;
    }

    throw new AetherPermissionError('You can only update your own Aether settings.');
  }
}
