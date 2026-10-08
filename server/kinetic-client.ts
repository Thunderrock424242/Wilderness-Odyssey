import type { ZodType } from 'zod';
import type { GatewayEnv } from './env';
import { GatewayError, httpsUrl, readJson } from './http';
import type { StaffCredential } from '../contracts/v1/auth';

export async function kinetic<T>(path: string, schema: ZodType<T>, credential: StaffCredential | undefined, env: GatewayEnv, upstream: typeof fetch, init: RequestInit = {}) {
  const base = httpsUrl(env.KINETIC_ADMIN_ORIGIN, true);
  if (!env.KINETIC_ACCESS_CLIENT_ID || !env.KINETIC_ACCESS_CLIENT_SECRET) throw new GatewayError(503, 'NOT_CONFIGURED', 'The administration service has not been connected yet.');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('CF-Access-Client-Id', env.KINETIC_ACCESS_CLIENT_ID);
  headers.set('CF-Access-Client-Secret', env.KINETIC_ACCESS_CLIENT_SECRET);
  headers.delete('X-WO-User-Assertion');
  headers.delete('X-WO-Admin-Session');
  if (credential?.kind === 'access') headers.set('X-WO-User-Assertion', credential.assertion);
  if (credential?.kind === 'discord') headers.set('X-WO-Admin-Session', credential.token);
  headers.set('X-WO-Environment', env.ENVIRONMENT || 'unconfigured');
  headers.set('X-Request-Id', crypto.randomUUID());
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await upstream(new URL('/v1/admin' + path, base), { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(8000), cache: 'no-store' });
  if (!response.ok) {
    const status = [401, 403, 404, 409, 422, 429, 503].includes(response.status) ||
      (env.STAFF_AUTH_MODE === 'discord' && path.startsWith('/auth/') && response.status === 400) ? response.status : 502;
    const messages: Record<number, string> = { 401: 'Your staff session could not be verified.', 403: 'You do not have permission for this action.', 404: 'The requested record was not found.', 409: 'This record changed. Refresh it before trying again.', 422: 'The backend rejected this request under its current policy.', 429: 'Too many requests. Please wait before trying again.', 503: 'The administration service is temporarily unavailable.' };
    if (env.STAFF_AUTH_MODE === 'discord' && [400, 401, 403].includes(response.status)) {
      const error = await readJson(response, 4096).catch(() => null);
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENROLLMENT_REQUIRED' && response.status === 403) {
        throw new GatewayError(403, 'ENROLLMENT_REQUIRED', 'Run /dashboard enable in the Discord server before signing in.');
      }
    } else await response.body?.cancel();
    throw new GatewayError(status, 'BACKEND_' + status, messages[status] ?? 'The administration service returned an unexpected response.');
  }
  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) throw new GatewayError(502, 'INVALID_RESPONSE', 'The administration service returned an unsupported response.');
  return parsed.data;
}
