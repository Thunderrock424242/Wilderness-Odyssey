import { describe, expect, it } from 'vitest';
import { publicStatusSchema } from '../contracts/v1/status';
import { statusPresentation } from '../src/lib/status';

export const statusFixture = {
  schemaVersion: '1.0', observedAt: '2026-09-22T12:00:00Z', staleAfterSeconds: 90,
  minecraft: { state: 'online', players: { online: 3, max: 20 }, tps: 19.8, mspt: 28, minecraftVersion: '1.21.1', modpackVersion: '0.1.0', loader: 'NeoForge' },
  aether: { ollama: 'ready', inference: 'ready', requestsPaused: false, responseLatency: null },
  maintenance: { active: false, message: '', startsAt: null, endsAt: null, services: [] }, incidents: [],
};

describe('public operational status', () => {
  it('projects only public fields, including nested objects', () => {
    const result = publicStatusSchema.parse({ ...statusFixture, privateToken: 'secret', minecraft: { ...statusFixture.minecraft, address: 'private-host' }, conversations: ['private'] });
    expect(JSON.stringify(result)).not.toMatch(/secret|private/);
    expect(result.minecraft.players?.online).toBe(3);
  });
  it('stops calling a previously online service live when observations expire', () => {
    expect(statusPresentation(publicStatusSchema.parse(statusFixture), Date.parse('2026-09-22T12:02:00Z')).freshness).toBe('stale');
    expect(statusPresentation(publicStatusSchema.parse(statusFixture), Date.parse('2026-09-22T12:02:00Z')).minecraft).toBe('Last known: online');
  });
  it('does not label an unreachable API as an offline Minecraft server', () => {
    expect(statusPresentation(null).minecraft).toBe('Unavailable');
  });
  it('treats future-dated observations as unknown', () => {
    expect(statusPresentation(publicStatusSchema.parse(statusFixture), Date.parse('2026-09-21T12:00:00Z')).freshness).toBe('unknown');
  });
  it('rejects unsupported versions and impossible player counts', () => {
    expect(publicStatusSchema.safeParse({ ...statusFixture, schemaVersion: '2.0' }).success).toBe(false);
    expect(publicStatusSchema.safeParse({ ...statusFixture, minecraft: { ...statusFixture.minecraft, players: { online: -1, max: 20 } } }).success).toBe(false);
  });
});
