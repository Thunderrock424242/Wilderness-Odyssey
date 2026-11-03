import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AccessAuthenticator, loadJose } from '../src/connected/auth';
import { AdminService } from '../src/connected/admin';
import { DashboardAuth } from '../src/connected/dashboardAuth';
import { ParticipantService } from '../src/connected/participant';
import { ConnectedHttp } from '../src/connected/http';
import { loadConnectedConfig } from '../src/connected/config';
import { ConnectedStore, ServiceError } from '../src/connected/store';
import { IdentityService } from '../src/connected/identity';
import { ModerationService } from '../src/connected/moderation';
import { ServiceMonitor } from '../src/connected/monitor';
import { PlaytesterChat } from '../src/connected/playtesterChat';
import { configurationView } from '../src/connected/configurationView';
const user = '123456789012345678', guild = '234567890123456789', redirectUri = 'https://staff.example/api/auth/discord/callback';
async function fixture() {
  const db = new DatabaseSync(':memory:'), store = new ConnectedStore(db);
  let permitted = true, unavailable = false, afterCheck = () => {};
  const config = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true', CONNECTED_ADMIN_ENABLED: 'true', STAFF_AUTH_MODE: 'discord', GUILD_ID: guild, CLIENT_ID: user, DISCORD_CLIENT_SECRET: 'secret', DISCORD_REDIRECT_URI: redirectUri, ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', BACKEND_ACCESS_AUDIENCE: 'backend', GATEWAY_SERVICE_ID: 'gateway' });
  const auth = new DashboardAuth(store, config.discord!, async () => {
    afterCheck();
    if (unavailable) throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Unavailable');
    if (!permitted) throw new ServiceError(403, 'PERMISSION_LOST', 'Administrator required');
  }, async input => String(input).endsWith('/oauth2/token') ? Response.json({ access_token: 'discard', token_type: 'Bearer', scope: 'identify' }) : Response.json({ id: user, username: 'Admin' }));
  const identity = new IdentityService(store, 'official'), monitor = new ServiceMonitor(store, 'official'), moderation = new ModerationService(store, identity);
  const admin = new AdminService(store, monitor, moderation, undefined, (actor, capability, verifyDiscord) => auth.authorize(actor, capability, verifyDiscord), 'https://gateway.example');
  admin.configuration = () => configurationView(config,admin.content.setup());
  const participant = new ParticipantService(store, config.discord!, async input => String(input).endsWith('/oauth2/token') ? Response.json({ access_token: 'discard', token_type: 'Bearer', scope: 'identify' }) : Response.json({ id: user, username: 'Tester' }));
  const chat = new PlaytesterChat(store,async actor => { await auth.authorize(actor,'server:write');return {owner:actor.subject === user,userId:actor.subject!}; },async () => {},async (_user,_body,verify) => {await verify();},'https://discord.gg/example');
  const handler = new ConnectedHttp(config, store, monitor, identity, moderation, admin, auth, participant,undefined,chat);
  const { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } = await loadJose();
  const keys = await generateKeyPair('RS256'), jwk = { ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' };
  const verifier = new AccessAuthenticator(store, config.trust, createLocalJWKSet({ keys: [jwk] }));
  handler.staffAuth.machine = headers => verifier.machine(headers);
  const machine = await new SignJWT({ common_name: 'gateway' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(config.trust.issuer).setAudience('backend').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  const headers = { 'cf-access-jwt-assertion': machine, 'x-wo-environment': 'production', 'x-request-id': 'dashboard-test-request', 'content-type': 'application/json' };
  const server = createServer((req, res) => { void handler.handle(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const call = (path: string, body?: unknown, session?: string, extra: Record<string, string> = {}, method = body === undefined ? 'GET' : 'POST') => fetch(base + '/v1/admin' + path, { method, headers: { ...headers, ...(session ? { 'x-wo-admin-session': session } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = async () => {
    const startResponse = await call('/auth/discord/start', { redirectUri });
    assert.equal(startResponse.status, 200);
    const start = await startResponse.json() as { authorizationUrl: string; flowToken: string };
    return call('/auth/discord/callback', { redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
  };
  return { db, store, auth, admin, handler, call, login, server, headers, permission: (allowed: boolean) => { permitted = allowed; }, outage: (value: boolean) => { unavailable = value; }, afterCheck: (fn: () => void) => { afterCheck = fn; }, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); } };
}

test('website playtest routes expose capabilities, persist campaigns and reuse the active session across navigation', async () => {
  const f = await fixture();
  try {
    await f.auth.enroll(user, guild, true);
    const { sessionToken } = await (await f.login()).json() as { sessionToken: string };
    const session = await (await f.call('/session', undefined, sessionToken)).json() as { capabilities: string[] };
    assert.ok(session.capabilities.includes('playtests:read'));
    const created = await f.call('/playtests', { title: 'Live backend integration', build: '0.2', retentionDays: 7 }, sessionToken, { 'idempotency-key': 'website-playtest-create-001' });
    assert.equal(created.status, 200);
    f.outage(true);
    for (const path of ['/session', '/playtests', '/content/transmissions', '/incidents', '/configuration', '/content/setup']) assert.equal((await f.call(path, undefined, sessionToken)).status, 200, path);
    assert.equal((await f.call('/playtests', { title: 'Rejected during outage', build: '0.3', retentionDays: 7 }, sessionToken, { 'idempotency-key': 'website-playtest-create-002' })).status, 503);
    await f.auth.enroll(user, guild, false);
    assert.equal((await f.call('/session', undefined, sessionToken)).status, 401);
  } finally { await f.close(); }
});
test('hosted editor permissions and draft routes work through the real staff HTTP pipeline', async () => {
  const f = await fixture();
  try {
    await f.auth.enroll(user,guild,true);
    const logged = await (await f.login()).json() as { sessionToken:string };
    const session = await (await f.call('/session',undefined,logged.sessionToken)).json() as { capabilities:string[] };
    assert.ok(session.capabilities.includes('content:read'));
    assert.ok(session.capabilities.includes('content:write'));
    assert.equal((await f.call('/content/transmissions')).status,401);
    const list = await f.call('/content/transmissions',undefined,logged.sessionToken);
    assert.equal(list.status,200);
    assert.deepEqual(await list.json(),{ schemaVersion:'1.0',records:[] });
    const content = { slug:'alpha-test',title:'Alpha test',description:'A new expedition update.',publishedAt:'2026-11-02',type:'news',author:'Staff',tags:['testing'],featured:false,draft:true,galleryImages:[],bodyMarkdown:'## Expedition\n\nA private draft.' };
    const create = { content,revision:null,sourceRevision:null };
    const key = { 'idempotency-key':'create-content-http-001' };
    const response = await f.call('/content/transmissions',create,logged.sessionToken,key);
    assert.equal(response.status,200);
    const saved = await response.json() as { transmission:{ revision:string;sourceRevision:null };publishing:{state:string} };
    assert.equal(saved.publishing.state,'draft-saved');
    assert.equal(saved.transmission.sourceRevision,null);
    assert.deepEqual(await (await f.call('/content/transmissions',create,logged.sessionToken,key)).json(),saved);
    assert.equal((await f.call('/content/transmissions',create,logged.sessionToken,{ 'idempotency-key':'create-content-http-002' })).status,409);
    const update = { content:{ ...content,bodyMarkdown:'A revised draft.' },revision:saved.transmission.revision,sourceRevision:null };
    assert.equal((await f.call('/content/transmissions/alpha-test',update,logged.sessionToken,{ 'idempotency-key':'update-content-http-001' },'PUT')).status,200);
    assert.equal((await f.call('/content/transmissions/alpha-test',update,logged.sessionToken,{ 'idempotency-key':'update-content-http-002' },'PUT')).status,409);
    assert.equal((await f.call('/content/transmissions',{ ...create,content:{...content,slug:'unsafe',bodyMarkdown:'[bad](javascript:alert(1))'} },logged.sessionToken,{ 'idempotency-key':'unsafe-content-http-001' })).status,422);
    assert.equal((await f.call('/content/transmissions',{ ...create,content:{...content,slug:'html-test',bodyMarkdown:'<script>alert(1)</script>'} },logged.sessionToken,{ 'idempotency-key':'unsafe-content-http-002' })).status,422);
    f.permission(false);
    assert.equal((await f.call('/content/transmissions',undefined,logged.sessionToken)).status,200);
    assert.equal((await f.call('/content/transmissions',create,logged.sessionToken,{ 'idempotency-key':'demoted-content-http-001' })).status,403);
    assert.equal((await f.call('/content/transmissions',undefined,logged.sessionToken)).status,401);
  } finally { await f.close(); }
});

test('playtester inbox HTTP protects conversations and downloads with current signed staff identity', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/playtester-chat')).status,401);
    await f.auth.enroll(user,guild,true);
    const logged = await (await f.login()).json() as {sessionToken:string};
    const home = await f.call('/playtester-chat',undefined,logged.sessionToken);
    assert.equal(home.status,200);assert.equal((await home.json() as {owner:boolean}).owner,true);
    assert.equal((await f.call('/playtester-chat',undefined,logged.sessionToken,{'cf-access-jwt-assertion':'forged'})).status,401);
    f.handler.participant!.createCampaign('inbox','Inbox');
    const tester = '345678901234567890';
    f.handler.participant!.claim(tester,f.handler.participant!.invite(tester,'inbox','http-chat-tester-invite',24).token);
    f.handler.chat!.data.receive(tester,'inbox','discord-message-1','A private log',[{name:'latest.log',kind:'text',bytes:Buffer.from('private diagnostics')}]);
    const thread = await f.call('/playtester-chat/threads/inbox/' + tester,undefined,logged.sessionToken);
    assert.equal(thread.status,200);
    const messages = await thread.json() as {messages:{attachments:{id:string}[]}[]};
    const id = messages.messages[0].attachments[0].id;
    const download = await f.call('/playtester-chat/attachments/' + id,undefined,logged.sessionToken);
    assert.equal(download.headers.get('cache-control'),'no-store');
    assert.equal(download.headers.get('content-type'),'text/plain; charset=utf-8');
    assert.match(download.headers.get('content-disposition')!,/^attachment;/);
    assert.equal(await download.text(),'private diagnostics');
    assert.equal((await f.call('/playtester-chat/threads/inbox/' + tester + '/reply',{body:'Reply'},logged.sessionToken,{'idempotency-key':'reply-http-request-001'})).status,200);
    f.permission(false);
    assert.equal((await f.call('/playtester-chat/attachments/' + id,undefined,logged.sessionToken)).status,403);
  } finally {await f.close();}
});

test('private editor images validate bytes and require current administrator access', async () => {
  const f = await fixture();
  try {
    await f.auth.enroll(user,guild,true);
    const logged = await (await f.login()).json() as { sessionToken:string };
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
    const upload = (bytes:Buffer,type = 'image/png',id = 'upload-content-image-001') => fetch('http://127.0.0.1:' + (f.server.address() as {port:number}).port + '/v1/admin/content/media',{ method:'POST',headers:{ ...f.headers,'x-wo-admin-session':logged.sessionToken,'idempotency-key':id,'content-type':type,'x-wo-media':JSON.stringify({ slug:'alpha',purpose:'cover',fileName:'cover.png',mimeType:type }) },body:new Uint8Array(bytes) });
    const uploaded = await upload(png); assert.equal(uploaded.status,200);
    const image = await uploaded.json() as {id:string;src:string;previewUrl:string};
    assert.match(image.src,/^\/images\/transmissions\/alpha\/[a-f0-9-]+\.png$/);
    const read = await f.call('/content/media/' + image.id,undefined,logged.sessionToken);
    assert.equal(read.status,200); assert.equal(read.headers.get('content-type'),'image/png');
    assert.equal(read.headers.get('cache-control'),'no-store');
    assert.deepEqual(Buffer.from(await read.arrayBuffer()),png);
    assert.equal((await f.call('/content/media/' + image.id)).status,401);
    assert.equal((await upload(Buffer.from('<svg><script>bad</script></svg>'),'image/png','upload-content-image-002')).status,422);
    f.permission(false);
    assert.equal((await f.call('/content/media/' + image.id,undefined,logged.sessionToken)).status,200);
    assert.equal((await upload(png,'image/png','upload-after-demotion-001')).status,403);
    assert.equal((await f.call('/content/media/' + image.id,undefined,logged.sessionToken)).status,401);
  } finally { await f.close(); }
});

test('participant HTTP keeps machine auth and staff permission boundaries', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/participant/start', { redirectUri }, undefined, { 'cf-access-jwt-assertion': 'forged' })).status, 401);
    const start = await (await f.call('/participant/start', { redirectUri })).json() as { authorizationUrl: string; flowToken: string };
    const callback = await f.call('/participant/callback', { redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
    assert.equal(callback.status, 200);
    const logged = await callback.json() as { sessionToken: string };
    const extra = { 'x-wo-participant-session': logged.sessionToken };
    assert.equal((await f.call('/participant/session', undefined, undefined, extra)).status, 200);
    assert.equal((await f.call('/session', undefined, logged.sessionToken)).status, 401);
    assert.equal((await f.call('/participant/home?userId=someone', undefined, undefined, extra)).status, 400);
    assert.equal((await f.call('/participant/claim', { token: 'x'.repeat(43) }, undefined, extra)).status, 403);
    assert.equal((await f.call('/participant/logout', {}, undefined, extra)).status, 200);
    assert.equal((await f.call('/participant/home', undefined, undefined, extra)).status, 401);
  } finally { await f.close(); }
});

test('HTTP brokers OAuth/session/logout with machine-only Access and preserves admin revision/idempotency rules', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call('/auth/discord/start', { redirectUri }, undefined, { 'cf-access-jwt-assertion': 'forged' })).status, 401);
    assert.equal((await f.call('/auth/discord/start', { redirectUri }, undefined, { 'x-wo-environment': 'preview' })).status, 401);
    assert.equal((await f.login()).status, 403);
    await f.auth.enroll(user, guild, true);
    const response = await f.login(); assert.equal(response.status, 200);
    const session = await response.json() as { sessionToken: string; expiresAt: string };
    const current = await f.call('/session', undefined, session.sessionToken); assert.equal(current.status, 200);
    const data = await current.json() as { user: { id: string; role: string }; guildId: string; expiresAt: string };
    assert.deepEqual(data.user, { id: user, displayName: 'Admin', role: 'administrator' });
    assert.equal(data.guildId, guild); assert.equal(data.expiresAt, session.expiresAt);
    const body = { active: false, services: [], message: '', startsAt: null, endsAt: null, reason: 'Planned service maintenance', revision: 'initial' };
    const first = await f.call('/maintenance', body, session.sessionToken, { 'idempotency-key': 'dashboard-maintenance-001' }, 'PUT');
    assert.equal(first.status, 200);
    assert.deepEqual(await (await f.call('/maintenance', body, session.sessionToken, { 'idempotency-key': 'dashboard-maintenance-001' }, 'PUT')).json(), await first.json());
    assert.equal((await f.call('/maintenance', body, session.sessionToken, { 'idempotency-key': 'dashboard-maintenance-002' }, 'PUT')).status, 409);
    f.outage(true); assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 200);
    f.outage(false); assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 200);
    f.permission(false); assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 200);
    assert.equal((await f.call('/maintenance', body, session.sessionToken, { 'idempotency-key': 'demoted-maintenance-001' }, 'PUT')).status, 403);
    assert.equal((await f.call('/auth/logout', {}, session.sessionToken)).status, 200);
    assert.equal((await f.call('/auth/logout', {}, session.sessionToken)).status, 200);
    assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 401);
    assert.equal((await f.call('/session', undefined, undefined, { 'x-wo-user-assertion': 'legacy-human' })).status, 401);
  } finally { await f.close(); }
});

