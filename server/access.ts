import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { GatewayEnv } from './env';
import { GatewayError, httpsUrl } from './http';

// Only public signing keys are shared; user identities and permissions are never cached.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyAccess(request: Request, env: GatewayEnv, keySet?: JWTVerifyGetKey, allowPreviewService = false) {
  const url = new URL(request.url);
  if (!['production', 'preview'].includes(env.ENVIRONMENT ?? '') || !env.ACCESS_AUDIENCE || !env.ACCESS_TEAM_DOMAIN || !env.ALLOWED_HOSTS) {
    throw new GatewayError(503, 'ACCESS_NOT_CONFIGURED', 'Staff access has not been configured.');
  }
  const hosts = env.ALLOWED_HOSTS.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const allowed = hosts.some(host => host === url.host.toLowerCase() ||
    (env.ENVIRONMENT === 'preview' && /^\*\.[a-z0-9-]+\.pages\.dev$/.test(host) &&
      url.hostname.endsWith(host.slice(1)) && !url.hostname.slice(0, -host.slice(1).length).includes('.')));
  if (!allowed || url.protocol !== 'https:') throw new GatewayError(403, 'HOST_DENIED', 'Staff access is not available on this hostname.');
  const issuer = httpsUrl(env.ACCESS_TEAM_DOMAIN, true).origin;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) throw new GatewayError(503, 'ACCESS_NOT_CONFIGURED', 'Staff access has not been configured.');
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion || assertion.length > 16384) throw new GatewayError(401, 'AUTH_REQUIRED', 'Sign in through Cloudflare Access to continue.');
  try {
    let resolver = keySet;
    if (!resolver) {
      resolver = keySets.get(issuer);
      if (!resolver) {
        const remoteKeys = createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs'), { timeoutDuration: 5000, cooldownDuration: 30000 });
        keySets.set(issuer, remoteKeys);
        resolver = remoteKeys;
      }
    }
    const { payload } = await jwtVerify(assertion, resolver, {
      issuer, audience: env.ACCESS_AUDIENCE, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat'], clockTolerance: 5,
    });
    if (allowPreviewService && env.ENVIRONMENT === 'preview' && env.PREVIEW_VERIFY_SERVICE_ID && payload.common_name === env.PREVIEW_VERIFY_SERVICE_ID) return { sub: 'service:' + env.PREVIEW_VERIFY_SERVICE_ID, issuer, assertion };
    if (!payload.sub || typeof payload.email !== 'string' || payload.email.startsWith('non_identity@') || payload.common_name) throw new Error('Human identity required');
    return { sub: payload.sub, issuer, assertion };
  } catch { throw new GatewayError(401, 'AUTH_REQUIRED', 'Your staff session could not be verified. Sign in again.'); }
}