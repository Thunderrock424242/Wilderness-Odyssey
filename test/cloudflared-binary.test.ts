import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { ensureCloudflaredBinary, type CloudflaredRelease } from '../src/services/cloudflaredBinary';

// SHA-256 of the hand-checked fixture "abc"; never execute this fixture.
const release: CloudflaredRelease = {
  version: '2026.10.6',
  assets: { x64: { name: 'cloudflared-linux-amd64', size: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' } },
};

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wo-cloudflared-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'data', 'cloudflared', '2026.10.6');
  const binary = path.join(directory, 'cloudflared-linux-amd64');
  return { root, directory, binary };
}

test('installer verifies a download before returning an executable and reuses a verified cache', async (t) => {
  const { root, binary } = await fixture(t);
  let downloads = 0;
  const fetcher: typeof fetch = async (url) => {
    assert.equal(String(url), 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.6/cloudflared-linux-amd64');
    downloads++;
    return new Response('abc');
  };
  const options = { root, platform: 'linux' as const, arch: 'x64', signal: new AbortController().signal, fetcher, release };
  assert.equal(await ensureCloudflaredBinary(options), binary);
  assert.equal(await readFile(binary, 'utf8'), 'abc');
  await ensureCloudflaredBinary(options);
  assert.equal(downloads, 1);
});

test('installer replaces a modified cache only with verified bytes', async (t) => {
  const { root, directory, binary } = await fixture(t);
  await mkdir(directory, { recursive: true });
  await writeFile(binary, 'bad');
  await ensureCloudflaredBinary({ root, platform: 'linux', arch: 'x64', signal: new AbortController().signal, release, fetcher: async () => new Response('abc') });
  assert.equal(await readFile(binary, 'utf8'), 'abc');
});

for (const [name, response] of [
  ['checksum mismatch', () => new Response('bad')],
  ['truncated download', () => new Response('ab')],
  ['oversized declared response', () => new Response('abc', { headers: { 'Content-Length': '104857601' } })],
  ['oversized streamed response', () => new Response('abcd')],
  ['upstream failure', () => new Response('unavailable', { status: 503 })],
] as const) {
  test(`installer never installs a ${name}`, async (t) => {
    const { root, directory } = await fixture(t);
    await assert.rejects(ensureCloudflaredBinary({ root, platform: 'linux', arch: 'x64', signal: new AbortController().signal, release, fetcher: async () => response() }));
    assert.deepEqual(await readdir(directory), []);
  });
}

test('installer cancels a stalled download and removes partial files', async (t) => {
  const { root, directory } = await fixture(t);
  const controller = new AbortController();
  const fetcher: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    controller.abort();
  });
  await assert.rejects(ensureCloudflaredBinary({ root, platform: 'linux', arch: 'x64', signal: controller.signal, release, fetcher }));
  assert.deepEqual(await readdir(directory), []);
});

test('installer obeys an external timeout while waiting for response bytes', async (t) => {
  const { root } = await fixture(t);
  const fetcher: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
  });
  const keepAlive = setTimeout(() => {}, 2000);
  try {
    await assert.rejects(ensureCloudflaredBinary({ root, platform: 'linux', arch: 'x64', signal: AbortSignal.timeout(20), release, fetcher }), /timeout/i);
  } finally { clearTimeout(keepAlive); }
});

test('installer rejects unsupported hosts without attempting a download', async (t) => {
  const { root } = await fixture(t);
  for (const [platform, arch] of [['win32', 'x64'], ['linux', 'ia32']] as const) {
    await assert.rejects(ensureCloudflaredBinary({ root, platform, arch, signal: new AbortController().signal, release, fetcher: async () => { assert.fail('unsupported host downloaded a binary'); } }), /support/i);
  }
});
