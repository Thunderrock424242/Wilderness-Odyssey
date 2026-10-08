import { discordCallbackInput, discordCallbackSchema, discordStartSchema, logoutSchema } from '../contracts/v1/auth';
import { verifyCsrf } from './csrf';
import type { GatewayEnv } from './env';
import { failure, GatewayError, json } from './http';
import { kinetic } from './kinetic-client';
import { discordCsrfSubject, FLOW_COOKIE, lifetime, SESSION_COOKIE, setStaffCookie, staffCookie } from './staff-cookies';
import { discordConfig } from './staff-host';

export function loginRedirect(error?: string) { return authRedirect('/login/' + (error ? '?error=' + error : '')); }
function authRedirect(location: string, status = 303) {
  return new Response(null, { status, headers: {
    Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  } });
}
export function loginError(error: unknown) {
  if (error instanceof GatewayError) {
    if (error.code === 'ENROLLMENT_REQUIRED') return 'enrollment_required';
    if (error.status === 403) return 'permission_denied';
    if (error.status === 400 || error.status === 401) return 'login_expired';
  }
  return 'service_unavailable';
}
function authorizationUrl(raw: string, redirectUri: string) {
  const url = new URL(raw);
  const fields = [...url.searchParams.keys()];
  const allowed = ['client_id', 'response_type', 'scope', 'redirect_uri', 'state', 'prompt'];
  if (url.origin !== 'https://discord.com' || url.pathname !== '/oauth2/authorize' || url.username || url.password || url.hash ||
    new Set(fields).size !== fields.length || fields.some(field => !allowed.includes(field)) ||
    !/^\d{17,22}$/.test(url.searchParams.get('client_id') ?? '') || url.searchParams.get('response_type') !== 'code' ||
    url.searchParams.get('scope') !== 'identify' || url.searchParams.get('redirect_uri') !== redirectUri ||
    !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state') ?? '') ||
    (url.searchParams.has('prompt') && url.searchParams.get('prompt') !== 'consent')) {
    throw new GatewayError(502, 'INVALID_LOGIN', 'Discord sign-in could not be started.');
  }
  return raw;
}

export async function handleDiscordAuth(request: Request, env: GatewayEnv, upstream: typeof fetch) {
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/discord/callback' && request.method === 'GET') {
    let response: Response;
    try {
      const config = discordConfig(request, env);
      const fields = [...config.url.searchParams.keys()];
      if (new Set(fields).size !== fields.length || fields.some(field => !['code', 'state', 'error', 'error_description'].includes(field))) throw new GatewayError(400, 'INVALID_CALLBACK', 'Start Discord sign-in again.');
      const flowToken = staffCookie(request, FLOW_COOKIE);
      if (!flowToken) throw new GatewayError(401, 'AUTH_REQUIRED', 'Start Discord sign-in again.');
      if (config.url.searchParams.get('error') === 'access_denied') {
        response = loginRedirect('cancelled');
      } else {
        const input = discordCallbackInput.safeParse({ code: config.url.searchParams.get('code'), state: config.url.searchParams.get('state'), flowToken, redirectUri: config.redirectUri });
        if (!input.success) throw new GatewayError(400, 'INVALID_CALLBACK', 'Start Discord sign-in again.');
        const result = await kinetic('/auth/discord/callback', discordCallbackSchema, undefined, env, upstream, { method: 'POST', body: JSON.stringify(input.data) });
        const maxAge = lifetime(result.expiresAt, 900);
        if (result.guildId !== config.guildId) throw new GatewayError(502, 'INVALID_LOGIN', 'Discord sign-in could not be verified.');
        response = authRedirect('/admin/');
        response.headers.append('Set-Cookie', setStaffCookie(SESSION_COOKIE, result.sessionToken, maxAge));
      }
    } catch (error) { response = loginRedirect(loginError(error)); }
    response.headers.append('Set-Cookie', setStaffCookie(FLOW_COOKIE, '', 0));
    return response;
  }
  if (path === '/api/auth/discord/start' && request.method === 'GET') {
    // Validate the deployment before translating backend failures to login UI.
    const config = discordConfig(request, env);
    if (config.url.search) throw new GatewayError(400, 'INVALID_QUERY', 'Start sign-in from the login page.');
    try {
      const result = await kinetic('/auth/discord/start', discordStartSchema, undefined, env, upstream, { method: 'POST', body: JSON.stringify({ redirectUri: config.redirectUri }) });
      const response = authRedirect(authorizationUrl(result.authorizationUrl, config.redirectUri), 302);
      response.headers.append('Set-Cookie', setStaffCookie(FLOW_COOKIE, result.flowToken, lifetime(result.expiresAt, 300)));
      return response;
    } catch { return loginRedirect('service_unavailable'); }
  }
  const config = discordConfig(request, env);
  if (path === '/api/auth/logout' && request.method === 'POST' && !config.url.search) {
    if (request.headers.get('Origin') !== config.url.origin || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) throw new GatewayError(403, 'ORIGIN_DENIED', 'Sign out from the staff dashboard.');
    const token = staffCookie(request, SESSION_COOKIE);
    if (!token) throw new GatewayError(401, 'AUTH_REQUIRED', 'Your Discord session has already ended.');
    await verifyCsrf(request.headers.get('X-CSRF-Token') ?? '', await discordCsrfSubject(token), config.url.origin, env.CSRF_SECRET ?? '');
    let response: Response;
    try {
      const result = await kinetic('/auth/logout', logoutSchema, { kind: 'discord', token }, env, upstream, { method: 'POST', body: '{}' });
      response = json(result);
    } catch (error) { response = failure(error); }
    // Always end this browser session after a verified logout request. A failed
    // backend revocation remains an error, never a claimed successful logout.
    response.headers.append('Set-Cookie', setStaffCookie(SESSION_COOKIE, '', 0));
    response.headers.set('X-WO-Browser-Session-Ended', 'true');
    return response;
  }
  throw new GatewayError(405, 'METHOD_DENIED', 'This sign-in operation is not available.');
}
