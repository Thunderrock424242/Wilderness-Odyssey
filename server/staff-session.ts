import type { JWTVerifyGetKey } from 'jose';
import { sessionSchema } from '../contracts/v1/admin';
import { discordSessionSchema, type StaffCredential } from '../contracts/v1/auth';
import { verifyAccess } from './access';
import type { GatewayEnv } from './env';
import { GatewayError } from './http';
import { kinetic } from './kinetic-client';
import { discordCsrfSubject, lifetime, SESSION_COOKIE, staffCookie } from './staff-cookies';
import { discordConfig } from './staff-host';

export async function staffSession(request: Request, env: GatewayEnv, upstream: typeof fetch = fetch, jwks?: JWTVerifyGetKey) {
  if (env.STAFF_AUTH_MODE === 'access') {
    const identity = await verifyAccess(request, env, jwks);
    const credential: StaffCredential = { kind: 'access', assertion: identity.assertion };
    const session = await kinetic('/session', sessionSchema, credential, env, upstream);
    if (session.user.id !== identity.sub) throw new GatewayError(403, 'IDENTITY_MISMATCH', 'Your backend identity could not be verified.');
    return { session, credential, csrfSubject: identity.sub };
  }
  const config = discordConfig(request, env);
  const token = staffCookie(request, SESSION_COOKIE);
  if (!token) throw new GatewayError(401, 'AUTH_REQUIRED', 'Sign in with Discord to continue.');
  const credential: StaffCredential = { kind: 'discord', token };
  const session = await kinetic('/session', discordSessionSchema, credential, env, upstream);
  lifetime(session.expiresAt, 900);
  if (session.guildId !== config.guildId || session.user.role !== 'administrator' || !/^\d{17,22}$/.test(session.user.id)) {
    throw new GatewayError(403, 'FORBIDDEN', 'Your Discord account does not have dashboard access in this server.');
  }
  return { session: sessionSchema.parse(session), credential, csrfSubject: await discordCsrfSubject(token) };
}
