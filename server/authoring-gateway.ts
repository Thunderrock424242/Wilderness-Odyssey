import type { JWTVerifyGetKey } from 'jose';
import { roleCapabilities } from '../contracts/v1/admin';
import { authoringRoutes } from '../contracts/v1/authoring-routes';
import { mediaSchema } from '../contracts/v1/content';
import { verifyCsrf } from './csrf';
import type { GatewayEnv } from './env';
import { failure, GatewayError, httpsUrl, json, readJson } from './http';
import { staffSession } from './staff-session';
import { projectAuthoringResponse } from './authoring-projections';

export function isAuthoringPath(path: string) { return path === '/api/admin/v1/configuration' || path.startsWith('/api/admin/v1/configuration/') || path.startsWith('/api/admin/v1/content/'); }
export async function handleAuthoring(request: Request, env: GatewayEnv, dependencies: { fetch?: typeof fetch; jwks?: JWTVerifyGetKey } = {}) {
  const upstream = dependencies.fetch ?? fetch;
  try {
    const url = new URL(request.url);
    const path = url.pathname.slice('/api/admin/v1'.length);
    if ((request.method === 'POST' && path === '/content/media') || (request.method === 'GET' && /^\/content\/media\/[a-zA-Z0-9_-]{1,96}$/.test(path))) return await handleMedia(request, env, dependencies);
    const route = authoringRoutes.find(item => item.method === request.method && item.pattern.test(path));
    if (!route || url.search) throw new GatewayError(404, 'NOT_FOUND', 'This editing operation is not available.');
    const staff = await staffSession(request, env, upstream, dependencies.jwks);
    if (!roleCapabilities[staff.session.user.role].includes(route.capability) || !staff.session.capabilities.includes(route.capability)) throw new GatewayError(403, 'FORBIDDEN', 'Your account does not permit this editing action.');
    const headers = new Headers({ Accept: 'application/json', 'CF-Access-Client-Id': env.KINETIC_ACCESS_CLIENT_ID ?? '', 'CF-Access-Client-Secret': env.KINETIC_ACCESS_CLIENT_SECRET ?? '', 'X-WO-Environment': env.ENVIRONMENT ?? 'unconfigured', 'X-Request-Id': crypto.randomUUID() });
    headers.set(staff.credential.kind === 'discord' ? 'X-WO-Admin-Session' : 'X-WO-User-Assertion', staff.credential.kind === 'discord' ? staff.credential.token : staff.credential.assertion);
    let body: string | undefined;
    if (route.input) {
      if (request.headers.get('Origin') !== url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Submit changes from the signed-in dashboard.');
      await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', staff.csrfSubject, url.origin, env.CSRF_SECRET ?? '');
      const key = request.headers.get('Idempotency-Key') ?? '';
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new GatewayError(400, 'IDEMPOTENCY_REQUIRED', 'Refresh the form and submit the change again.');
      const parsed = route.input.safeParse(await readJson(request, route.bodyLimit));
      if (!parsed.success) throw new GatewayError(400, 'INVALID_INPUT', 'Check the required fields and refresh any changed record.');
      body = JSON.stringify(parsed.data); headers.set('Content-Type', 'application/json'); headers.set('Idempotency-Key', key);
    }
    const response = await upstream(new URL('/v1/admin' + path, httpsUrl(env.KINETIC_ADMIN_ORIGIN, true)), { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) {
      await response.body?.cancel();
      const status = [401, 403, 404, 409, 413, 422, 429, 503].includes(response.status) ? response.status : 502;
      const messages: Record<number, string> = { 401: 'Sign in again to continue.', 403: 'This action needs current administrator permission. Sign in again for credential replacement.', 404: 'This record or editing service is not available.', 409: 'This record changed. Refresh it before saving again.', 413: 'This upload or document is too large.', 422: 'The service could not accept these settings.', 429: 'Too many requests. Wait briefly before trying again.', 503: 'The editing service is temporarily unavailable.' };
      throw new GatewayError(status, 'AUTHORING_' + status, messages[status] ?? 'The editing service returned an unexpected response.');
    }
    const result = route.output.safeParse(await readJson(response, 2 * 1024 * 1024));
    if (!result.success) throw new GatewayError(502, 'INVALID_RESPONSE', 'The editing service returned an unsupported response.');
    return json(projectAuthoringResponse(path, result.data));
  } catch (error) { return failure(error); }
}

async function handleMedia(request: Request, env: GatewayEnv, dependencies: { fetch?: typeof fetch; jwks?: JWTVerifyGetKey }) {
  const fetcher = dependencies.fetch ?? fetch, url = new URL(request.url), path = url.pathname.slice('/api/admin/v1'.length);
  if (url.search) throw new GatewayError(404, 'NOT_FOUND', 'This image route is not available.');
  const staff = await staffSession(request, env, fetcher, dependencies.jwks), capability = request.method === 'POST' ? 'content:write' : 'content:read';
  if (!roleCapabilities[staff.session.user.role].includes(capability) || !staff.session.capabilities.includes(capability)) throw new GatewayError(403, 'FORBIDDEN', 'Administrator content permission is required.');
  const headers = new Headers({ 'CF-Access-Client-Id': env.KINETIC_ACCESS_CLIENT_ID ?? '', 'CF-Access-Client-Secret': env.KINETIC_ACCESS_CLIENT_SECRET ?? '', 'X-WO-Environment': env.ENVIRONMENT ?? '' });
  headers.set(staff.credential.kind === 'discord' ? 'X-WO-Admin-Session' : 'X-WO-User-Assertion', staff.credential.kind === 'discord' ? staff.credential.token : staff.credential.assertion);
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Upload from the dashboard.');
    await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', staff.csrfSubject, url.origin, env.CSRF_SECRET ?? '');
    const key = request.headers.get('Idempotency-Key') ?? ''; if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new GatewayError(400, 'IDEMPOTENCY_REQUIRED', 'Refresh and upload again.');
    const data = await boundedBytes(request, 13 * 1024 * 1024);
    const form = await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' }, body: data }).formData();
    if ([...form.keys()].length !== 3 || !['file', 'slug', 'purpose'].every(name => form.getAll(name).length === 1)) throw new GatewayError(400, 'INVALID_INPUT', 'Send one image, slug, and purpose.');
    const file = form.get('file'), slug = form.get('slug'), purpose = form.get('purpose');
    if (!(file instanceof File) || typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 96 || !['cover', 'body', 'gallery'].includes(String(purpose)) || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 12 * 1024 * 1024 || !file.size || file.name.length > 160) throw new GatewayError(400, 'INVALID_IMAGE', 'Use a PNG, JPEG, WebP, or GIF image up to 12 MiB.');
    body = new Uint8Array(await file.arrayBuffer()); headers.set('Content-Type', file.type); headers.set('Idempotency-Key', key);
    headers.set('X-WO-Media', JSON.stringify({ slug, purpose, fileName: file.name, mimeType: file.type }));
  }
  const response = await fetcher(new URL('/v1/admin' + path, httpsUrl(env.KINETIC_ADMIN_ORIGIN, true)), { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!response.ok) { await response.body?.cancel(); const status = [401, 403, 404, 409, 413, 422, 429, 503].includes(response.status) ? response.status : 502; throw new GatewayError(status, 'IMAGE_UNAVAILABLE', status === 401 ? 'Sign in again.' : 'This private image request could not be completed.'); }
  if (request.method === 'POST') { const result = mediaSchema.safeParse(await readJson(response, 16384)); if (!result.success) throw new GatewayError(502, 'INVALID_RESPONSE', 'Unsupported image response.'); return json(result.data); }
  const type = response.headers.get('Content-Type') ?? '';
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) { await response.body?.cancel(); throw new GatewayError(502, 'INVALID_IMAGE', 'Unsupported image response.'); }
  const bytes = await boundedBytes(response, 12 * 1024 * 1024);
  const current = await staffSession(request, env, fetcher, dependencies.jwks);
  if (!current.session.capabilities.includes('content:read') || current.session.user.role !== 'administrator') throw new GatewayError(403, 'FORBIDDEN', 'Content access was withdrawn.');
  return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline', 'Referrer-Policy': 'no-referrer' } });
}
async function boundedBytes(message: Request | Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(message.headers.get('Content-Length') ?? 0) > limit || !message.body) throw new GatewayError(413, 'TOO_LARGE', 'This image request is too large.');
  const reader = message.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) throw new GatewayError(413, 'TOO_LARGE', 'This image request is too large.'); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => undefined); }
  const output = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output;
}
