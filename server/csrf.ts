import { jwtVerify, SignJWT } from 'jose';
import { GatewayError } from './http';
function key(secret: string) {
  if (new TextEncoder().encode(secret).length < 32) throw new GatewayError(503, 'CSRF_NOT_CONFIGURED', 'Staff actions have not been configured.');
  return new TextEncoder().encode(secret);
}
export async function createCsrf(subject: string, origin: string, secret: string) {
  return new SignJWT({ purpose: 'csrf' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('wilderness-odyssey:csrf').setSubject(subject).setAudience(origin).setIssuedAt().setExpirationTime('15m').sign(key(secret));
}
export async function verifyCsrf(token: string, subject: string, origin: string, secret: string) {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: 'wilderness-odyssey:csrf', audience: origin, subject, algorithms: ['HS256'], requiredClaims: ['exp', 'iat', 'sub'] });
    if (payload.purpose !== 'csrf') throw new Error();
  } catch { throw new GatewayError(403, 'CSRF_REJECTED', 'Refresh this page before submitting the action again.'); }
}