import { z } from 'zod';
import { rememberedFetch as fetch } from './rememberedFetch';
import { participantSessionSchema } from '../../contracts/v1/participants';
export const browserParticipantSession = participantSessionSchema.extend({ csrfToken: z.string().min(1).max(2048) });
export class ParticipantError extends Error { constructor(readonly status: number) { super(status === 401 ? 'Sign in with Discord to open your playtester home.' : status === 403 ? 'This account does not have access, or the invitation was revoked. Ask staff for help.' : status === 409 ? 'This invitation changed or was already used. Refresh and ask staff if you need help.' : status === 410 ? 'This invitation expired. Ask staff for a new one.' : 'Your playtester home is temporarily unavailable. Please try again.'); } }
export async function participantRequest<T>(path: string, schema: z.ZodType<T>, body?: unknown, csrf?: string): Promise<T> {
  let response: Response;
  try { response = await fetch('/api/participant/' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000), headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ParticipantError(503); }
  if (!response.ok) throw new ParticipantError(response.status);
  try {
    if (!response.body) throw new Error();
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 8 * 1024 * 1024) throw new Error(); chunks.push(part.value); } }
    finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    const value = schema.safeParse(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    if (value.success) return value.data;
  } catch { /* Safe UI error below. */ }
  throw new ParticipantError(502);
}
