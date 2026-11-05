import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { chatRequestSchema, chatResponseSchema } from '../src/contracts/v1/aether-chat';
import { loadAetherConfig } from '../src/aether/config';
import { RemoteModelProvider } from '../src/aether/providers/remoteProvider';
import { DEFAULT_AETHER_PREFERENCES } from '../src/aether/memory/types';
import type { AetherRequest } from '../src/aether/types';
import { AetherCore } from '../src/aether/core';
import { AetherContextBuilder } from '../src/aether/contextBuilder';
import { AetherRouter } from '../src/aether/router';
import { AetherPermissionManager } from '../src/aether/permissionManager';
import { AetherRateLimiter } from '../src/aether/rateLimiter';
import { DisabledAetherMemory } from '../src/aether/memory';
import { DisabledMinecraftBridge } from '../src/aether/bridge/disabledBridge';
import { GeneralAgent } from '../src/aether/agents/generalAgent';
import { createAetherModelProvider } from '../src/aether/providers';

const env = {
  AETHER_AI_PROVIDER: 'remote', AETHER_INFERENCE_ORIGIN: 'https://approved.example',
  AETHER_INFERENCE_TOKEN: 'test-inference-token-00000000000000000001',
  AETHER_INFERENCE_SERVER_ID: 'official-server', AETHER_INFERENCE_MODEL: 'qwen3.5:4b',
};
const request: AetherRequest = {
  requestId: '00000000-0000-4000-8000-000000000001', sourcePlatform: 'discord',
  userIdentity: { platformUserId: '123456789012345678', displayName: 'private-name' },
  guildOrServerId: '223456789012345678', message: 'Hello', attachments: [],
  permissions: ['profile:self'], timestamp: new Date().toISOString(),
};
const context = { profile: null, preferences: DEFAULT_AETHER_PREFERENCES,
  conversationSummary: 'private memory', loreDiscoveries: ['private'], playerContext: {} };
const reply = (id = request.requestId) => ({schemaVersion: '1.0', requestId: id,
  serverId: 'official-server', model: 'qwen3.5:4b', success: true, response: 'Hello explorer.'});

test('remote configuration fails closed for missing, unsafe or reused private settings', () => {
  assert.ok(loadAetherConfig(env).remote);
  for (const changes of [
    { AETHER_INFERENCE_ORIGIN: 'http://approved.example' },
    { AETHER_INFERENCE_ORIGIN: 'https://approved.example/admin' },
    { AETHER_INFERENCE_ORIGIN: 'https://user:pass@approved.example' },
    { AETHER_INFERENCE_TOKEN: '' },
    { AETHER_GATEWAY_ADMINISTRATION_TOKEN: env.AETHER_INFERENCE_TOKEN },
    { AETHER_INFERENCE_TIMEOUT_MS: '999999' },
    { AETHER_INFERENCE_MODEL: 'https://evil.example/model' },
  ]) {
    const config = loadAetherConfig({...env, ...changes});
    assert.equal(config.remote, undefined);
    assert.ok(config.issues.length);
  }
});

