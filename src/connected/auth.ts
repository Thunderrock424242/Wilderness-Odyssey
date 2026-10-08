import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { JWTVerifyGetKey } from 'jose';
import { ConnectedStore, ServiceError } from './store';

export const loadJose = new Function('return import("jose")') as () => Promise<typeof import('jose')>;
export interface AccessTrust { issuer: string; machineAudience: string; staffAudience: string; machineIdentity: string; environment: 'production' | 'preview' }
export function secretMatches(presented: string | undefined, expected: string | undefined): boolean {
  if (!expected || expected.length < 32 || !presented || presented.length > 4096) return false;
  const a = Buffer.from(presented), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function bearer(headers: IncomingHttpHeaders): string | undefined {
  return typeof headers.authorization === 'string' ? /^Bearer ([^\s]+)$/.exec(headers.authorization)?.[1] : undefined;
}
export class AccessAuthenticator {
  private resolver?: JWTVerifyGetKey;
  constructor(readonly store: ConnectedStore, readonly trust: AccessTrust, keySet?: JWTVerifyGetKey) { this.resolver = keySet; }
  private async verify(token: unknown, audience: string) {
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(this.trust.issuer) || !audience || typeof token !== 'string' || token.length > 16384) throw new Error();
    const jose = await loadJose();
    this.resolver ??= jose.createRemoteJWKSet(new URL(this.trust.issuer + '/cdn-cgi/access/certs'), { timeoutDuration: 5000, cooldownDuration: 30000 });
    const { payload } = await jose.jwtVerify(token, this.resolver, { issuer: this.trust.issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat'], clockTolerance: 5 });
    if (typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000 + 5) throw new Error();
    return payload;
  }
  async machine(headers: IncomingHttpHeaders): Promise<void> {
    try {
      if (!this.trust.machineIdentity || headers['x-wo-environment'] !== this.trust.environment) throw new Error();
      const machine = await this.verify(headers['cf-access-jwt-assertion'], this.trust.machineAudience);
      if (machine.common_name !== this.trust.machineIdentity) throw new Error();
    } catch { throw new ServiceError(401, 'IDENTITY_INVALID', 'Service identity could not be verified.'); }
  }
  async identity(headers: IncomingHttpHeaders) {
    let subject: string;
    try {
      if (!this.trust.staffAudience || this.trust.machineAudience === this.trust.staffAudience) throw new Error();
      await this.machine(headers);
      const user = await this.verify(headers['x-wo-user-assertion'], this.trust.staffAudience);
      if (!user.sub || user.sub.length > 200 || typeof user.email !== 'string' || user.email.startsWith('non_identity@') || user.common_name) throw new Error();
      subject = user.sub;
    } catch { throw new ServiceError(401, 'IDENTITY_INVALID', 'Service or staff identity could not be verified.'); }
    return { subject, issuer: this.trust.issuer };
  }
  async authenticate(headers: IncomingHttpHeaders) {
    const { subject } = await this.identity(headers);
    const actor = this.store.staff(this.trust.issuer, subject);
    if (!actor) throw new ServiceError(403, 'FORBIDDEN', 'No active staff permission assignment.');
    return { actor, subject };
  }
}
