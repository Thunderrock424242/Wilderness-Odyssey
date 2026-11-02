import { GatewayError } from '../../server/http';

export async function boundedBytes(message: Request | Response, limit: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const length = message.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new GatewayError(413, 'TOO_LARGE', 'The request or response is too large.');
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    signal.throwIfAborted();
    while (true) {
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new GatewayError(413, 'TOO_LARGE', 'The request or response is too large.');
      chunks.push(part.value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function parseJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new GatewayError(400, 'INVALID_JSON', 'A valid JSON body is required.'); }
}
