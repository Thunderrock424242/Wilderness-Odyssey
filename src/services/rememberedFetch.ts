import { z } from 'zod';

const csrfSchema = z.object({ csrfToken: z.string().min(1).max(2048) });
const pending = new Map<string, Promise<number>>();
const identities = new WeakMap<typeof fetch, Map<boolean, string>>();
async function pinSession(response: Response, fetcher: typeof fetch, participant: boolean): Promise<Response> {
  if (!response.ok) return response;
  const value: unknown = await response.json();
  const parsed = z.object({ user: z.object({ id: z.string(), role: z.string().optional() }) }).safeParse(value);
  if (parsed.success) {
    const identity = parsed.data.user.id + ':' + (parsed.data.user.role ?? 'participant');
    const known = identities.get(fetcher) ?? new Map<boolean, string>();
    const previous = known.get(participant);
    if (previous && previous !== identity) return new Response(null, { status: 409 });
    known.set(participant, identity); identities.set(fetcher, known);
  }
  return Response.json(value, { status: response.status, headers: response.headers });
}
async function renew(participant: boolean, fetcher: typeof fetch): Promise<number> {
  const endpoint = participant ? '/api/participant/refresh' : '/api/auth/discord/refresh';
  const running = pending.get(endpoint);
  if (running) return running;
  const operation = async () => {
    const probe = await fetcher(participant ? '/api/participant/session' : '/api/admin/v1/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const probeStatus = probe.status;
    await probe.body?.cancel();
    if (probeStatus !== 401) return probeStatus;
    const response = await fetcher(endpoint, { method: 'POST', headers: { 'X-WO-Auth-Intent': 'renew' }, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    await response.body?.cancel();
    return response.status;
  };
  const promise = typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('wo-session-renewal', operation) : operation();
  pending.set(endpoint, promise);
  try { return await promise; } finally { pending.delete(endpoint); }
}
/** Renew reads once; check authorization before writes, and never automatically replay a write. */
export async function rememberedFetch(path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const participant = path.startsWith('/api/participant/');
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  const logout = path.endsWith('/logout');
  if (logout) {
    headers.set('X-WO-Auth-Intent', 'renew');
    return fetcher(path, { ...init, headers });
  }
  const sessionPath = participant ? '/api/participant/session' : '/api/admin/v1/session';
  if (method !== 'GET' && method !== 'HEAD') {
    const probe = await rememberedFetch(sessionPath, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) }, fetcher);
    if (!probe.ok) return probe;
    const csrf = csrfSchema.safeParse(await probe.json());
    if (!csrf.success) return new Response(null, { status: 502 });
    headers.set('X-CSRF-Token', csrf.data.csrfToken);
    return fetcher(path, { ...init, headers });
  }
  const response = await fetcher(path, { ...init, headers });
  if (response.status !== 401) return path === sessionPath ? pinSession(response, fetcher, participant) : response;
  const refreshed = await renew(participant, fetcher);
  const retry = (refreshed >= 200 && refreshed < 300) || refreshed === 409;
  if (!retry) {
    await response.body?.cancel();
    return new Response(null, { status: refreshed });
  }
  await response.body?.cancel();
  const retried = await fetcher(path, { ...init, headers });
  return path === sessionPath ? pinSession(retried, fetcher, participant) : retried;
}
