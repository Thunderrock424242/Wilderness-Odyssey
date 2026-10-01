import http, { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { config } from '../config';
import { metricsEnabled, metricsRegistry } from './metricsService';
import { completeMinecraftLink } from './minecraftVerificationService';
import { logger } from '../utils/logger';
import { handleAetherBridgeHttpRequest } from '../aether/bridge/httpBridge';
import { isAetherBridgeAvailable } from '../aether';
import { getConnected } from '../connected/runtime';
import { bearer, secretMatches } from '../connected/auth';
import { json, readJson } from '../connected/http';
const verifySchema = z.object({ code: z.string().trim().min(6).max(32), minecraftUuid: z.uuid(), minecraftName: z.string().regex(/^[a-zA-Z0-9_]{1,16}$/) }).strict();
export function startMinecraftVerificationApi(): http.Server | null {
  if (!config.minecraftVerification.apiEnabled && !metricsEnabled() && !isAetherBridgeAvailable() && !getConnected()?.config.enabled) return null;
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 32768, requestTimeout: 15000, headersTimeout: 10000, keepAliveTimeout: 5000 }, (request, response) => {
    if (active >= 100) { json(response, 503, { ok: false, error: 'busy' }); return; }
    active++;
    void handleRequest(request, response).catch(() => json(response, 503, { ok: false, error: 'unavailable' })).finally(() => { active--; });
  });
  server.listen(config.minecraftVerification.apiPort, config.minecraftVerification.apiHost, () => logger.info({ port: config.minecraftVerification.apiPort }, 'Support HTTP API listening.'));
  server.on('error', () => logger.error('Support HTTP API could not start or continue listening.'));
  return server;
}
export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') { json(response, 200, { ok: true }); return; }
  if (await getConnected()?.http.handle(request, response)) return;
  if (request.method === 'GET' && request.url === config.metrics.path) {
    if (!metricsEnabled()) { json(response, 404, { ok: false, error: 'not_found' }); return; }
    if (!secretMatches(bearer(request.headers), process.env.METRICS_TOKEN)) { json(response, 401, { ok: false, error: 'unauthorized' }); return; }
    response.writeHead(200, { 'Content-Type': metricsRegistry.contentType, 'Cache-Control': 'no-store' });
    response.end(await metricsRegistry.metrics());
    return;
  }
  if (await handleAetherBridgeHttpRequest(request, response)) return;
  if (!config.minecraftVerification.apiEnabled || request.method !== 'POST' || request.url !== '/api/minecraft/verify') { json(response, 404, { ok: false, error: 'not_found' }); return; }
  if (!secretMatches(bearer(request.headers), getConnected()?.config.ingestToken)) { json(response, 401, { ok: false, error: 'unauthorized' }); return; }
  try {
    const data = verifySchema.parse(await readJson(request));
    const result = completeMinecraftLink(data);
    if (!result.ok) { json(response, 409, { ok: false, error: 'invalid_or_expired_code' }); return; }
    json(response, 200, { ok: true, discordUserId: result.link.userId, minecraftUuid: result.link.minecraftUuid, minecraftName: result.link.minecraftName });
  } catch { json(response, 400, { ok: false, error: 'invalid_request' }); }
}
