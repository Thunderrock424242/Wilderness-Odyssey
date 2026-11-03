import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { Client } from 'discord.js';
import { ConnectedRuntime } from '../src/connected/runtime';
import { loadConnectedConfig } from '../src/connected/config';
import { ServiceError } from '../src/connected/store';

const user = '123456789012345678', guild = '234567890123456789';
function fixture(options: { dmFails?: boolean; bot?: boolean; lookupFails?: boolean } = {}) {
  const db = new DatabaseSync(':memory:');
  const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED:'true', CONNECTED_ADMIN_ENABLED:'true', STAFF_AUTH_MODE:'discord', GUILD_ID:guild, CLIENT_ID:user, DISCORD_CLIENT_SECRET:'test-secret', DISCORD_REDIRECT_URI:'https://site.example/api/auth/discord/callback', ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com', BACKEND_ACCESS_AUDIENCE:'backend', GATEWAY_SERVICE_ID:'gateway' });
  const runtime = new ConnectedRuntime(db, config);
  const delivered: string[] = [];
  runtime.attachDiscord({ isReady:() => true, users:{ fetch:async (id:string) => {
    assert.equal(id,user);
    if (options.lookupFails) throw new Error('Discord unavailable');
    return { id, bot:options.bot ?? false, send:async (message:{content:string}) => {
      if (options.dmFails) throw new Error('Cannot message this account');
      delivered.push(message.content);
    } };
  } } } as unknown as Client);
  runtime.participant!.createCampaign('alpha','Alpha');
  return { runtime, db, delivered, close:() => { runtime.stop(); db.close(); } };
}

test('outsider invitation creates an account-bound claim without guild membership', async () => {
  const f = fixture();
  try {
    const result = await f.runtime.inviteParticipant(user,'alpha','outside-invitation-001',24);
    assert.equal(result.delivery,'sent');
    const url = new URL(result.claimUrl);
    assert.equal(url.origin,'https://site.example');
    assert.equal(url.pathname,'/playtester/claim/');
    assert.equal(url.search,'');
    assert.ok(f.delivered[0].includes(result.claimUrl));
    const token = new URLSearchParams(url.hash.slice(1)).get('invitation')!;
    assert.throws(() => f.runtime.participant!.claim(guild,token), /another account/);
    f.runtime.participant!.claim(user,token);
    assert.equal(f.runtime.participant!.home(user,'Tester').campaigns[0].id,'alpha');
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM cs_participant_invites').all()).includes(token));
  } finally { f.close(); }
});

test('blocked outsider DM returns a usable private fallback link', async () => {
  const f = fixture({ dmFails:true });
  try {
    const result = await f.runtime.inviteParticipant(user,'alpha','outside-invitation-002',24);
    assert.equal(result.delivery,'failed');
    const token = new URLSearchParams(new URL(result.claimUrl).hash.slice(1)).get('invitation')!;
    assert.equal(f.runtime.participant!.claim(user,token).claimed,true);
    assert.equal(f.delivered.length,0);
  } finally { f.close(); }
});

test('invalid IDs, bot accounts and lookup failures issue no invitation', async () => {
  for (const options of [{ bot:true },{ lookupFails:true }]) {
    const f = fixture(options);
    try {
      await assert.rejects(f.runtime.inviteParticipant(user,'alpha','outside-invitation-003',24));
      assert.equal(f.db.prepare('SELECT count(*) AS n FROM cs_participant_invites').get()!.n,0);
    } finally { f.close(); }
  }
  const f = fixture();
  try { await assert.rejects(f.runtime.inviteParticipant('../invalid','alpha','outside-invitation-004',24)); }
  finally { f.close(); }
});

test('staff authorization lost during account lookup prevents invitation and delivery', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.runtime.inviteParticipant(user,'alpha','outside-invitation-005',24,async () => { throw new ServiceError(403,'FORBIDDEN','Administrator required'); }));
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM cs_participant_invites').get()!.n,0);
    assert.equal(f.delivered.length,0);
  } finally { f.close(); }
});
