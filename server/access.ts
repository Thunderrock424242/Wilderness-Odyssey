import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { GatewayEnv } from './env';
import { GatewayError, httpsUrl } from './http';
import { validateStaffHost } from './staff-host';

// Only public signing keys are shared; user identities and permissions are never cached.
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyAccess(request: Request, env: GatewayEnv, keySet?: JWTVerifyGetKey, allowPreviewService = false) {
  validateStaffHost(request, env);
  if (!env.ACCESS_AUDIENCE || !env.ACCESS_TEAM_DOMAIN) {
    throw new GatewayError(503, 'ACCESS_NOT_CONFIGURED', 'Staff access has not been configured.');
  }
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