test('HTTP rechecks permission after slow body uploads before mutating', async () => {
  const f = await fixture();
  try {
    await f.auth.enroll(user, guild, true);
    const session = await (await f.login()).json() as { sessionToken: string };
    let checked!: () => void;
    const ready = new Promise<void>(resolve => { checked = resolve; });
    f.afterCheck(() => { checked(); });
    const status = new Promise<number>((resolve, reject) => {
      const req = httpRequest({ hostname: '127.0.0.1', port: (f.server.address() as { port: number }).port, path: '/v1/admin/maintenance', method: 'PUT', headers: { ...f.headers, 'x-wo-admin-session': session.sessionToken, 'idempotency-key': 'upload-maintenance-001' } }, res => { res.resume(); resolve(res.statusCode!); });
      req.on('error', reject); req.write('{');
      void ready.then(() => { f.permission(false); req.end('"active":false,"services":[],"message":"","startsAt":null,"endsAt":null,"reason":"Planned service maintenance","revision":"initial"}'); });
    });
    assert.equal(await status, 403);
    assert.equal(f.store.operationRows().length, 0);
  } finally { await f.close(); }
});

test('OAuth attempts, callbacks and staff requests have bounded rate limits', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 20; i++) assert.equal((await f.call('/auth/discord/start', { redirectUri })).status, 200);
    assert.equal((await f.call('/auth/discord/start', { redirectUri })).status, 429);
    for (let i = 0; i < 30; i++) assert.equal((await f.call('/auth/discord/callback', { redirectUri, code: 'code', state: 'x'.repeat(43), flowToken: 'y'.repeat(43) })).status, 401);
    assert.equal((await f.call('/auth/discord/callback', { redirectUri, code: 'code', state: 'x'.repeat(43), flowToken: 'y'.repeat(43) })).status, 429);
    await f.auth.enroll(user, guild, true);
    const start = f.auth.start({ redirectUri });
    const session = await f.auth.callback({ redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
    for (let i = 0; i < 120; i++) assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 200);
    assert.equal((await f.call('/session', undefined, session.sessionToken)).status, 429);
  } finally { await f.close(); }
});

