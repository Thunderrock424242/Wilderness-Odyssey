import { z } from 'zod';
import * as s from '../contracts/v1/participants';
import { discordStartSchema, discordCallbackInput, discordCallbackSchema, logoutSchema } from '../contracts/v1/auth';
import type { GatewayEnv } from './env';
import { discordConfig } from './staff-host';
import { discordCsrfSubject, FLOW_COOKIE, lifetime, setStaffCookie, staffCookie } from './staff-cookies';
import { createCsrf, verifyCsrf } from './csrf';
import { kinetic } from './kinetic-client';
import { GatewayError, json, readJson } from './http';
import { authorizationUrl } from './discord-auth';

export const PARTICIPANT_COOKIE = '__Host-wo-participant-session';
export const PARTICIPANT_FLOW = '__Host-wo-participant-flow';
function redirect(path: string, status = 303) { return new Response(null, { status, headers: { Location: path, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
export async function participantSession(request: Request, env: GatewayEnv, upstream: typeof fetch) {
  const config = discordConfig(request, env), token = staffCookie(request, PARTICIPANT_COOKIE);
  if (!token) throw new GatewayError(401, 'AUTH_REQUIRED', 'Sign in with Discord to view your playtester home.');
  const credential = { kind: 'participant' as const, token };
  const session = await kinetic('/participant/session', s.participantSessionSchema, credential, env, upstream);
  lifetime(session.expiresAt, 900);
  if (session.guildId !== config.guildId) throw new GatewayError(502, 'INVALID_SESSION', 'Your sign-in could not be verified.');
  return { session, credential, csrfSubject: 'participant:' + await discordCsrfSubject(token) };
}
export async function participantCallback(request: Request, env: GatewayEnv, upstream: typeof fetch) {
  let response: Response;
  try {
    const config = discordConfig(request, env), fields = [...config.url.searchParams.keys()];
    if (new Set(fields).size !== fields.length || fields.some(key => !['code', 'state', 'iss', 'error', 'error_description'].includes(key)) ||
      (config.url.searchParams.has('iss') && config.url.searchParams.get('iss') !== 'https://discord.com')) throw new Error();
    if (config.url.searchParams.has('error')) throw new Error();
    const flowToken = staffCookie(request, PARTICIPANT_FLOW);
    const input = discordCallbackInput.parse({ code: config.url.searchParams.get('code'), state: config.url.searchParams.get('state'), flowToken, redirectUri: config.redirectUri });
    const result = await kinetic('/participant/callback', discordCallbackSchema, undefined, env, upstream, { method: 'POST', body: JSON.stringify(input) });
    if (result.guildId !== config.guildId) throw new Error();
    response = redirect('/playtester/');
    response.headers.append('Set-Cookie', setStaffCookie(PARTICIPANT_COOKIE, result.sessionToken, lifetime(result.expiresAt, 900)));
  } catch { response = redirect('/login/?error=tester_login_failed'); }
  response.headers.append('Set-Cookie', setStaffCookie(PARTICIPANT_FLOW, '', 0));
  return response;
}
export async function handleParticipant(request: Request, env: GatewayEnv, upstream: typeof fetch) {
  const config = discordConfig(request, env), action = config.url.pathname.slice('/api/participant/'.length);
  const allowed = ['start', 'session', 'home', 'history', 'claim', 'logout'];
  if (!allowed.includes(action) || !((['claim', 'logout'].includes(action) ? 'POST' : 'GET') === request.method)) throw new GatewayError(404, 'NOT_FOUND', 'This playtester operation is unavailable.');
  const fields = [...config.url.searchParams];
  const query = Object.fromEntries(fields);
  if (fields.length !== Object.keys(query).length || !(action === 'history' ? s.participantQuery : z.object({}).strict()).safeParse(query).success) throw new GatewayError(400, 'INVALID_QUERY', 'This page request is invalid.');
  if (action === 'start') {
    try {
      const result = await kinetic('/participant/start', discordStartSchema, undefined, env, upstream, { method: 'POST', body: JSON.stringify({ redirectUri: config.redirectUri }) });
      const response = redirect(authorizationUrl(result.authorizationUrl, config.redirectUri), 302);
      response.headers.append('Set-Cookie', setStaffCookie(PARTICIPANT_FLOW, result.flowToken, lifetime(result.expiresAt, 300)));
      response.headers.append('Set-Cookie', setStaffCookie(FLOW_COOKIE, '', 0));
      return response;
    } catch { return redirect('/login/?error=service_unavailable'); }
  }
  const staff = await participantSession(request, env, upstream);
  if (action === 'session') return json({ ...staff.session, csrfToken: await createCsrf(staff.csrfSubject, config.url.origin, env.CSRF_SECRET ?? '') });
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== config.url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Submit this action from your playtester home.');
    await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', staff.csrfSubject, config.url.origin, env.CSRF_SECRET ?? '');
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('Content-Type') ?? '')) throw new GatewayError(415, 'JSON_REQUIRED', 'Use a JSON request.');
    const input = (action === 'claim' ? s.participantClaimInput : z.object({}).strict()).safeParse(await readJson(request, 4096));
    if (!input.success) throw new GatewayError(400, 'INVALID_INPUT', 'This invitation could not be read.');
    const options = { method: 'POST', body: JSON.stringify(input.data) };
    const result = action === 'claim'
      ? await kinetic('/participant/claim', s.participantClaimSchema, staff.credential, env, upstream, options)
      : await kinetic('/participant/logout', logoutSchema, staff.credential, env, upstream, options);
    const response = json(result);
    if (action === 'logout') response.headers.append('Set-Cookie', setStaffCookie(PARTICIPANT_COOKIE, '', 0));
    return response;
  }
  const result = action === 'home'
    ? await kinetic('/participant/home', s.participantHomeSchema, staff.credential, env, upstream, { responseLimit: 8 * 1024 * 1024 })
    : await kinetic('/participant/history' + config.url.search, s.participantHistorySchema, staff.credential, env, upstream);
  const owner = 'user' in result ? result.user.id : result.userId;
  if (owner !== staff.session.user.id) throw new GatewayError(502, 'INVALID_SCOPE', 'Your playtest records could not be verified.');
  const current = await participantSession(request, env, upstream);
  if (current.session.user.id !== owner) throw new GatewayError(403, 'ACCESS_CHANGED', 'Your access changed. Sign in again.');
  const campaigns = 'campaigns' in result ? result.campaigns.map(item => item.id) : result.sessions.map(item => item.campaignId);
  if (campaigns.some(id => !current.session.campaignIds.includes(id))) throw new GatewayError(403, 'ACCESS_CHANGED', 'Your playtest access changed. Refresh your home.');
  return json(result);
}
