import type { GatewayEnv } from '../server/env';
import { verifyAccess } from '../server/access';
import { handleGateway } from '../server/gateway';
import { failure, GatewayError } from '../server/http';

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
  try {
    const path = normalizedPath(new URL(request.url).pathname);
    const staff = path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
    if (env.ENVIRONMENT === 'preview') await verifyAccess(request, env, undefined, !staff);
    if (path.startsWith('/api/')) return await handleGateway(request, env);
    if (staff) {
      await verifyAccess(request, env);
      const response = await context.next();
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      return new Response(response.body, { status: response.status, headers });
    }
    return await context.next();
  } catch (error) { return failure(error); }
}