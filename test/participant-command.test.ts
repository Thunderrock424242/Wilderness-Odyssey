import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { ChatInputCommandInteraction, Client } from 'discord.js';

test('playtester commands enforce current Discord permission and use the selected account', async () => {
  process.env.DISCORD_TOKEN = 'test'; process.env.CLIENT_ID = 'test';
  const { initializeConnected, shutdownConnected } = await import('../src/connected/runtime');
  const { playtesterCommand } = await import('../src/commands/connected/playtester');
  shutdownConnected();
  const user = '123456789012345678', guild = '234567890123456789', other = '345678901234567890';
  const db = new DatabaseSync(':memory:');
  const runtime = initializeConnected(db, { CONNECTED_SERVICES_ENABLED:'true',CONNECTED_ADMIN_ENABLED:'true',STAFF_AUTH_MODE:'discord',GUILD_ID:guild,CLIENT_ID:user,DISCORD_CLIENT_SECRET:'secret',DISCORD_REDIRECT_URI:'https://site.example/api/auth/discord/callback',ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',BACKEND_ACCESS_AUDIENCE:'backend',GATEWAY_SERVICE_ID:'gateway' });
  runtime.stop(); let permitted = false, sends = 0;
  const client = { isReady:() => true, rest:{ get:async (path:string) => path.endsWith('/roles') ? [{ id:guild,permissions:permitted ? '8':'0' }] : path.includes('/members/') ? { user:{id:user},roles:[] } : { id:guild,owner_id:other } }, guilds:{fetch:async () => ({ members:{ fetch:async (value:{user:string}) => { assert.equal(value.user,other); return { user:{bot:false},send:async () => { sends++; } }; } } }) } } as unknown as Client;
  runtime.attachDiscord(client);
  async function call(command:string,guildId:string|null = guild) {
    const replies:Record<string,unknown>[] = [];
    const interaction = { id:'interaction-' + command,user:{id:user},guildId,client,options:{getSubcommand:() => command,getString:(name:string) => name === 'title' ? 'Alpha expedition':'alpha',getUser:() => ({id:other,bot:false})},deferReply:async (value:Record<string,unknown>) => {replies.push(value);},editReply:async (value:Record<string,unknown>) => {replies.push(value);} };
    await playtesterCommand.execute(interaction as unknown as ChatInputCommandInteraction);
    assert.equal(replies[0]!.flags,'Ephemeral'); return JSON.stringify(replies);
  }
  try {
    assert.match(await call('create'),/Administrator permission/);
    assert.equal(runtime.store.record('pt_campaign','alpha'),null);
    permitted = true; assert.match(await call('create'),/collection off/);
    assert.match(await call('invite'),/sent by DM/); assert.equal(sends,1);
    const row = db.prepare('SELECT user_id FROM cs_participant_invites').get()!; assert.equal(row.user_id,other);
    assert.match(await call('revoke'),/revoked/);
    assert.match(await call('invite',null),/configured Discord server/);
  } finally {shutdownConnected(); db.close();}
});
