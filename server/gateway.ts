import type { JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { publicStatusSchema } from '../contracts/v1/status';
import { roleCapabilities, sessionSchema } from '../contracts/v1/admin';
import { adminRoutes } from '../contracts/v1/routes';
import { verifyAccess } from './access';
import { createCsrf, verifyCsrf } from './csrf';
import type { GatewayEnv } from './env';
import { failure, GatewayError, httpsUrl, json, readJson } from './http';
import { kinetic } from './kinetic-client';

type Dependencies = { fetch?: typeof fetch; jwks?: JWTVerifyGetKey };
export async function handleGateway(request: Request, env: GatewayEnv, dependencies: Dependencies = {}) {
  const upstream = dependencies.fetch ?? fetch;
  try {
    const url = new URL(request.url);
    if (url.pathname === '/api/public/v1/status') {
      if (request.method !== 'GET' || url.search) throw new GatewayError(405, 'METHOD_DENIED', 'Only status reads are supported.');
      const response = await upstream(httpsUrl(env.PUBLIC_STATUS_URL), { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!response.ok) { await response.body?.cancel(); throw new GatewayError(503, 'STATUS_UNAVAILABLE', 'Live status is temporarily unavailable.'); }
      const parsed = publicStatusSchema.safeParse(await readJson(response, 65536));
      if (!parsed.success) throw new GatewayError(502, 'INVALID_STATUS', 'Live status could not be verified.');
      return json(parsed.data, 200, 'public, max-age=15, must-revalidate');
    }
    const path = url.pathname.slice('/api/admin/v1'.length).replace(/\/$/, '') || '/';
    const route = url.pathname.startsWith('/api/admin/v1/') && adminRoutes.find(item => item.method === request.method && item.pattern.test(path));
    if (!route) throw new GatewayError(404, 'NOT_FOUND', 'This administration operation is not available.');
    const identity = await verifyAccess(request, env, dependencies.jwks);
    const session = await kinetic('/session', sessionSchema, identity.assertion, env, upstream);
    if (session.user.id !== identity.sub) throw new GatewayError(403, 'IDENTITY_MISMATCH', 'Your backend identity could not be verified.');
    const capabilities = session.capabilities.filter(value => roleCapabilities[session.user.role].includes(value));
    if (route.capability && !capabilities.includes(route.capability)) throw new GatewayError(403, 'FORBIDDEN', 'Your role does not permit this action.');
    if (path === '/session') return json({ ...session, capabilities, csrfToken: await createCsrf(identity.sub, url.origin, env.CSRF_SECRET ?? '') });
    const entries = [...url.searchParams];
    if (new Set(entries.map(([name]) => name)).size !== entries.length) throw new GatewayError(400, 'INVALID_QUERY', 'Duplicate query fields are not supported.');
    const query = (route.query ?? z.object({}).strict()).safeParse(Object.fromEntries(entries));
    if (!query.success) throw new GatewayError(400, 'INVALID_QUERY', 'The search or page request is invalid.');
    let body: string | undefined;
    const headers = new Headers();
    if (route.input) {
      if (request.headers.get('Origin') !== url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Submit this action from the staff dashboard.');
      await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', identity.sub, url.origin, env.CSRF_SECRET ?? '');
      const idempotency = request.headers.get('Idempotency-Key') ?? '';
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotency)) throw new GatewayError(400, 'IDEMPOTENCY_REQUIRED', 'A valid request identifier is required.');
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new GatewayError(415, 'JSON_REQUIRED', 'Use a JSON request.');
      const parsed = route.input.safeParse(await readJson(request, 16384));
      if (!parsed.success) throw new GatewayError(400, 'INVALID_INPUT', 'Check the required fields, reason, and permitted values.');
      body = JSON.stringify(parsed.data);
      headers.set('Idempotency-Key', idempotency);
    }
    return json(await kinetic(path + url.search, route.output, identity.assertion, env, upstream, { method: request.method, body, headers }));
  } catch (error) { return failure(error); }
}