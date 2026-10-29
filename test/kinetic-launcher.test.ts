import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';

function runLauncher(buildStatus: number) {
  const events: string[] = [];
  const host = Object.assign(new EventEmitter(), { env: {}, platform: 'linux', exit: (code: number) => { events.push(`exit:${code}`); throw new Error('exited'); } });
  const requireFixture = (name: string) => {
    if (name === 'node:child_process') return { spawnSync: () => ({ status: buildStatus }) };
    if (name.includes('cloudflareTunnel')) return { startCloudflareTunnel: () => { events.push('connector'); return { stop: (force = false) => events.push(`stop:${force}`) }; } };
    if (name.includes('utils/logger')) return { logger: {} };
    if (name === './dist/index.js') { events.push('bot'); return {}; }
    throw new Error(`Unexpected launcher import ${name}`);
  };
  try {
    vm.runInNewContext(fs.readFileSync(path.resolve('index.js'), 'utf8'), { require: requireFixture, process: host, __dirname: process.cwd(), console: { error: () => {} } });
  } catch (error) { if (!(error instanceof Error) || error.message !== 'exited') throw error; }
  return { events, host };
}

test('Kinetic launcher refuses to load stale code after a failed build', () => {
  assert.deepEqual(runLauncher(2).events, ['exit:2']);
});

test('Kinetic launcher starts the bot without awaiting connector installation and cleans up before exit', () => {
  const { events, host } = runLauncher(0);
  assert.deepEqual(events, ['connector', 'bot']);
  host.emit('SIGTERM');
  host.emit('exit');
  assert.deepEqual(events, ['connector', 'bot', 'stop:false', 'stop:true']);
});