test('playtest administration and downloads require signed machine identity and current dashboard authority', async () => {
  const f = await fixture();
  try {
    const body = { id: 'campaign-test', title: 'Private test', reason: 'Create approved test campaign' };
    assert.equal((await f.call('/playtest/campaigns', body, undefined, { 'x-wo-user-id': user, 'x-wo-user-role': 'administrator' })).status, 401);
    await f.auth.enroll(user, guild, true);
    const { sessionToken } = await (await f.login()).json() as { sessionToken: string };
    assert.equal((await f.call('/playtest/campaigns', body, sessionToken, { 'idempotency-key': 'playtest-signed-create', 'cf-access-jwt-assertion': 'forged' })).status, 401);
    assert.equal((await f.call('/playtest/campaigns', body, sessionToken, { 'idempotency-key': 'playtest-signed-create' })).status, 200);
    assert.equal((await f.call('/playtest/campaigns', undefined, sessionToken)).status, 200);
    f.outage(true);
    assert.equal((await f.call('/playtest/campaigns', undefined, sessionToken)).status, 200);
    f.outage(false);
    f.permission(false);
    assert.equal((await f.call('/playtest/artifacts/12345678-1234-4234-8234-123456789012/download', undefined, sessionToken)).status, 403);
    assert.equal((await f.call('/playtest/campaigns', undefined, sessionToken)).status, 401);
    assert.equal(f.store.records('pt_campaign').length, 1);
  } finally { await f.close(); }
});

