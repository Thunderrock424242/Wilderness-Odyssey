import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Use the simulator bundled with the lockfile's Wrangler, without installing or
// contacting a remote service. BOT_API is replaced by synthetic local responses.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const miniflareRequire = createRequire(wranglerRequire.resolve('miniflare'));
const { compatibilityDate: localRuntimeDate } = miniflareRequire('workerd');
const status = {
  schemaVersion: '1.0', observedAt: '2026-11-01T12:00:00Z', staleAfterSeconds: 120,
  minecraft: { state: 'unknown', players: null, tps: null, mspt: null, minecraftVersion: null, modpackVersion: null, loader: null },
  aether: { ollama: 'unknown', inference: 'unknown', requestsPaused: null, responseLatency: null },
  maintenance: { active: false, message: '', startsAt: null, endsAt: null, services: [] }, incidents: [],
};
const config = JSON.parse(await readFile(new URL('../workers/bot-gateway/wrangler.jsonc', import.meta.url), 'utf8').then(value => value.replace(/^\s*\/\/.*$/gm, '')));
const smokeDate = config.compatibility_date < localRuntimeDate ? config.compatibility_date : localRuntimeDate;
if (smokeDate !== config.compatibility_date) console.log(`Local runtime smoke test uses supported date ${smokeDate}; deployment configuration remains ${config.compatibility_date}. Live validation of the deployment date is still required.`);
let requests = 0;
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: fileURLToPath(new URL('../.wrangler/bot-gateway-build/index.js', import.meta.url)),
  compatibilityDate: smokeDate,
  host: '127.0.0.1', port: 0,
  bindings: config.vars,
  serviceBindings: {
    BOT_API: async request => {
      requests++;
      assert.equal(request.url, 'http://127.0.0.1:25599/v1/public/status');
      assert.equal(request.headers.has('Cookie'), false);
      return Response.json({ ...status, privateDetail: 'must be stripped' });
    },
  },
}));
try {
  const response = await runtime.dispatchFetch('https://gateway.example/v1/public/status', { headers: { Cookie: 'private' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), status);
  const denied = await runtime.dispatchFetch('https://gateway.example/v1/admin/session');
  assert.equal(denied.status, 503);
  assert.equal(denied.headers.get('Cache-Control'), 'no-store');
  const arbitrary = await runtime.dispatchFetch('https://gateway.example/v1/service/authenticate', { method: 'POST' });
  assert.equal(arbitrary.status, 404);
  assert.equal(requests, 1);
  console.log('Verified compiled gateway in workerd: projected status, fixed target, stripped cookies, unconfigured admin denial, and arbitrary-route denial. No live services contacted.');
} finally { await runtime.dispose(); }
