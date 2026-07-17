import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAetherCore, isAetherBridgeAvailable } from '../index';
import { parseAetherBridgeRequest } from './schema';

const AETHER_BRIDGE_PATH = '/api/aether/bridge';

export async function handleAetherBridgeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  if (request.url !== AETHER_BRIDGE_PATH) {
    return false;
  }

  const core = getAetherCore();
  if (!isAetherBridgeAvailable() || !core) {
    sendJson(response, 404, { ok: false, error: 'not_found' });
    return true;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  const token = bearerToken(request.headers.authorization);
  if (!core.minecraftBridge.authenticate(token)) {
    sendJson(response, 401, { ok: false, error: 'unauthorized' });
    return true;
  }

  try {
    const body = await readJsonBody(request);
    const parsed = parseAetherBridgeRequest(body);
    if (!parsed.ok) {
      sendJson(response, 400, { ok: false, error: 'invalid_request' });
      return true;
    }

    const result = await core.handleBridgeRequest(parsed.request);
    sendJson(response, result.ok === false ? 400 : 200, result);
  } catch {
    sendJson(response, 400, { ok: false, error: 'invalid_request' });
  }

  return true;
}

function bearerToken(value: string | undefined): string | undefined {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 64 * 1024) {
      throw new Error('Request body is too large.');
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) {
    throw new Error('Request body is required.');
  }
  return JSON.parse(text) as unknown;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}
