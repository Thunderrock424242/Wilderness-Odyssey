import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConnectedStore } from '../src/connected/store';
import { ServiceMonitor } from '../src/connected/monitor';
import { publicStatusSchema } from '../src/contracts/v1/status';

function observation(time: number, sequence: number, status = 'online') {
  return {
    schema_version: '1.0', server_id: 'official', boot_id: 'boot', sequence, observed_at: new Date(time).toISOString(),
    minecraft: { status, checked_at: new Date(time).toISOString(), players_online: 2, players_max: 20, tps: 20, mspt: 25, minecraft_version: '1.21.1', modpack_version: 'test' },
    aether: { status: 'online', checked_at: new Date(time).toISOString(), ollama_reachable: true, inference_available: true, latency_ms: 500, requests_paused: false },
  };
}

test('confirmed incident and outbox are durable, single failures do not publish an outage', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  let now = Date.parse('2026-09-23T16:00:00Z');
  let monitor = new ServiceMonitor(store, 'official', () => now);
  monitor.accept(observation(now, 1));
  for (let seq = 2; seq <= 4; seq++) {
    now += 30_000;
    monitor.accept(observation(now, seq, 'offline'));
    if (seq < 4) assert.equal(monitor.publicStatus().incidents.length, 0);
  }
  assert.equal(monitor.publicStatus().incidents.length, 1);
  const firstId = monitor.publicStatus().incidents[0].id;
  monitor = new ServiceMonitor(new ConnectedStore(db), 'official', () => now);
  assert.equal(monitor.publicStatus().incidents[0].id, firstId);
  now += 30_000; monitor.accept(observation(now, 5));
  now += 30_000; monitor.accept(observation(now, 6));
  assert.equal(monitor.publicStatus().incidents[0].status, 'resolved');
  assert.equal(store.outbox().filter(item => item.audience === 'public').length, 2);
  db.close();
});

test('stale and rejected observations cannot become fresh or leak private fields', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  let now = Date.parse('2026-09-23T16:00:00Z');
  const monitor = new ServiceMonitor(store, 'official', () => now);
  monitor.accept({ ...observation(now, 1), secret: 'must-not-leak' });
  const generated = monitor.publicStatus().generated_at;
  assert.equal(JSON.stringify(monitor.publicStatus()).includes('must-not-leak'), false);
  assert.throws(() => monitor.accept(observation(now, 1)), /sequence/i);
  now += 121_000;
  const stale = monitor.publicStatus();
  assert.equal(stale.generated_at, generated);
  assert.equal(stale.minecraft.status, 'unknown');
  assert.equal(stale.minecraft.players_online, null);
  assert.equal(stale.aether.inference_available, null);
  assert.equal(publicStatusSchema.safeParse(monitor.legacyStatus()).success, true);
  db.close();
});

test('maintenance suppresses expected outage publication without inventing recovery', () => {
  const db = new DatabaseSync(':memory:');
  const store = new ConnectedStore(db);
  let now = Date.parse('2026-09-23T16:00:00Z');
  store.set('maintenance', { active: true, message: 'Upgrade', services: ['minecraft'], startsAt: new Date(now).toISOString(), endsAt: new Date(now + 600_000).toISOString(), revision: '1' });
  const monitor = new ServiceMonitor(store, 'official', () => now);
  for (let seq = 1; seq <= 4; seq++) { monitor.accept(observation(now, seq, 'offline')); now += 30_000; }
  assert.equal(monitor.publicStatus().minecraft.status, 'maintenance');
  assert.equal(store.outbox().length, 0);
  db.close();
});

test('unchanged component snapshots cannot confirm incidents and component freshness is independent', () => {
  const db = new DatabaseSync(':memory:');
  let now = Date.parse('2026-09-23T16:00:00Z');
  const monitor = new ServiceMonitor(new ConnectedStore(db), 'official', () => now);
  const old = observation(now, 1, 'offline');
  monitor.accept(old);
  for (let seq = 2; seq <= 4; seq++) {
    now += 30000;
    const next = observation(now, seq);
    next.minecraft = old.minecraft;
    monitor.accept(next);
  }
  assert.equal(monitor.publicStatus().incidents.filter(item => item.component === 'minecraft').length, 0);
  now += 31000;
  assert.equal(monitor.publicStatus().minecraft.status, 'unknown');
  assert.equal(monitor.publicStatus().aether.status, 'online');
  db.close();
});

