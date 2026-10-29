import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { startCloudflareTunnel } from '../src/services/cloudflareTunnel';

const token = 'this-is-a-synthetic-private-tunnel-token';
type Entry = { level: string; fields: Record<string, unknown>; message: string };

function logs() {
  const entries: Entry[] = [];
  const logger = {
    info: (fields: Record<string, unknown>, message: string) => { entries.push({ level: 'info', fields, message }); },
    warn: (fields: Record<string, unknown>, message: string) => { entries.push({ level: 'warn', fields, message }); },
  };
  return { entries, logger };
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'connector did not reach the expected state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function fixture(t: TestContext, content: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wo-tunnel-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'connector.cjs');
  await writeFile(script, content);
  return { root, script };
}

test('disabled connector does not install or launch anything', async () => {
  const { entries, logger } = logs();
  const tunnel = startCloudflareTunnel({ root: '.', env: { CLOUDFLARED_TUNNEL_TOKEN: token }, logger,
    installBinary: async () => { assert.fail('disabled connector installed a binary'); },
    launch: () => { assert.fail('disabled connector launched a child'); },
  });
  tunnel.stop();
  assert.deepEqual(entries, []);
});

test('enabled connector rejects missing or multiline credentials without logging their values', () => {
  for (const credential of ['', `${token}\nsecret`]) {
    const { entries, logger } = logs();
    startCloudflareTunnel({ root: '.', env: { CLOUDFLARED_ENABLED: 'true', CLOUDFLARED_TUNNEL_TOKEN: credential }, logger,
      installBinary: async () => { assert.fail('invalid configuration installed a binary'); },
    }).stop();
    assert.equal(entries[0]?.fields.reason, 'configuration');
    assert.ok(!JSON.stringify(entries).includes(token));
  }
});

test('connector receives its token only in its own environment and redacts split output', async (t) => {
  const { root, script } = await fixture(t, `
    console.log(JSON.stringify({ argv: process.argv.slice(2), discord: process.env.DISCORD_TOKEN, tunnel: !!process.env.TUNNEL_TOKEN }));
    const token = process.env.TUNNEL_TOKEN;
    process.stdout.write(token.slice(0, 15));
    setTimeout(() => { process.stdout.write(token.slice(15) + '\\n'); process.stderr.write(token + '\\n'); }, 20);
    setInterval(() => {}, 1000);
  `);
  const { entries, logger } = logs();
  let child: ChildProcess | undefined;
  const tunnel = startCloudflareTunnel({ root, logger,
    env: { CLOUDFLARED_ENABLED: 'true', CLOUDFLARED_TUNNEL_TOKEN: token, DISCORD_TOKEN: 'unrelated-bot-secret', PATH: process.env.PATH },
    installBinary: async () => process.execPath,
    launch: (binary, args, options) => { child = spawn(binary, [script, ...args], options); return child; },
  });
  t.after(() => tunnel.stop(true));
  await until(() => entries.filter((entry) => entry.fields.line === '[redacted]').length === 2);
  const output = entries.find((entry) => String(entry.fields.line).startsWith('{'));
  const observed = JSON.parse(String(output?.fields.line));
  assert.equal(observed.discord, undefined);
  assert.equal(observed.tunnel, true);
  assert.ok(observed.argv.includes('quic'));
  assert.ok(observed.argv.includes('--no-autoupdate'));
  assert.ok(observed.argv.includes('127.0.0.1:0'));
  assert.ok(!observed.argv.includes('--token'));
  // Use an explicit valid config, avoiding both implicit host config and empty-YAML errors.
  const configFile = observed.argv[observed.argv.indexOf('--config') + 1];
  assert.deepEqual(JSON.parse(await readFile(configFile, 'utf8')), {});
  assert.ok(!JSON.stringify(entries).includes(token));
  assert.ok(!JSON.stringify(entries).includes('unrelated-bot-secret'));
  tunnel.stop();
  await until(() => child?.exitCode !== null || child?.signalCode !== null);
  tunnel.stop(true);
});

test('installer failure reports unavailability without throwing from startup', async () => {
  const { entries, logger } = logs();
  const tunnel = startCloudflareTunnel({ root: '.', env: { CLOUDFLARED_ENABLED: 'true', CLOUDFLARED_TUNNEL_TOKEN: token }, logger,
    installBinary: async () => { throw new Error(token); },
  });
  await until(() => entries.some((entry) => entry.fields.reason === 'installation'));
  assert.ok(!JSON.stringify(entries).includes(token));
  tunnel.stop();
});

test('spawn failure reports a safe error and does not retry indefinitely', async () => {
  const { entries, logger } = logs();
  let launches = 0;
  const tunnel = startCloudflareTunnel({ root: '.', env: { CLOUDFLARED_ENABLED: 'true', CLOUDFLARED_TUNNEL_TOKEN: token }, logger,
    installBinary: async () => 'unused',
    launch: () => { launches++; throw new Error(token); },
  });
  await until(() => entries.some((entry) => entry.fields.reason === 'spawn'));
  assert.equal(launches, 1);
  assert.ok(!JSON.stringify(entries).includes(token));
  tunnel.stop();
});

test('connector process exit reports unavailability without restarting the bot or child', async (t) => {
  const { root, script } = await fixture(t, 'process.exit(7);');
  const { entries, logger } = logs();
  let launches = 0;
  const tunnel = startCloudflareTunnel({ root, env: { CLOUDFLARED_ENABLED: 'true', CLOUDFLARED_TUNNEL_TOKEN: token }, logger,
    installBinary: async () => process.execPath,
    launch: (binary, args, options) => { launches++; return spawn(binary, [script, ...args], options); },
  });
  await until(() => entries.some((entry) => entry.fields.reason === 'exit'));
  assert.equal(entries.find((entry) => entry.fields.reason === 'exit')?.fields.exitCode, 7);
  assert.equal(launches, 1);
  tunnel.stop();
});

test('shutdown during installation cancels the operation and prevents a late child', async () => {
  const { entries, logger } = logs();
  let finish: ((binary: string) => void) | undefined;
  let signal: AbortSignal | undefined;
  const tunnel = startCloudflareTunnel({ root: '.', env: { CLOUDFLARED_ENABLED: 'true', CLOUDFLARED_TUNNEL_TOKEN: token }, logger,
    installBinary: (options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
    launch: () => { assert.fail('shutdown launched a late connector'); },
  });
  tunnel.stop();
  assert.equal(signal?.aborted, true);
  finish?.('unused');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(entries, []);
});