test('remote client uses inference scope, fixed route and isolated opaque identities, never profile data', async () => {
  const bodies: Record<string, unknown>[] = [];
  const provider = new RemoteModelProvider(loadAetherConfig(env).remote!, async (url, options) => {
    assert.equal(String(url), 'https://approved.example/v1/aether/chat');
    assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${env.AETHER_INFERENCE_TOKEN}`);
    bodies.push(JSON.parse(String(options?.body)));
    return Response.json(reply());
  });
  assert.equal(provider.isAvailable(), false);
  assert.equal(await provider.generateResponse(request, context), 'Hello explorer.');
  assert.equal(provider.isAvailable(), true);
  await provider.generateResponse({...request, guildOrServerId: '323456789012345678'}, context);
  await provider.generateResponse({...request, userIdentity: {platformUserId: '423456789012345678'}}, context);
  await provider.generateResponse({...request, sourcePlatform: 'minecraft'}, context);
  assert.notEqual(bodies[0].scopeId, bodies[1].scopeId);
  assert.notEqual(bodies[0].principalId, bodies[2].principalId);
  assert.notEqual(bodies[0].principalId, bodies[3].principalId);
  assert.doesNotMatch(JSON.stringify(bodies), /private|playerId|world|123456789012345678/);
  provider.close();
  assert.equal(provider.isAvailable(), false);
});

test('authentication, overload, malformed and mismatched responses fail honestly without fallback', async () => {
  for (const response of [
    new Response('', {status: 401}), new Response('', {status: 403}),
    new Response('', {status: 429}), new Response('', {status: 503}),
    Response.json({...reply(), model: 'wrong-model'}), Response.json(reply('wrong-id')),
    Response.json({...reply(), response: ''}), Response.json({...reply(), success: false}),
    new Response('not json', {headers: {'Content-Type': 'application/json'}}),
    new Response('x'.repeat(40000), {headers: {'Content-Type': 'application/json'}}),
    new Response('{}', {headers: {'Content-Type': 'text/html'}}),
  ]) {
    const provider = new RemoteModelProvider(loadAetherConfig(env).remote!, async () => response);
    await assert.rejects(provider.generateResponse(request, context));
    assert.equal(provider.isAvailable(), false);
    provider.close();
  }
});

test('deadline covers a stalled response body and close cancels active work', async () => {
  const settings = {...loadAetherConfig(env).remote!, timeoutMs: 25};
  const provider = new RemoteModelProvider(settings, async (_url, options) => new Response(new ReadableStream({
    start(controller) { options?.signal?.addEventListener('abort', () => controller.error(new Error('aborted'))); },
  }), {headers: {'Content-Type': 'application/json'}}));
  await assert.rejects(provider.generateResponse(request, context), /timed out/);
  const pending = provider.generateResponse(request, context);
  provider.close();
  await assert.rejects(pending);
});

test('global concurrency and guild rate limits reject before sending more upstream work', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const settings = {...loadAetherConfig(env).remote!, concurrency: 1, guildRequests: 1};
  const provider = new RemoteModelProvider(settings, async () => { await gate; return Response.json(reply()); });
  const pending = provider.generateResponse(request, context);
  await assert.rejects(provider.generateResponse(request, context), /busy/);
  release(); await pending;
  await assert.rejects(provider.generateResponse(request, context), /busy/);
  provider.close();
});

test('fresh inference status uses no monitoring/admin credential and stale health expires', async () => {
  let now = 1000;
  const provider = new RemoteModelProvider(loadAetherConfig(env).remote!, async url => {
    assert.equal(String(url), 'https://approved.example/v1/aether/chat/status');
    return Response.json({schemaVersion: '1.0', serverId: 'official-server', model: 'qwen3.5:4b', available: false});
  }, () => now);
  await provider.refreshAvailability();
  assert.equal(provider.isAvailable(), false);
  now += 31000;
  assert.equal(provider.isAvailable(), false);
  provider.close();
});

test('shared chat fixtures reject fabricated game fields and incompatible versions', () => {
  const fixture = JSON.parse(readFileSync('test/fixtures/aether-chat-v1.json', 'utf8'));
  assert.ok(chatRequestSchema.safeParse(fixture.request).success);
  assert.ok(chatResponseSchema.safeParse(fixture.response).success);
  for (const patch of fixture.invalidPatches) assert.equal(chatRequestSchema.safeParse({...fixture.request, ...patch}).success, false);
});

test('remote core preserves authorization and user limits; model failures are errors without scripted success', async () => {
  let permitted = false;
  let calls = 0;
  const provider = new RemoteModelProvider(loadAetherConfig(env).remote!, async () => {
    calls++;
    return calls === 1 ? Response.json(reply()) : new Response('', {status: 503});
  });
  const memory = new DisabledAetherMemory();
  const core = new AetherCore({...loadAetherConfig(env), enabled: true}, memory, provider,
    new DisabledMinecraftBridge(), new AetherRouter([new GeneralAgent(provider)], new AetherContextBuilder(memory)),
    new AetherPermissionManager(), new AetherRateLimiter(1, 60000), () => permitted);
  core.initialize();
  assert.equal((await core.routeRequest(request)).status, 'error');
  assert.equal(calls, 0);
  permitted = true;
  assert.equal((await core.routeRequest(request)).status, 'ok');
  assert.equal((await core.routeRequest(request)).metadata?.rateLimited, true);
  const failed = await core.routeRequest({...request, userIdentity: {platformUserId: 'another-user'}});
  assert.equal(failed.status, 'error');
  assert.doesNotMatch(failed.responseText, /I received|deterministic/);
  assert.equal(core.getStatus().aiProvider.fallbackAvailable, false);
  core.close();
  const disabled = createAetherModelProvider('remote');
  await assert.rejects(disabled.generateResponse(request, context));
});

test('global rate limit and stale/foreign status fail closed without extra inference', async () => {
  let now = 1000;
  let statusModel = 'qwen3.5:4b';
  let calls = 0;
  const provider = new RemoteModelProvider({...loadAetherConfig(env).remote!, globalRequests: 1}, async url => {
    if (String(url).endsWith('/status')) return Response.json({schemaVersion: '1.0', serverId: 'official-server', model: statusModel, available: true});
    calls++; return Response.json(reply());
  }, () => now);
  await provider.refreshAvailability(); assert.equal(provider.isAvailable(), true);
  now += 30001; assert.equal(provider.isAvailable(), false);
  statusModel = 'other-model'; await provider.refreshAvailability(); assert.equal(provider.isAvailable(), false);
  await provider.generateResponse(request, context);
  await assert.rejects(provider.generateResponse({...request, guildOrServerId: 'other-guild'}, context), /busy/);
  assert.equal(calls, 1);
  provider.close();
});

test('upstream unavailable, timeout and overload have distinct safe messages', async () => {
  for (const [status, code, expected] of [
    [503, 'ACTIVATION_REQUIRED', /unavailable/], [503, 'MODEL_UNAVAILABLE', /unavailable/],
    [503, 'OVERLOADED', /busy/], [429, 'RATE_LIMITED', /busy/], [408, 'TIMEOUT', /timed out/],
  ] as const) {
    const provider = new RemoteModelProvider(loadAetherConfig(env).remote!, async () => Response.json({error: code}, {status}));
    await assert.rejects(provider.generateResponse(request, context), expected);
    provider.close();
  }
});

test('existing Minecraft bot bridge request IDs are correlated without fabricated player/world fields', async () => {
  const provider = new RemoteModelProvider(loadAetherConfig(env).remote!, async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.ok(chatRequestSchema.safeParse(body).success);
    assert.equal(body.surface, 'minecraft');
    assert.equal(body.world, undefined); assert.equal(body.playerId, undefined);
    return Response.json(reply(body.requestId));
  });
  assert.equal(await provider.generateResponse({...request, requestId: 'bridge-request-123', sourcePlatform: 'minecraft'}, context), 'Hello explorer.');
  provider.close();
});

test('concurrent status calls share one bounded probe and repeated checks use short cache', async () => {
  let calls = 0;
  const provider = new RemoteModelProvider(loadAetherConfig(env).remote!, async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 10));
    return Response.json({schemaVersion: '1.0', serverId: 'official-server', model: 'qwen3.5:4b', available: true});
  });
  await Promise.all(Array.from({length: 20}, () => provider.refreshAvailability()));
  await provider.refreshAvailability();
  assert.equal(calls, 1); provider.close();
});