test('active administrator reuses verified identity for own participant home without enrollment', async () => {
  const f = await fixture();
  try {
    await f.auth.enroll(user, guild, true);
    const { sessionToken } = await (await f.login()).json() as { sessionToken: string };
    f.handler.participant!.createCampaign('private', 'Private');
    const other = '345678901234567890';
    f.handler.participant!.claim(other, f.handler.participant!.invite(other, 'private', 'other-admin-home-invite', 24).token);
    const response = await f.call('/participant/session', undefined, sessionToken);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { campaignIds: string[] }).campaignIds, []);
    const home = await f.call('/participant/home', undefined, sessionToken);
    assert.equal(home.status, 200);
    assert.deepEqual((await home.json() as { user: { id: string }; campaigns: unknown[] }), {
      schemaVersion: '1.0', user: { id: user, displayName: 'Admin' },
      stats: { recordedSeconds: 0, sessions: 0, unknownDurationSessions: 0 }, campaigns: [], invitations: [],
    });
    assert.equal((f.db.prepare('SELECT count(*) AS n FROM cs_participant_sessions').get() as { n: number }).n, 0);
    assert.equal((f.db.prepare('SELECT count(*) AS n FROM cs_participant_memberships WHERE user_id=?').get(user) as { n: number }).n, 0);
    f.auth.logout(sessionToken);
    assert.equal((await f.call('/participant/home', undefined, sessionToken)).status, 401);
  } finally { await f.close(); }
});

