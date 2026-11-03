import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ConnectedStore } from '../src/connected/store';
import { PlaytesterChatStore } from '../src/connected/playtesterChatStore';
const user = '123456789012345678',other = '234567890123456789';
function fixture() {
  const db = new DatabaseSync(':memory:'),store = new ConnectedStore(db);
  db.exec('CREATE TABLE cs_participant_memberships(user_id TEXT,campaign_id TEXT,active INTEGER); CREATE TABLE cs_participant_invites(user_id TEXT,campaign_id TEXT,revoked INTEGER,expires_at INTEGER,claimed_at TEXT)');
  for (const id of ['alpha','beta']) store.put('pt_campaign',id,id,{id,title:id});
  db.prepare('INSERT INTO cs_participant_memberships VALUES (?,?,1)').run(user,'alpha');
  return {db,store,chat:new PlaytesterChatStore(store)};
}
test('tester conversations route to one campaign and deduplicate Discord messages', () => {
  const f = fixture();try {
    assert.equal(f.chat.route(user),'alpha'); assert.equal(f.chat.route(other),null);
    f.chat.receive(user,'alpha','message-1','Hello',[]);
    f.chat.receive(user,'alpha','message-1','Duplicate',[]);
    assert.equal(f.chat.thread('alpha',user).messages.length,1);
    f.db.prepare('INSERT INTO cs_participant_memberships VALUES (?,?,1)').run(user,'beta');
    assert.equal(f.chat.route(user),null);
    f.chat.select(user,'beta'); assert.equal(f.chat.route(user),'beta');
    f.chat.setEnabled(user,false); assert.equal(f.chat.route(user),null);
    f.chat.setEnabled(user,true); assert.equal(f.chat.route(user),'beta');
    f.db.prepare('UPDATE cs_participant_memberships SET active=0').run();
    assert.equal(f.chat.route(user),null);
  } finally {f.db.close();}
});
test('pending invitations allow outside testers while expiry and revocation block them', () => {
  const f = fixture();try {
    f.db.prepare('INSERT INTO cs_participant_invites VALUES (?,?,0,?,NULL)').run(other,'alpha',Date.now()+60000);
    assert.equal(f.chat.route(other),'alpha');
    f.db.prepare('UPDATE cs_participant_invites SET revoked=1').run(); assert.equal(f.chat.route(other),null);
  } finally {f.db.close();}
});
test('queued replies are idempotent and broadcasts snapshot only eligible opted-in testers', () => {
  const f = fixture();try {
    const actor = {id:'admin',role:'administrator' as const,subject:other};
    const first = f.chat.reply(actor,'alpha',user,'Reply','reply-idempotency-001');
    assert.deepEqual(f.chat.reply(actor,'alpha',user,'Reply','reply-idempotency-001'),first);
    assert.throws(() => f.chat.reply(actor,'alpha',user,'Changed','reply-idempotency-001'));
    f.chat.setUpdates(user,false);
    assert.equal(f.chat.broadcast(actor,'alpha','Update','broadcast-request-001').recipients,0);
    f.chat.setUpdates(user,true);
    assert.equal(f.chat.broadcast(actor,'alpha','Update','broadcast-request-002').recipients,1);
  } finally {f.db.close();}
});
