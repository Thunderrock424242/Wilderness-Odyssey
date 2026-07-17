import http, { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { config } from '../config';
import { metricsEnabled, metricsRegistry } from './metricsService';
import { completeMinecraftLink } from './minecraftVerificationService';
import { logger } from '../utils/logger';
import { handleAetherBridgeHttpRequest } from '../aether/bridge/httpBridge';
import { isAetherBridgeAvailable } from '../aether';

const minecraftVerifyRequestSchema = z.object({
  code: z.string().trim().min(1),
  minecraftUuid: z.string().trim().min(1),
  minecraftName: z.string().trim().min(1)
});

export function startMinecraftVerificationApi(): http.Server | null {
  if (!config.minecraftVerification.apiEnabled && !metricsEnabled() && !isAetherBridgeAvailable()) {
    return null;
  }

  const server = http.createServer((request, response) => {
    void handleRequest(request, response);
  });

  server.listen(config.minecraftVerification.apiPort, config.minecraftVerification.apiHost, () => {
    logger.info({
      host: config.minecraftVerification.apiHost,
      port: config.minecraftVerification.apiPort,
      minecraftVerifyEnabled: config.minecraftVerification.apiEnabled,
      metricsEnabled: metricsEnabled(),
      aetherBridgeEnabled: isAetherBridgeAvailable()
    }, 'Support HTTP API listening.');
  });

  server.on('error', (error) => {
    logger.error({ error }, 'Support HTTP API error.');
  });

  return server;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && request.url === config.metrics.path) {
    if (!metricsEnabled()) {
      sendJson(response, 404, { ok: false, error: 'not_found' });
      return;
    }

    response.writeHead(200, {
      'Content-Type': metricsRegistry.contentType,
      'Cache-Control': 'no-store'
    });
    response.end(await metricsRegistry.metrics());
    return;
  }

  if (await handleAetherBridgeHttpRequest(request, response)) {
    return;
  }

  if (!config.minecraftVerification.apiEnabled) {
    sendJson(response, 404, { ok: false, error: 'not_found' });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/api/minecraft/verify') {
    sendJson(response, 404, { ok: false, error: 'not_found' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const parsed = minecraftVerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, { ok: false, error: 'invalid_request' });
      return;
    }

    const result = completeMinecraftLink({
      code: parsed.data.code,
      minecraftUuid: parsed.data.minecraftUuid,
      minecraftName: parsed.data.minecraftName
    });

    if (!result.ok) {
      sendJson(response, 400, { ok: false, error: result.reason });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      discordUserId: result.link.userId,
      minecraftUuid: result.link.minecraftUuid,
      minecraftName: result.link.minecraftName
    });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : 'invalid_request'
    });
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 16_384) {
      throw new Error('Request body is too large.');
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) {
    throw new Error('Request body is required.');
  }

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}
