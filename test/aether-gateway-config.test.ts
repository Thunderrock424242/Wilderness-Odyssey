import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConnectedConfig } from '../src/connected/config';
import { MainServerClient } from '../src/connected/mainClient';

const env = { AETHER_GATEWAY_ORIGIN: 'https://aether.example', AETHER_GATEWAY_SERVER_ID: 'official', AETHER_GATEWAY_MONITORING_TOKEN: 'm'.repeat(32), AETHER_GATEWAY_ADMINISTRATION_TOKEN: 'a'.repeat(32) };
test('optional Aether configuration validates origins, completeness and credential scope separation', () => {
  assert.equal(loadConnectedConfig({}).aetherGateway, undefined);
  assert.equal(loadConnectedConfig(env).aetherGateway?.serverId, 'official');
  for (const change of [{ AETHER_GATEWAY_ORIGIN:'http://aether.example' }, { AETHER_GATEWAY_ORIGIN:'https://aether.example/path' }, { AETHER_GATEWAY_MONITORING_TOKEN:'' }, { AETHER_GATEWAY_SERVER_ID:'' }, { AETHER_GATEWAY_ACCESS_CLIENT_ID:'client' }, { AETHER_GATEWAY_ADMINISTRATION_TOKEN:'m'.repeat(32) }, { MAIN_SERVER_READ_TOKEN:'m'.repeat(32) }]) {
    assert.throws(() => loadConnectedConfig({ ...env, ...change }));
  }
  assert.throws(() => loadConnectedConfig({MAIN_SERVER_ACCESS_CLIENT_SECRET:'secret'}));
});
test('main-server requests include optional paired Cloudflare service credentials', async () => {
  const config = loadConnectedConfig({MAIN_SERVER_ORIGIN:'https://main.example', MAIN_SERVER_READ_TOKEN:'r'.repeat(32), MAIN_SERVER_ACCESS_CLIENT_ID:'client', MAIN_SERVER_ACCESS_CLIENT_SECRET:'secret'});
  let received = new Headers();
  const client = new MainServerClient(config, async (_url, init) => {
    received = new Headers(init?.headers);


    return Response.json({ schema_version:'1.0',server_id:'official',actions:[],models:{},ai_requests_revision:'1' });
  });
  await assert.rejects(client.capabilities()); // Invalid response still allows observing the actual request boundary.
  assert.equal(received.get('cf-access-client-id'),'client');
  assert.equal(received.get('cf-access-client-secret'),'secret');
});
