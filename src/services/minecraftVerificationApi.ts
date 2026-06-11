import http, { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config';
import { completeMinecraftLink } from './minecraftVerificationService';

export function startMinecraftVerificationApi(): http.Server | null {
  if (!config.minecraftVerification.apiEnabled) {
    return null;
  }

  const server = http.createServer((request, response) => {
    void handleRequest(request, response);
  });

  server.listen(config.minecraftVerification.apiPort, config.minecraftVerification.apiHost, () => {
    console.log(
      `Minecraft verification API listening on ${config.minecraftVerification.apiHost}:${config.minecraftVerification.apiPort}.`
    );
  });

  server.on('error', (error) => {
    console.error('Minecraft verification API error:', error);
  });

  return server;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/api/minecraft/verify') {
    sendJson(response, 404, { ok: false, error: 'not_found' });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const result = completeMinecraftLink({
      code: stringFromBody(body.code),
      minecraftUuid: stringFromBody(body.minecraftUuid),
      minecraftName: stringFromBody(body.minecraftName)
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

function stringFromBody(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}
