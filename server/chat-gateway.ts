import { z } from 'zod';
import type { JWTVerifyGetKey } from 'jose';
import { chatDeliverySchema, chatHomeSchema, chatReplySchema, chatRoutes, chatThreadSchema } from '../contracts/v1/playtester-chat';
import { staffSession } from './staff-session';
import { verifyCsrf } from './csrf';
import { GatewayError, json, readJson } from './http';
import { kinetic, kineticResponse } from './kinetic-client';
import type { GatewayEnv } from './env';
import { boundedBytes } from '../workers/bot-gateway/transport';

export const isChatPath = (path: string) => path === '/api/admin/v1/playtester-chat' || path.startsWith('/api/admin/v1/playtester-chat/');
function invalid(): never { throw new GatewayError(502, 'INVALID_CHAT_RESPONSE', 'The inbox response could not be verified.'); }
export function validateChatScope(path: string, value: unknown) {
  if (path === '/playtester-chat') {
    const home = chatHomeSchema.parse(value);
    if (!home.owner && home.admins.length) invalid();
  }
  const match = /^\/playtester-chat\/threads\/([A-Za-z0-9_-]+)\/(\d+)(\/reply)?$/.exec(path);
  if (match) {
    const messages = match[3] ? [chatReplySchema.parse(value).message] : chatThreadSchema.parse(value).messages;
    if (messages.some(message => message.campaignId !== match[1] || message.userId !== match[2])) invalid();
  }
  if (path.startsWith('/playtester-chat/broadcasts/') && chatDeliverySchema.parse(value).broadcastId !== path.split('/').at(-1)) invalid();
}

export async function handleChat(request: Request, env: GatewayEnv, dependencies: { fetch?: typeof fetch; jwks?: JWTVerifyGetKey }) {
  if (env.STAFF_AUTH_MODE !== 'discord') throw new GatewayError(403, 'DISCORD_REQUIRED', 'Sign in with Discord to use the private inbox.');
  const url = new URL(request.url), upstream = dependencies.fetch ?? fetch;
  const path = url.pathname.slice('/api/admin/v1'.length);
  const binary = request.method === 'GET' && /^\/playtester-chat\/attachments\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(path);
  const route = chatRoutes.find(item => item.method === request.method && item.pattern.test(path));
  if (!route && !binary) throw new GatewayError(404, 'NOT_FOUND', 'This inbox operation is not available.');
  const staff = await staffSession(request, env, upstream, dependencies.jwks);
  const authorized = (session: typeof staff.session) => session.user.role === 'administrator' && session.capabilities.includes('server:write');
  if (!authorized(staff.session)) throw new GatewayError(403, 'FORBIDDEN', 'Current administrator permission is required.');
  const entries = [...url.searchParams];
  if (new Set(entries.map(([name]) => name)).size !== entries.length || !(route?.query ?? z.object({}).strict()).safeParse(Object.fromEntries(entries)).success) throw new GatewayError(400, 'INVALID_QUERY', 'The inbox page request is invalid.');
  let body: string | undefined;
  const headers = new Headers();
  if (route?.input) {
    if (request.headers.get('Origin') !== url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Submit changes from the signed-in inbox.');
    await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', staff.csrfSubject, url.origin, env.CSRF_SECRET ?? '');
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new GatewayError(400, 'IDEMPOTENCY_REQUIRED', 'Refresh the form before submitting again.');
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new GatewayError(415, 'JSON_REQUIRED', 'Use a JSON request.');
    const input = route.input.safeParse(await readJson(request, route.bodyLimit));
    if (!input.success) throw new GatewayError(400, 'INVALID_INPUT', 'Check the inbox fields.');
    body = JSON.stringify(input.data); headers.set('Idempotency-Key', key);
  }
  const recheck = async () => {
    const current = await staffSession(request, env, upstream, dependencies.jwks);
    if (current.session.user.id !== staff.session.user.id || !authorized(current.session)) throw new GatewayError(403, 'FORBIDDEN', 'Inbox access was withdrawn.');
  };
  if (!binary) {
    const value = await kinetic(path + url.search, route!.output, staff.credential, env, upstream, { method: request.method, body, headers, responseLimit: 1024 * 1024 });
    validateChatScope(path, value); await recheck();
    return json(value);
  }
  const response = await kineticResponse(path, staff.credential, env, upstream);
  const type = response.headers.get('Content-Type') ?? '';
  if (!['application/x-spark-sampler', 'text/plain; charset=utf-8', 'text/plain'].includes(type)) { await response.body?.cancel(); invalid(); }
  const bytes = await boundedBytes(response, 5 * 1024 * 1024, AbortSignal.timeout(10000));
  await recheck();
  // A Discord administrator can lose inbox approval while a private body streams.
  // The backend remains authoritative for that separate owner-selected access.
  await kinetic('/playtester-chat',chatHomeSchema,staff.credential,env,upstream);
  return new Response(bytes, { headers: {
    'Content-Type': type, 'Content-Disposition': 'attachment; filename="chat-' + path.split('/').at(-1) + (type === 'application/x-spark-sampler' ? '.sparkprofile' : '.txt') + '"',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
  } });
}
