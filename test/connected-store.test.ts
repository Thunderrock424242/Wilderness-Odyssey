import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConnectedStore } from '../src/connected/store';

test('operations survive a store restart and duplicate requests cannot apply twice', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const actor = { id: 'staff', role: 'administrator' as const };
  let writes = 0;
  const first = store.mutate(actor, 'maintenance', 'key-1234567890123456', { active: true }, 'server:write', () => {
    writes++;
    store.set('maintenance', { active: true });
  });
  const again = new ConnectedStore(db).mutate(actor, 'maintenance', 'key-1234567890123456', { active: true }, 'server:write', () => { writes++; });
  assert.equal(again.id, first.id);
  assert.equal(writes, 1);
  assert.equal(again.state, 'succeeded');
  assert.throws(() => store.mutate(actor, 'maintenance', 'key-1234567890123456', { active: false }, 'server:write', () => {}), /conflict/i);
  db.close();
});

test('a failed mutation rolls back operation, data and idempotency reservation', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  assert.throws(() => store.mutate({ id: 'a', role: 'administrator' }, 'test', 'key-1234567890123456', {}, 'server:write', () => {
    store.set('marker', true);
    throw new Error('abort');
  }));
  assert.equal(store.get('marker'), null);
  assert.equal(store.operations({ id: 'a', role: 'administrator' }).length, 0);
  db.close();
});

test('viewers cannot inspect moderation operations or inherit Discord staff permissions', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  const op = store.mutate({ id: 'mod', role: 'moderator' }, 'warning', 'key-1234567890123456', {}, 'players:write', () => {});
  assert.deepEqual(store.operations({ id: 'viewer', role: 'viewer' }), []);
  assert.throws(() => store.operation(op.id, { id: 'viewer', role: 'viewer' }), /not found/i);
  assert.equal(store.staff('discord', 'guild:user'), null);
  db.close();
});
