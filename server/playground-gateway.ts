import type { JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { roleCapabilities } from '../contracts/v1/admin';
import { playgroundRoutes } from '../contracts/v1/aether-playground';
import { staffSession } from './staff-session';
import { verifyCsrf } from './csrf';
import { kinetic } from './kinetic-client';
import { GatewayError, json, readJson } from './http';
import type { GatewayEnv } from './env';
export function isPlaygroundPath(path: string) { return path === '/api/admin/v1/aether-playground' || path.startsWith('/api/admin/v1/aether-playground/'); }
export function playgroundQuery(path: string, params: URLSearchParams) {
  const entries = [...params];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return { success: false };
  return (path === '/aether-playground/examples' ? z.object({ cursor: z.string().regex(/^(0|[1-9][0-9]{0,7})$/).refine(value => Number(value) <= 10000000).optional() }).strict() : z.object({}).strict()).safeParse(Object.fromEntries(entries));
}
export async function handlePlayground(request: Request, env: GatewayEnv, dependencies: { fetch?: typeof fetch; jwks?: JWTVerifyGetKey }) {
  const url = new URL(request.url), upstream = dependencies.fetch ?? fetch;
  const path = url.pathname.slice('/api/admin/v1'.length);
  const route = playgroundRoutes.find(item => item.method === request.method && item.pattern.test(path));
  if (!route) throw new GatewayError(404, 'NOT_FOUND', 'This playground operation is unavailable.');
  const staff = await staffSession(request, env, upstream, dependencies.jwks);
  const authorized = (session: typeof staff.session) => session.user.role === 'administrator' && roleCapabilities[session.user.role].includes(route.capability) && session.capabilities.includes(route.capability);
  if (!authorized(staff.session)) throw new GatewayError(403, 'FORBIDDEN', 'Current playground administrator permission is required.');
  if (!playgroundQuery(path, url.searchParams).success) throw new GatewayError(400, 'INVALID_QUERY', 'The example page request is invalid.');
  let body: string | undefined;
  const headers = new Headers();
  if (route.input) {
    if (request.headers.get('Origin') !== url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Submit changes from the signed-in dashboard.');
    await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', staff.csrfSubject, url.origin, env.CSRF_SECRET ?? '');
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new GatewayError(400, 'IDEMPOTENCY_REQUIRED', 'A valid request identifier is required.');
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('Content-Type') ?? '')) throw new GatewayError(415, 'JSON_REQUIRED', 'Use a JSON request.');
    const input = route.input.safeParse(await readJson(request, route.bodyLimit));
    if (!input.success) throw new GatewayError(400, 'INVALID_INPUT', 'Check the required fields, acknowledgement and revision.');
    body = JSON.stringify(input.data); headers.set('Idempotency-Key', key);
  } else if (request.body) throw new GatewayError(400, 'BODY_DENIED', 'This read does not accept a body.');
  const value = await kinetic(path + url.search, route.output, staff.credential, env, upstream, { method: request.method, body, headers, responseLimit: 2 * 1024 * 1024, signal: AbortSignal.timeout(route.timeoutMs) });
  const current = await staffSession(request, env, upstream, dependencies.jwks);
  if (current.session.user.id !== staff.session.user.id || !authorized(current.session)) throw new GatewayError(403, 'ACCESS_CHANGED', 'Playground access changed. Sign in again.');
  return json(value);
}