test('performance incidents require three full telemetry windows', () => {
  const db = new DatabaseSync(':memory:');
  let now = Date.parse('2026-09-23T16:00:00Z');
  const store = new ConnectedStore(db);
  const monitor = new ServiceMonitor(store, 'official', () => now);
  for (let seq = 1; seq <= 7; seq++) {
    const sample = observation(now, seq);
    sample.minecraft.tps = 10; sample.minecraft.mspt = 90;
    monitor.accept(sample);
    if (seq < 7) assert.equal(monitor.publicStatus().incidents.length, 0);
    now += 30000;
  }
  assert.equal(monitor.publicStatus().minecraft.status, 'degraded');
  assert.equal(monitor.publicStatus().incidents.length, 1);
  db.close();
});
test('component timestamps cannot regress or change evidence at the same timestamp', () => {
  const db = new DatabaseSync(':memory:');
  let now = Date.parse('2026-09-23T16:00:00Z');
  const monitor = new ServiceMonitor(new ConnectedStore(db), 'official', () => now);
  const first = observation(now, 1);
  monitor.accept(first);
  now += 30000;
  const newer = observation(now, 2, 'offline');
  newer.minecraft.checked_at = new Date(now - 45000).toISOString();
  assert.throws(() => monitor.accept(newer), /component|regress/i);
  newer.minecraft.checked_at = first.minecraft.checked_at;
  assert.throws(() => monitor.accept(newer), /component|changed/i);
  assert.equal(monitor.publicStatus().minecraft.status, 'online');
  db.close();
});

test('unknown samples and restarts cannot erase component replay protection', () => {
  const db = new DatabaseSync(':memory:');
  let now = Date.parse('2026-09-23T16:00:00Z');
  const store = new ConnectedStore(db);
  let monitor = new ServiceMonitor(store, 'official', () => now);
  const first = observation(now, 1, 'offline');
  monitor.accept(first);
  now += 30000;
  monitor.accept({ ...observation(now, 2), minecraft: { ...first.minecraft, status: 'unknown', checked_at: null } });
  monitor = new ServiceMonitor(store, 'official', () => now);
  now += 30000;
  const replay = { ...observation(now, 3), minecraft: { ...first.minecraft } };
  replay.minecraft.checked_at = new Date(Date.parse(first.minecraft.checked_at) - 1000).toISOString();
  assert.throws(() => monitor.accept(replay), /regress/i);
  replay.minecraft = { ...first.minecraft, status: 'online' };
  assert.throws(() => monitor.accept(replay), /changed/i);
  replay.minecraft = first.minecraft;
  monitor.accept(replay);
  assert.equal(store.get<{ bad: number }>('counter:minecraft')!.bad, 0);
  db.close();
});

test('missing Minecraft measurements alert staff without announcing an unproven outage', () => {
  const db = new DatabaseSync(':memory:');
  let now = Date.parse('2026-09-23T16:00:00Z');
  const store = new ConnectedStore(db), monitor = new ServiceMonitor(store, 'official', () => now);
  for (let seq = 1; seq <= 3; seq++) {
    monitor.accept({ ...observation(now, seq), minecraft: { status: 'unknown', checked_at: null, players_online: null, players_max: null, tps: null, mspt: null, minecraft_version: null, modpack_version: null } });
    now += 30000;
  }
  assert.equal(monitor.publicStatus().minecraft.status, 'unknown');
  assert.equal(store.outbox().filter(item => item.audience === 'public').length, 0);
  assert.equal(store.outbox().filter(item => item.audience === 'staff').length, 1);
  assert.match(store.outbox()[0]!.message, /Minecraft.*measurements.*unknown/i);
  monitor.accept(observation(now, 4)); now += 30000; monitor.accept(observation(now, 5));
  assert.equal(store.outbox().filter(item => item.audience === 'staff').length, 2);
  assert.equal(monitor.publicStatus().incidents[0]!.status, 'resolved');
  db.close();
});
