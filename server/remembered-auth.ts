import { rememberRefreshSchema, logoutSchema } from '../contracts/v1/auth';
import type { GatewayEnv } from './env';
import { discordConfig } from './staff-host';
import { failure, GatewayError, json } from './http';
import { kinetic } from './kinetic-client';
import { lifetime, SESSION_COOKIE, setStaffCookie, staffCookie } from './staff-cookies';

export const ADMIN_REMEMBER = '__Host-wo-admin-remember';
export const PARTICIPANT_REMEMBER = '__Host-wo-participant-remember';
export function rememberedCookies(response: Response, result: { rememberToken?: string; rememberExpiresAt?: string }, participant: boolean) {
  const name = participant ? PARTICIPANT_REMEMBER : ADMIN_REMEMBER;
  if (!!result.rememberToken !== !!result.rememberExpiresAt) throw new GatewayError(502, 'INVALID_LOGIN', 'Sign-in could not be verified.');
  response.headers.append('Set-Cookie', setStaffCookie(name, result.rememberToken ?? '', result.rememberExpiresAt ? lifetime(result.rememberExpiresAt, (participant ? 30 : 7) * 86400) : 0));
}
/** Custom intent header plus exact Origin prevents cross-site form/CSRF requests, even after access expires. */
export async function handleRemembered(request: Request, env: GatewayEnv, upstream: typeof fetch): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  const participant = path.startsWith('/api/participant/');
  const refresh = path === (participant ? '/api/participant/refresh' : '/api/auth/discord/refresh');
  const forget = path === (participant ? '/api/participant/forget' : '/api/auth/discord/forget');
  const logout = path === (participant ? '/api/participant/logout' : '/api/auth/logout') && request.headers.get('X-WO-Auth-Intent') === 'renew';
  if (!refresh && !forget && !logout) return;
  const config = discordConfig(request, env);
  if (request.method !== 'POST' || config.url.search) throw new GatewayError(405, 'METHOD_DENIED', 'Use the sign-in controls on this website.');
  if (request.headers.get('Origin') !== config.url.origin || request.headers.get('X-WO-Auth-Intent') !== 'renew' || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Use the sign-in controls on this website.');
  // Participant remember credentials retain their separate account. Shared admin
  // renewal applies only when this browser has no participant remember credential.
  const participantCredential = participant && (refresh
    ? !!staffCookie(request, PARTICIPANT_REMEMBER)
    : !!staffCookie(request, PARTICIPANT_REMEMBER) || !!staffCookie(request, '__Host-wo-participant-session'));
  const useParticipant = participant && participantCredential;
  const remember = staffCookie(request, useParticipant ? PARTICIPANT_REMEMBER : ADMIN_REMEMBER);
  const sessionName = useParticipant ? '__Host-wo-participant-session' : SESSION_COOKIE;
  const session = staffCookie(request, sessionName);
  let response: Response;
  try {
    if (refresh) {
      if (!remember) throw new GatewayError(401, 'AUTH_REQUIRED', 'Sign in with Discord again.');
      const result = await kinetic(useParticipant ? '/participant/refresh' : '/auth/discord/refresh', rememberRefreshSchema, undefined, env, upstream, { method: 'POST', body: JSON.stringify({ rememberToken: remember }) });
      if (result.guildId !== config.guildId) throw new GatewayError(502, 'INVALID_LOGIN', 'Sign-in could not be verified.');
      response = json({ schemaVersion: '1.0', renewed: true });
      response.headers.append('Set-Cookie', setStaffCookie(sessionName, result.sessionToken, lifetime(result.expiresAt, 900)));
      rememberedCookies(response, result, useParticipant);
      return response;
    }
    if (!remember && !session) throw new GatewayError(401, 'REVOCATION_UNCONFIRMED', 'This browser is signed out. Earlier server revocation cannot be confirmed without its credential.');
    const operations: Promise<unknown>[] = [];
    if (remember) operations.push(kinetic(useParticipant ? '/participant/forget' : '/auth/discord/forget', logoutSchema, undefined, env, upstream, { method: 'POST', body: JSON.stringify({ rememberToken: remember }) }));
    if (session) operations.push(kinetic(useParticipant ? '/participant/logout' : '/auth/logout', logoutSchema, { kind: useParticipant ? 'participant' : 'discord', token: session }, env, upstream, { method: 'POST', body: '{}' }));
    const results = await Promise.allSettled(operations);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    response = json({ schemaVersion: '1.0', revoked: true });
  } catch (error) {
    response = failure(error);
    if (refresh) return response; // A losing tab must never erase the winning cookies.
  }
  response.headers.append('Set-Cookie', setStaffCookie(sessionName, '', 0));
  response.headers.append('Set-Cookie', setStaffCookie(useParticipant ? PARTICIPANT_REMEMBER : ADMIN_REMEMBER, '', 0));
  response.headers.set('X-WO-Browser-Session-Ended', 'true');
  return response;
}

export function rememberChoice(url: URL): boolean {
  const entries = [...url.searchParams];
  if (entries.length > 1 || entries.some(([key, value]) => key !== 'remember' || value !== 'true')) throw new GatewayError(400, 'INVALID_QUERY', 'Start sign-in from the login page.');
  return url.searchParams.get('remember') === 'true';
}
