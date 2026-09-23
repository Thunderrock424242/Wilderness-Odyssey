export class GatewayError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function json(value: unknown, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  } });
}
export function failure(error: unknown) {
  const known = error instanceof GatewayError;
  return json({ code: known ? error.code : 'GATEWAY_UNAVAILABLE', message: known ? error.message : 'This service is temporarily unavailable. Please try again.', requestId: crypto.randomUUID() }, known ? error.status : 503);
}
export async function readJson(message: Request | Response, limit = 1_048_576): Promise<unknown> {
  if (!message.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new GatewayError(502, 'INVALID_RESPONSE', 'The service returned an unexpected response.');
  const length = Number(message.headers.get('Content-Length'));
  if (length > limit) throw new GatewayError(413, 'TOO_LARGE', 'The request or response is too large.');
  if (!message.body) throw new GatewayError(400, 'EMPTY_BODY', 'A JSON body is required.');
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > limit) throw new GatewayError(413, 'TOO_LARGE', 'The request or response is too large.');
      chunks.push(result.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new GatewayError(400, 'INVALID_JSON', 'A valid JSON response or request is required.'); }
}
export function httpsUrl(raw: string | undefined, originOnly = false): URL {
  try {
    const url = new URL(raw || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (originOnly && (url.pathname !== '/' || url.search))) throw new Error();
    return url;
  } catch { throw new GatewayError(503, 'NOT_CONFIGURED', 'This service has not been connected yet.'); }
}