test('shared participant access rejects expired and disabled admin sessions and preserves separate tester identity', async () => {
  const f = await fixture();
  try {
    await f.auth.enroll(user, guild, true);
    const { sessionToken } = await (await f.login()).json() as { sessionToken: string };
    const start = f.handler.participant!.start({ redirectUri });
    const testerLogin = await f.handler.participant!.callback({ redirectUri, code: 'code', state: new URL(start.authorizationUrl).searchParams.get('state'), flowToken: start.flowToken });
    const tester = '345678901234567890';
    f.db.prepare('UPDATE cs_participant_sessions SET user_id=?,name=?').run(tester, 'Separate tester');
    const separate = await f.call('/participant/session', undefined, sessionToken, { 'x-wo-participant-session': testerLogin.sessionToken });
    assert.equal(separate.status, 200);
    assert.equal((await separate.json() as { user: { id: string } }).user.id, tester);
    f.db.prepare('UPDATE cs_dashboard_sessions SET expires_at=0').run();
    assert.equal((await f.call('/participant/session', undefined, sessionToken)).status, 401);
    const fresh = await (await f.login()).json() as { sessionToken: string };
    await f.auth.enroll(user, guild, false);
    assert.equal((await f.call('/participant/home', undefined, fresh.sessionToken)).status, 401);
    assert.equal((await f.call('/participant/session', undefined, fresh.sessionToken, { 'x-wo-participant-session': testerLogin.sessionToken })).status, 200);
  } finally { await f.close(); }
});
