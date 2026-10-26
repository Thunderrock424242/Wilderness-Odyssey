import type { JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { roleCapabilities } from '../contracts/v1/admin';
import { playtestRoutes } from '../contracts/v1/playtest-routes';
import * as s from '../contracts/v1/playtests';
import { staffSession } from './staff-session';
import { verifyCsrf } from './csrf';
import { GatewayError, json, readJson } from './http';
import { kinetic } from './kinetic-client';
import type { GatewayEnv } from './env';

export function isPlaytestPath(path: string) { return path === '/api/admin/v1/playtests' || path.startsWith('/api/admin/v1/playtests/'); }
function invalidResponse(): never { throw new GatewayError(502, 'INVALID_PLAYTEST_RESPONSE', 'The playtest service returned an unsupported response.'); }

// The backend is authoritative. These additional checks fail closed on an accidentally
// mis-scoped projection before any private text or bytes reach the browser.
export function validatePlaytestScope(path: string, value: unknown) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 4 && parts[1] === 'testers' && parts[3] === 'history') {
    const data = s.testerHistorySchema.parse(value);
    if (data.testerId !== parts[2] || data.groups.some(group => group.tester.id !== parts[2] || group.sessions.some(session => session.testerId !== parts[2] || session.campaignId !== group.campaign.id))) invalidResponse();
    return;
  }
  if (parts.length === 1) return;
  const record = z.object({ campaign: s.campaignSchema.optional(), campaignId: z.string().optional(), tester: s.testerSchema.optional(), testerId: z.string().optional(), sessions: z.array(s.playtestSessionSchema).optional(), session: s.playtestSessionSchema.optional() }).parse(value);
  if ((record.campaign && record.campaign.id !== parts[1]) || (record.campaignId && record.campaignId !== parts[1])) invalidResponse();
  if (parts[2] !== 'testers') return;
  if ((record.tester && record.tester.id !== parts[3]) || (record.testerId && record.testerId !== parts[3])) invalidResponse();
  for (const session of [...record.sessions ?? [], ...record.session ? [record.session] : []]) {
    if (session.campaignId !== parts[1] || session.testerId !== parts[3] || (parts[4] === 'sessions' && session.id !== parts[5])) invalidResponse();
  }
  if (parts[6] === 'artifacts' || parts[6] === 'server-profiles') {
    const data = s.privateArtifactSchema.parse(value);
    if (data.campaignId !== parts[1] || data.testerId !== parts[3] || data.sessionId !== parts[5] || data.artifactId !== parts[7] || data.scope !== (parts[6] === 'artifacts' ? 'client' : 'server') || (data.scope === 'server' && data.kind !== 'spark')) invalidResponse();
  }
}
export async function handlePlaytests(request: Request, env: GatewayEnv, dependencies: { fetch?: typeof fetch; jwks?: JWTVerifyGetKey }) {
  const url = new URL(request.url), upstream = dependencies.fetch ?? fetch;
  const rawPath = url.pathname.slice('/api/admin/v1'.length);
  const download = rawPath.endsWith('/download');
  const path = download ? rawPath.slice(0, -'/download'.length) : rawPath;
  const route = playtestRoutes.find(item => item.method === request.method && item.pattern.test(path));
  if (!route || (download && !/\/(artifacts|server-profiles)\/[A-Za-z0-9_-]+$/.test(path))) throw new GatewayError(404, 'NOT_FOUND', 'This playtest operation is not available.');
  const staff = await staffSession(request, env, upstream, dependencies.jwks);
  const capability = route.capability!;
  if (staff.session.user.role !== 'administrator' || !roleCapabilities[staff.session.user.role].includes(capability) || !staff.session.capabilities.includes(capability)) throw new GatewayError(403, 'FORBIDDEN', 'Current playtest administrator permission is required.');
  const entries = [...url.searchParams];
  if (new Set(entries.map(([name]) => name)).size !== entries.length || !(route.query ?? z.object({}).strict()).safeParse(Object.fromEntries(entries)).success || (download && url.search)) throw new GatewayError(400, 'INVALID_QUERY', 'This playtest page request is invalid.');
  let body: string | undefined;
  const headers = new Headers();
  if (route.input) {
    if (request.headers.get('Origin') !== url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Submit changes from the signed-in dashboard.');
    await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', staff.csrfSubject, url.origin, env.CSRF_SECRET ?? '');
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new GatewayError(400, 'IDEMPOTENCY_REQUIRED', 'Refresh the form before submitting again.');
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new GatewayError(415, 'JSON_REQUIRED', 'Use a JSON request.');
    const input = route.input.safeParse(await readJson(request, 16384));
    if (!input.success) throw new GatewayError(400, 'INVALID_INPUT', 'Check the fields and refresh any changed record.');
    body = JSON.stringify(input.data); headers.set('Idempotency-Key', key);
  }
  const value = await kinetic(path + url.search, route.output, staff.credential, env, upstream, { method: request.method, body, headers, responseLimit: 1536 * 1024 });
  validatePlaytestScope(path, value);
  // A slow private read must not survive permission withdrawal while it was in flight.
  const current = await staffSession(request, env, upstream, dependencies.jwks);
  if (current.session.user.id !== staff.session.user.id || current.session.user.role !== 'administrator' || !current.session.capabilities.includes(capability)) throw new GatewayError(403, 'FORBIDDEN', 'Playtest access was withdrawn.');
  if (!download) return json(value);
  const artifact = s.privateArtifactSchema.parse(value);
  const bytes = artifact.encoding === 'base64' ? Uint8Array.from(atob(artifact.content), char => char.charCodeAt(0)) : new TextEncoder().encode(artifact.content);
  return new Response(bytes, { headers: {
    'Content-Type': artifact.encoding === 'base64' ? 'application/x-spark-sampler' : 'text/plain; charset=utf-8',
    'Content-Disposition': 'attachment; filename="' + artifact.kind + '-' + artifact.artifactId + (artifact.kind === 'spark' ? '.sparkprofile' : '.txt') + '"',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
  } });
}
