import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConnectedStore } from '../src/connected/store';
import { ParticipantService } from '../src/connected/participant';

const user = '123456789012345678', other = '345678901234567890', guild = '234567890123456789';
const redirectUri = 'https://site.example/api/auth/discord/callback';
function fixture() {
  const db = new DatabaseSync(':memory:'); let now = Date.now();
  const store = new ConnectedStore(db, () => now);
  store.put('pt_campaign', 'alpha', 'alpha', { id: 'alpha', title: 'Alpha', enabled: false });
  const service = new ParticipantService(store, { guildId: guild, clientId: user, clientSecret: 'test-secret', redirectUri }, async url => String(url).endsWith('/oauth2/token')
    ? Response.json({ access_token: 'discard', token_type: 'Bearer', scope: 'identify' }) : Response.json({ id: user, username: 'Tester' }));
  return { db, store, service, advance: (ms: number) => { now += ms; } };
}
test('claims are account-bound, hash-only, expiring and independent from game invitations', () => {
  const f = fixture(); try {
    const invite = f.service.invite(user, 'alpha', 'key-for-invitation-1', 24);
    assert.throws(() => f.service.claim(other, invite.token), /account/i);
    assert.equal(f.store.records('pt_invite').length, 0);
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM cs_participant_invites').all()).includes(invite.token));
    f.service.claim(user, invite.token); f.service.claim(user, invite.token);
    assert.equal(f.service.home(user, 'Tester').campaigns.length, 1);
    const second = f.service.invite(other, 'alpha', 'key-for-invitation-2', 1);
    f.advance(3600001); assert.throws(() => f.service.claim(other, second.token), /expired/i);
    f.service.revoke(user, 'alpha');
    assert.equal(f.service.home(user, 'Tester').campaigns.length, 0);
    assert.throws(() => f.service.claim(user, invite.token));
  } finally { f.db.close(); }
});
test('participant storage cannot be silently reused for a different Discord guild', () => {
  const f = fixture(); try {
    assert.throws(() => new ParticipantService(f.store, { guildId: other, clientId: user, clientSecret: 'test', redirectUri }), /guild/i);
  } finally { f.db.close(); }
});
test('staff campaign creation starts with collection off and preserves existing campaigns', () => {
  const f = fixture(); try {
    f.service.createCampaign('beta','Beta expedition');
    const campaign = f.store.record<{ enabled:boolean; title:string }>('pt_campaign','beta')!;
    assert.equal(campaign.enabled,false); assert.equal(campaign.title,'Beta expedition');
    assert.throws(() => f.service.createCampaign('beta','Overwrite'));
    assert.throws(() => f.service.createCampaign('../unsafe','Unsafe'));
  } finally { f.db.close(); }
});
test('history pagination does not change totals and revoked accounts cannot reclaim old links', () => {
  const f = fixture(); try {
    const invitation = f.service.invite(user, 'alpha', 'key-for-pagination', 24);
    f.service.claim(user, invitation.token);
    f.store.put('pt_tester', 'alpha:mine', 'alpha', { id: 'mine', campaignId: 'alpha', discordUserId: user, revokedAt: null });
    for (let i=0; i<30; i++) {
      const id = 'session-' + i, startedAt = new Date(i * 60000).toISOString();
      f.store.put('pt_session', id, 'alpha:mine', { id, campaignId: 'alpha', testerId: 'mine', firstArtifactAt: startedAt, state: 'ended' });
      f.store.put('pt_session_metadata', id, 'alpha:mine', { startedAt, durationSeconds: 60, build: 'alpha' });
    }
    assert.equal(f.service.home(user,'Tester').stats.recordedSeconds,1800);
    const page = f.service.history(user,undefined); assert.equal(page.sessions.length,25);
    assert.equal(f.service.history(user,page.nextCursor!).sessions.length,5);
    assert.equal(f.service.home(user,'Tester').stats.recordedSeconds,1800);
    f.service.revoke(user,'alpha'); assert.throws(() => f.service.claim(user,invitation.token));
  } finally { f.db.close(); }
});
test('participant OAuth cannot authenticate to the administrator session tables', async () => {
  const f = fixture(); try {
    const started = f.service.start({ redirectUri });
    const body = { redirectUri, code: 'valid-code', state: new URL(started.authorizationUrl).searchParams.get('state'), flowToken: started.flowToken };
    const logged = await f.service.callback(body);
    assert.equal(f.service.session(logged.sessionToken).user.id, user);
    assert.equal(f.store.records('staff').length, 0);
    await assert.rejects(f.service.callback(body));
    f.service.logout(logged.sessionToken); assert.throws(() => f.service.session(logged.sessionToken));
  } finally { f.db.close(); }
});
test('history filters by Discord ownership, omits staff fields and unions known intervals', () => {
  const f = fixture(); try {
    f.service.claim(user, f.service.invite(user, 'alpha', 'key-for-invitation-3', 24).token);
    f.store.put('pt_tester', 'alpha:mine', 'alpha', { id: 'mine', campaignId: 'alpha', discordUserId: user, revokedAt: null });
    f.store.put('pt_tester', 'alpha:other', 'alpha', { id: 'other', campaignId: 'alpha', discordUserId: other, revokedAt: null });
    for (const [id, testerId, start, duration] of [['one','mine',0,100],['two','mine',50,100],['three','mine',200,null],['secret','other',0,900]] as const) {
      f.store.put('pt_session', id, 'alpha:' + testerId, { id, campaignId: 'alpha', testerId, installation: 'private', firstArtifactAt: new Date(start * 1000).toISOString(), lastArtifactAt: new Date((start + 100) * 1000).toISOString(), state: 'ended', notes: 'PRIVATE STAFF NOTE' });
      f.store.put('pt_session_metadata', id, id, { startedAt: new Date(start * 1000).toISOString(), durationSeconds: duration, build: 'alpha-1' });
    }
    const home = f.service.home(user, 'Tester');
    assert.equal(home.stats.recordedSeconds, 150); assert.equal(home.stats.unknownDurationSessions, 1);
    const history = f.service.history(user, undefined);
    assert.equal(history.sessions.length, 3);
    assert.ok(!JSON.stringify(history).includes('PRIVATE'));
    assert.ok(!JSON.stringify(history).includes('secret'));
    f.service.revoke(user, 'alpha'); assert.equal(f.service.history(user, undefined).sessions.length, 0);
  } finally { f.db.close(); }
});
