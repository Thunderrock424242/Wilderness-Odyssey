import type { GatewayEnv } from '../server/env';
import { verifyAccess } from '../server/access';
import { handleGateway } from '../server/gateway';
import { failure, GatewayError } from '../server/http';
import { staffSession } from '../server/staff-session';
import { loginError, loginRedirect } from '../server/discord-auth';
import { pageError } from '../server/page-error';

export function normalizedPath(path: string) {
  try {
    // Normalize encoded asset paths before testing protection; do not let static
    // asset normalization turn an encoded URL into an unguarded staff page.
    let decoded = decodeURIComponent(path);
    if (decoded.includes('%')) decoded = decodeURIComponent(decoded);
    return new URL('https://route.invalid' + decoded.replaceAll('\\', '/').replace(/\/{2,}/g, '/')).pathname.toLowerCase();
  } catch { throw new GatewayError(400, 'INVALID_PATH', 'This URL could not be processed.'); }
}
export async function onRequest(context: { request: Request; env: GatewayEnv; next: () => Promise<Response> }): Promise<Response> {
  const { request, env } = context;
  let apiRequest = false;
  try {
    const rawPath = new URL(request.url).pathname;
    // Classify the prefix before decoding the full URL so malformed API paths keep JSON errors.
    const prefix = normalizedPath('/' + (rawPath.split('/').find(Boolean) ?? ''));
    apiRequest = prefix === '/api' || prefix.startsWith('/api/');
    const path = normalizedPath(rawPath);
    apiRequest = path === '/api' || path.startsWith('/api/');
    const staff = path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
    const authentication = path === '/api/auth' || path.startsWith('/api/auth/') || path === '/login' || path.startsWith('/login/');
    if (env.ENVIRONMENT === 'preview') await verifyAccess(request, env, undefined, !staff && !authentication);
    if (path.startsWith('/api/')) return await handleGateway(request, env);
    if (staff) {
      if (env.STAFF_AUTH_MODE === 'access') await verifyAccess(request, env);
      else {
        try { await staffSession(request, env); }
        catch (error) {
          if (error instanceof GatewayError && [401, 403].includes(error.status) && error.code !== 'HOST_DENIED') {
            return loginRedirect(error.code === 'AUTH_REQUIRED' ? undefined : loginError(error));
          }
          throw error;
        }
      }
      const response = await context.next();
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      return new Response(response.body, { status: response.status, headers });
    }
    if (authentication) {
      const response = await context.next();
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      return new Response(response.body, { status: response.status, headers });
    }
    return await context.next();
  } catch (error) {
    return !apiRequest && request.headers.get('Accept')?.includes('text/html') ? pageError(error) : failure(error);
  }
}
