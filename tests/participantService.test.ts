import { expect, it, vi } from 'vitest';
import { logoutSchema } from '../contracts/v1/auth';
import { browserParticipantSession, participantRequest } from '../src/services/participant';
it('shared participant sign-out revokes the admin credential through the admin logout endpoint', async () => {
  const upstream = vi.fn<typeof fetch>(async () => Response.json({ schemaVersion: '1.0', revoked: true }));
  vi.stubGlobal('fetch', upstream);
  try {
    expect(browserParticipantSession.parse({ schemaVersion: '1.0', user: { id: '234567890123456789', displayName: 'Admin' }, guildId: '123456789012345678', campaignIds: [], expiresAt: new Date().toISOString(), csrfToken: 'csrf', authMethod: 'discord' }).authMethod).toBe('discord');
    await participantRequest('logout', logoutSchema, {}, 'csrf', 'discord');
    expect(upstream.mock.calls[0][0]).toBe('/api/auth/logout');
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get('X-WO-Auth-Intent')).toBe('renew');
  } finally { vi.unstubAllGlobals(); }
});
