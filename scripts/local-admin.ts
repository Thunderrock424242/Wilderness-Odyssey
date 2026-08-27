import { execFile, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { startLocalAdminServer } from './local-admin-server';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const astroEntry = resolve(root, 'node_modules', 'astro', 'bin', 'astro.mjs');
const adminUrl = 'http://127.0.0.1:4321/Wilderness-Odyssey/admin/';

const branch = (await execFileAsync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' })).stdout.trim();
if (branch !== 'website') {
  console.error(`Local admin requires the website branch. Current branch: ${branch || '(detached)'}`);
  process.exit(1);
}

const localApi = await startLocalAdminServer({ root });
const astroProcess = spawn(process.execPath, [astroEntry, 'dev', '--host', '127.0.0.1', '--port', '4321'], {
  cwd: root,
  env: {
    ...process.env,
    ASTRO_DEV_BACKGROUND: '0',
    ASTRO_TELEMETRY_DISABLED: '1',
    PUBLIC_ADMIN_API_BASE: localApi.apiBase,
    PUBLIC_ADMIN_LOCAL: 'true',
    PUBLIC_ADMIN_MOCK: 'false',
  },
  stdio: 'inherit',
});

let stopping = false;

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (astroProcess.exitCode === null) astroProcess.kill('SIGKILL');
  await localApi.close().catch(() => undefined);
  process.exit(exitCode);
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));
astroProcess.once('exit', (code) => void shutdown(code ?? 0));

const ready = await waitForSite(adminUrl, 20_000);
if (!ready) {
  console.error('The Astro site did not become ready. Review the error above.');
  await shutdown(1);
} else {
  console.log('\nBUNKER_OS LOCAL REPOSITORY EDITOR READY');
  console.log(`Open: ${adminUrl}`);
  console.log('Draft saves write local Markdown and images. Publish pushes only the transmission files to the website branch.');
  console.log('Press Ctrl+C when finished.\n');
}

async function waitForSite(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return false;
}
