import assert from 'node:assert/strict';
import test from 'node:test';
import { DiscordAPIError, type Client } from 'discord.js';
import { requireDiscordAdministrator } from '../src/connected/discordPermissions';
import { ServiceError } from '../src/connected/store';
const user = '123456789012345678', guild = '234567890123456789', low = '345678901234567890', high = '456789012345678901';
function rest(owner = high, permission = '8', fail?: Error) {
  const paths: string[] = [];
  return { paths, client: { async get(path: string, options: { signal: AbortSignal }) {
    paths.push(path); assert.ok(options.signal);
    if (path.endsWith('/roles')) return [{ id: high, permissions: '0' }, { id: low, permissions: permission }, { id: guild, permissions: '0' }];
    if (path.includes('/members/')) {
      if (fail) throw fail;
      return { user: { id: user }, roles: [low, high] };
    }
    return { id: guild, owner_id: owner };
  } } as unknown as Client['rest'] };
}
test('fresh guild/member/role reads recognize Administrator on any role and ownership', async () => {
  const f = rest(); await requireDiscordAdministrator(f.client, guild, user);
  assert.deepEqual(f.paths, ['/guilds/' + guild, '/guilds/' + guild + '/members/' + user, '/guilds/' + guild + '/roles']);
  const owner = rest(user, '0'); await requireDiscordAdministrator(owner.client, guild, user);
  assert.equal(owner.paths.length, 2);
  for (const permission of ['0', '32', String(1n << 40n), String(32n | (1n << 40n))]) await assert.rejects(requireDiscordAdministrator(rest(high, permission).client, guild, user), (e: unknown) => e instanceof ServiceError && e.status === 403);
});
test('only confirmed unknown-member means membership loss; bot access failure and malformed data are unavailable', async () => {
  const missing = new DiscordAPIError({ code: 10007, message: 'Unknown Member' }, 10007, 404, 'GET', 'https://discord.com', {});
  await assert.rejects(requireDiscordAdministrator(rest(high, '8', missing).client, guild, user), (e: unknown) => e instanceof ServiceError && e.code === 'MEMBERSHIP_LOST');
  for (const error of [new Error('Disconnected'), new DiscordAPIError({ code: 50001, message: 'Missing Access' }, 50001, 403, 'GET', 'https://discord.com', {})]) await assert.rejects(requireDiscordAdministrator(rest(high, '8', error).client, guild, user), (e: unknown) => e instanceof ServiceError && e.status === 503);
  await assert.rejects(requireDiscordAdministrator(rest(high, 'not-permissions').client, guild, user), (e: unknown) => e instanceof ServiceError && e.status === 503);
});

test('Discord permission lookups have a five-second deadline even if the REST queue ignores cancellation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const client = { get: () => new Promise(() => {}) } as unknown as Client['rest'];
    const denied = assert.rejects(requireDiscordAdministrator(client, guild, user), (e: unknown) => e instanceof ServiceError && e.status === 503);
    context.mock.timers.tick(5000);
    await denied;
  } finally { context.mock.timers.reset(); }
});
