import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export interface CloudflaredRelease {
  version: string;
  assets: Readonly<Record<string, { name: string; size: number; sha256: string }>>;
}

// Official release asset digests: https://api.github.com/repos/cloudflare/cloudflared/releases/tags/2026.10.6
const RELEASE: CloudflaredRelease = {
  version: '2026.10.6',
  assets: {
    x64: { name: 'cloudflared-linux-amd64', size: 40275096, sha256: '1d356dac769d0dbf62ebe588c4034824bbff98d5790c2f844cc99e0e2f57462d' },
    arm64: { name: 'cloudflared-linux-arm64', size: 37668520, sha256: '0ae0e179475b2c77651a718d2b376e0151f4fca5954702a84f02843a4d5fcac0' },
  },
};
const MAX_BYTES = 100 * 1024 * 1024;

async function reclaimAbandonedDownloads(directory: string, signal: AbortSignal): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    signal.throwIfAborted();
    const owner = /^cloudflared-linux-(?:amd64|arm64)\.(\d{1,10})\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.part$/.exec(entry.name);
    if (!entry.isFile() || !owner || Number(owner[1]) < 1) continue;
    const filename = path.join(directory, entry.name);
    try {
      const stat = await lstat(filename);
      if (!stat.isFile()) continue;
      // A valid download is bounded to 60 s. Age also handles OS PID reuse.
      let abandoned = Date.now() - stat.mtimeMs > 5 * 60 * 1000;
      if (!abandoned) {
        try { process.kill(Number(owner[1]), 0); }
        catch (error) {
          abandoned = error instanceof Error && 'code' in error && error.code === 'ESRCH';
        }
      }
      if (abandoned) await rm(filename, { force: true });
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
}

export async function ensureCloudflaredBinary(options: {
  root: string;
  platform: NodeJS.Platform;
  arch: string;
  signal: AbortSignal;
  fetcher?: typeof fetch;
  release?: CloudflaredRelease;
}): Promise<string> {
  const release = options.release ?? RELEASE;
  const asset = Object.hasOwn(release.assets, options.arch) ? release.assets[options.arch] : undefined;
  if (options.platform !== 'linux' || !asset) throw new Error('The connector supports Linux x64 and arm64 only.');
  if (!/^\d{4}\.\d{1,2}\.\d+$/.test(release.version) || !/^cloudflared-linux-(amd64|arm64)$/.test(asset.name) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_BYTES) {
    throw new Error('Invalid connector release manifest.');
  }
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(60000)]);
  signal.throwIfAborted();
  const directory = path.join(options.root, 'data', 'cloudflared', release.version);
  const binary = path.join(directory, asset.name);
  await mkdir(directory, { recursive: true });
  await reclaimAbandonedDownloads(directory, signal);
  try {
    const stat = await lstat(binary);
    if (stat.isFile() && stat.size === asset.size) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(binary, { signal })) hash.update(chunk);
      if (hash.digest('hex') === asset.sha256) {
        signal.throwIfAborted();
        await chmod(binary, 0o700);
        return binary;
      }
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  const temporary = path.join(directory, `${asset.name}.${process.pid}.${randomUUID()}.part`);
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    response = await (options.fetcher ?? fetch)(`https://github.com/cloudflare/cloudflared/releases/download/${release.version}/${asset.name}`, { signal });
    signal.throwIfAborted();
    if (!response.ok || !response.body) throw new Error('Connector download unavailable.');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) !== asset.size)) throw new Error('Unexpected connector download size.');
    reader = response.body.getReader();
    const file = await open(temporary, 'wx', 0o600);
    const hash = createHash('sha256');
    let received = 0;
    // Even a fetch implementation that stalls after returning headers is bounded.
    const abortReader = () => { void reader?.cancel().catch(() => {}); };
    signal.addEventListener('abort', abortReader, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        signal.throwIfAborted();
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > asset.size || received > MAX_BYTES) throw new Error('Connector download is too large.');
        hash.update(chunk.value);
        await file.writeFile(chunk.value);
      }
      if (received !== asset.size || hash.digest('hex') !== asset.sha256) throw new Error('Connector checksum verification failed.');
    } finally {
      signal.removeEventListener('abort', abortReader);
      await file.close();
    }
    signal.throwIfAborted();
    await chmod(temporary, 0o700);
    await rm(binary, { force: true });
    signal.throwIfAborted();
    await rename(temporary, binary);
    return binary;
  } finally {
    if (reader) await reader.cancel().catch(() => {});
    else await response?.body?.cancel().catch(() => {});
    await rm(temporary, { force: true });
  }
}
