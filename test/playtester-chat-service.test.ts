import assert from 'node:assert/strict';
import test from 'node:test';
import type { Message } from 'discord.js';
import { DatabaseSync } from 'node:sqlite';
import { ConnectedStore, ServiceError, type Actor } from '../src/connected/store';
import { ParticipantService } from '../src/connected/participant';
import { PlaytesterChat } from '../src/connected/playtesterChat';
const owner = '123456789012345678',admin = '234567890123456789',tester = '345678901234567890';
const actor:Actor = {id:'staff',role:'administrator',subject:owner};
function fixture() {
  const db = new DatabaseSync(':memory:'),store = new ConnectedStore(db);
  const participant = new ParticipantService(store,{guildId:owner,clientId:owner,clientSecret:'test',redirectUri:'https://site.example/api/auth/discord/callback'});
  participant.createCampaign('alpha','Alpha'); participant.claim(tester,participant.invite(tester,'alpha','invite-service-test',24).token);
  let permitted = true,ambiguous = false,revokeDuringLookup = false;
  const sent:string[] = [];
  const chat = new PlaytesterChat(store,async a => {
    if (!permitted) throw new ServiceError(403,'FORBIDDEN','Permission lost'); return {owner:a.subject === owner,userId:a.subject!};
  },async id => {if (id !== admin) throw new ServiceError(403,'FORBIDDEN','Administrator required');},async (_user,body,verify) => {
    if (revokeDuringLookup) permitted = false;
    await verify(); if (ambiguous) throw new Error('Lost Discord response');sent.push(body);
  },'https://discord.gg/example',async () => Response.json({token:'PRIVATE_TOKEN',ip:'127.0.0.1'}));
  const notices:string[] = [];
  const message = (content:string,id = 'discord-message-1',attachment = false) => ({id,guildId:null,author:{id:tester,bot:false},content,attachments:new Map(attachment ? [['file',{name:'latest.log',size:100,url:'https://cdn.discordapp.com/attachments/test.log'}]]:[]),reply:async (value:{content:string}) => {notices.push(value.content);} }) as unknown as Message;
  return {db,store,chat,sent,notices,message,deny:() => {permitted=false;},ambiguous:() => {ambiguous=true;},revokeDuringLookup:() => {revokeDuringLookup=true;}};
}
test('only the owner can select admins and chosen accounts still need current Discord permission', async () => {
  const f = fixture();try {
    await assert.rejects(f.chat.handle({...actor,subject:admin},'GET','/playtester-chat',undefined,{},''),/owner must approve/);
    await f.chat.handle(actor,'POST','/playtester-chat/access',{userId:admin,approved:true},{},'owner-grant-request-001');
    assert.equal((await f.chat.authorize({...actor,subject:admin})).owner,false);
    await assert.rejects(f.chat.handle({...actor,subject:admin},'POST','/playtester-chat/access',{userId:tester,approved:true},{},'admin-grant-request-001'),/Only the Discord server owner/);
    f.deny(); await assert.rejects(f.chat.authorize({...actor,subject:admin}),/Permission lost/);
  } finally {f.db.close();}
});
test('real DM intake saves redacted diagnostics once and honors chat off', async () => {
  const f = fixture();try {
    await f.chat.receive(f.message('My log','message-1',true));
    await f.chat.receive(f.message('Duplicate','message-1'));
    const rows = f.chat.data.thread('alpha',tester).messages;
    assert.equal(rows.length,1);assert.equal(rows[0].attachments.length,1);
    const bytes = f.chat.data.file(rows[0].attachments[0].id).bytes;
    assert.ok(!Buffer.from(bytes).toString().includes('127.0.0.1'));
    await f.chat.receive(f.message('chat off','message-2'));
    await f.chat.receive(f.message('Do not forward','message-3'));
    assert.equal(f.chat.data.thread('alpha',tester).messages.length,1);
    assert.ok(f.notices.some(value => value.includes('privately')));
  } finally {f.db.close();}
});
test('queued reply rechecks staff after Discord lookup and cancels on revocation', async () => {
  const f = fixture();try {
    f.chat.data.reply(actor,'alpha',tester,'Hello','staff-reply-request-001');
    f.revokeDuringLookup();await f.chat.deliver();
    assert.equal(f.sent.length,0);assert.equal(f.chat.data.thread('alpha',tester).messages[0].status,'cancelled');
  } finally {f.db.close();}
});
test('ambiguous sends are marked unknown without replay and broadcasts make Discord optional', async () => {
  const f = fixture();try {
    f.chat.data.reply(actor,'alpha',tester,'Hello','staff-reply-request-002');
    f.ambiguous();await f.chat.deliver();await f.chat.deliver();
    assert.equal(f.chat.data.thread('alpha',tester).messages[0].status,'unknown');
  } finally {f.db.close();}
  const f2 = fixture();try {
    const update = f2.chat.data.broadcast(actor,'alpha','New build','staff-update-request-001');await f2.chat.deliver();
    assert.equal(f2.chat.data.delivery(update.broadcastId).counts.sent,1);
    assert.match(f2.sent[0],/recommended, but optional/);
    assert.match(f2.sent[0],/updates off/);
  } finally {f2.db.close();}
});

test('retrying an old approval cannot undo a later revocation', async () => {
  const f = fixture();try {
    const path = '/playtester-chat/access',body = {userId:admin,approved:true};
    await f.chat.handle(actor,'POST',path,body,{},'approval-replay-first');
    await f.chat.handle(actor,'POST',path,{...body,approved:false},{},'approval-replay-revoke');
    await f.chat.handle(actor,'POST',path,body,{},'approval-replay-first');
    assert.equal(f.chat.data.approved(admin),false);
  } finally {f.db.close();}
});
test('chat off during an attachment fetch stops that message from being forwarded', async () => {
  const f = fixture();try {
    let release!:(value:Response) => void;
    const waiting = new Promise<Response>(resolve => {release=resolve;});
    const chat = new PlaytesterChat(f.store,async () => ({owner:true,userId:owner}),async () => {},async () => {},'https://discord.gg/example',async () => waiting);
    const pending = chat.receive(f.message('Uploading','stop-race-1',true));
    await Promise.resolve();
    await chat.receive(f.message('chat off','stop-race-2'));
    release(new Response('diagnostics'));await pending;
    assert.equal(chat.data.thread('alpha',tester).messages.length,0);
  } finally {f.db.close();}
});
test('a full attachment store rejects intake before downloading any bytes', async () => {
  const f = fixture();try {
    f.store.db.prepare('INSERT INTO cs_chat_files VALUES (?,?,?,?,zeroblob(?))').run('quota',0,'old.log','text',100*1024*1024);
    let downloads=0;
    const chat = new PlaytesterChat(f.store,async () => ({owner:true,userId:owner}),async () => {},async () => {},'https://discord.gg/example',async () => {downloads++;return new Response('diagnostics');});
    await chat.receive(f.message('Uploading','full-store-1',true));assert.equal(downloads,0);
  } finally {f.db.close();}
});
test('campaign updates remain deliverable after a long campaign queue delay', async context => {
  context.mock.timers.enable({apis:['Date'],now:Date.now()});
  const f = fixture();try {
    const receipt=f.chat.data.broadcast(actor,'alpha','Build update','long-broadcast-request');
    context.mock.timers.tick(20*60000);await f.chat.deliver();
    assert.equal(f.chat.data.delivery(receipt.broadcastId).counts.sent,1);
  } finally {context.mock.timers.reset();f.db.close();}
});
