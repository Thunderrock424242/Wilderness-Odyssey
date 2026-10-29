import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureCloudflaredBinary } from './cloudflaredBinary';

interface TunnelLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
}

export function startCloudflareTunnel(options: {
  root: string;
  env: NodeJS.ProcessEnv;
  logger: TunnelLogger;
  installBinary?: typeof ensureCloudflaredBinary;
  launch?: (binary: string, args: string[], options: SpawnOptions) => ChildProcess;
}): { stop(force?: boolean): void } {
  const controller = new AbortController();
  let child: ChildProcess | undefined;
  let stopped = false;
  let killTimer: NodeJS.Timeout | undefined;
  const stop = (force = false) => {
    const wasStopped = stopped;
    stopped = true;
    controller.abort();
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (force) {
      clearTimeout(killTimer);
      child.kill('SIGKILL');
    } else if (!wasStopped) {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => stop(true), 3000);
      killTimer.unref();
    }
  };
  if (options.env.CLOUDFLARED_ENABLED !== 'true') return { stop };
  const token = options.env.CLOUDFLARED_TUNNEL_TOKEN ?? '';
  const unavailable = (reason: string, fields: Record<string, unknown> = {}) => {
    if (!stopped) options.logger.warn({ service: 'cloudflare-tunnel', event: 'unavailable', reason, ...fields }, 'Cloudflare Tunnel is unavailable; the bot will continue running.');
  };
  if (!/^[A-Za-z0-9._~+/=-]{20,8192}$/.test(token)) {
    unavailable('configuration');
    return { stop };
  }

  void (async () => {
    let stage = 'installation';
    try {
      const binary = await (options.installBinary ?? ensureCloudflaredBinary)({
        root: options.root, platform: process.platform, arch: process.arch, signal: controller.signal,
      });
      if (stopped) return;
      const configDirectory = path.join(options.root, 'data', 'cloudflared');
      const configFile = path.join(configDirectory, 'connector.json');
      await mkdir(configDirectory, { recursive: true });
      await writeFile(configFile, '{}\n', { mode: 0o600 });
      if (stopped) return;
      stage = 'spawn';
      const env: NodeJS.ProcessEnv = { TUNNEL_TOKEN: token, HOME: options.root, NO_COLOR: 'true' };
      // Native connector does not need Discord, Access, backend or npm credentials.
      if (options.env.PATH) env.PATH = options.env.PATH;
      child = (options.launch ?? spawn)(binary, [
        'tunnel', '--config', configFile, '--no-autoupdate', '--protocol', 'quic',
        '--retries', '5', '--metrics', '127.0.0.1:0', '--loglevel', 'info', 'run',
      ], { cwd: options.root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false });

      for (const stream of [child.stdout, child.stderr]) {
        if (!stream) continue;
        stream.setEncoding('utf8');
        let pending = '';
        let discarded = false;
        const output = () => {
          if (!stopped && !discarded && pending.trim()) {
            options.logger.info({ service: 'cloudflare-tunnel', event: 'output', line: pending.replace(/\r$/, '').split(token).join('[redacted]') }, 'Cloudflare connector output.');
          }
          pending = '';
          discarded = false;
        };
        stream.on('data', (chunk: string) => {
          const parts = chunk.split('\n');
          for (let index = 0; index < parts.length; index++) {
            if (!discarded) {
              if (pending.length + parts[index].length > 16384) { pending = ''; discarded = true; }
              else pending += parts[index];
            }
            if (index < parts.length - 1) output();
          }
        });
        stream.once('end', output);
      }
      child.once('spawn', () => {
        if (!stopped) options.logger.info({ service: 'cloudflare-tunnel', event: 'started' }, 'Cloudflare connector process started; check tunnel health in Cloudflare.');
      });
      child.once('error', () => unavailable('spawn'));
      child.once('close', (exitCode, signal) => {
        clearTimeout(killTimer);
        unavailable('exit', { exitCode, signal });
      });
    } catch {
      // Do not log native error objects: they can include the child environment.
      unavailable(stage);
    }
  })();
  return { stop };
}
