import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { MainServerClient } from '../src/connected/mainClient';
import { ConnectedStore } from '../src/connected/store';
import { loadConnectedConfig } from '../src/connected/config';
const configuration = loadConnectedConfig({ CONNECTED_SERVICES_ENABLED: 'true', MAIN_SERVER_ORIGIN: 'https://main.example', MAIN_SERVER_READ_TOKEN: 'r'.repeat(40), MAIN_SERVER_WRITE_TOKEN: 'w'.repeat(40) });
test('main-server transport uses fixed HTTPS origin and refuses redirects and oversized responses', async () => {
  const client = new MainServerClient(configuration, async (url, init) => {
    assert.equal(String(url), 'https://main.example/v1/service/health');
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer ' + 'r'.repeat(40));
    return new Response('a'.repeat(262145));
  });
  await assert.rejects(client.health(), /large/i);
  assert.throws(() => loadConnectedConfig({ MAIN_SERVER_ORIGIN: 'http://local.invalid' }));
});
test('queued operations recheck staff role, and reconcile an ambiguous response with the original ID', async () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  store.assign('discord', '1', 'administrator', 'Admin', 'test');
  const actor = store.staff('discord', '1')!;
  const op = store.mutate(actor, 'pause', 'pause-key-123456789', {}, 'server:write', () => {}, { action: 'ai.pause', parameters: { paused: true, reason: 'Planned service work', revision: 'one' } });
  let posts = 0;
  let accepted = false;
  const client = new MainServerClient(configuration, async (_url, init) => {
    if (init?.method === 'POST') { posts++; accepted = true; throw new Error('Response lost'); }
    return accepted ? Response.json({ ...op, kind: 'ai.pause', state: 'succeeded', summary: 'Pause applied.' }) : new Response('', { status: 404 });
  });
  await client.process(store);
  assert.equal(posts, 1);
  assert.equal(store.operation(op.id, actor).state, 'running');
  const pending = store.storedOperation(op.id)!;
  pending.nextAt = 0; store.saveOperation(pending);
  await client.process(store);
  assert.equal(posts, 1);
  assert.equal(store.operation(op.id, actor).state, 'succeeded');
  const second = store.mutate(actor, 'pause', 'pause-key-123456780', {}, 'server:write', () => {}, { action: 'ai.pause', parameters: { paused: false } });
  store.assign('discord', '1', 'viewer', 'Viewer', 'test');
  await client.process(store);
  assert.equal(store.storedOperation(second.id)!.operation.state, 'cancelled');
  assert.equal(posts, 1);
  db.close();
});

test('permission revoked during reconciliation prevents dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  store.assign('discord', '2', 'administrator', 'Admin', 'test');
  const actor = store.staff('discord', '2')!;
  const operation = store.mutate(actor, 'pause', 'permission-key-1234', {}, 'server:write', () => {}, { action: 'ai.pause', parameters: { paused: true } });
  let posts = 0;
  const client = new MainServerClient(configuration, async (_url, init) => {
    if (init?.method === 'POST') { posts++; return Response.json({ ...operation, kind: 'ai.pause', state: 'succeeded' }); }
    store.assign('discord', '2', 'viewer', 'Viewer', 'test');
    return new Response('', { status: 404 });
  });
  await client.process(store);
  assert.equal(posts, 0);
  assert.equal(store.storedOperation(operation.id)!.operation.state, 'cancelled');
  db.close();
});
