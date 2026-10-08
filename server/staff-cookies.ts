import { opaqueTokenSchema } from '../contracts/v1/auth';
import { GatewayError } from './http';

export const SESSION_COOKIE = '__Host-wo-admin-session';
export const FLOW_COOKIE = '__Host-wo-admin-flow';

export function staffCookie(request: Request, name: string): string | undefined {
  const values = (request.headers.get('Cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.slice(0, value.indexOf('=')) === name).map(value => value.slice(value.indexOf('=') + 1));
  if (values.length > 1 || (values.length === 1 && !opaqueTokenSchema.safeParse(values[0]).success)) {
    throw new GatewayError(401, 'AUTH_REQUIRED', 'Your Discord session could not be verified. Sign in again.');
  }
  return values[0];
}

export function setStaffCookie(name: string, value: string, maxAge: number) {
  return name + '=' + value + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; Secure; SameSite=Lax';
}

export function lifetime(expiresAt: string, maximum: number) {
  const seconds = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);
  if (seconds < 1) throw new GatewayError(401, 'SESSION_EXPIRED', 'Your Discord session has expired. Sign in again.');
  if (seconds > maximum) throw new GatewayError(502, 'INVALID_SESSION', 'Discord sign-in could not be verified.');
  return seconds;
}

export async function discordCsrfSubject(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return 'discord:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
