import { z } from 'zod';
import type { ConnectedRuntime } from '../connected/runtime';
import { ServiceError } from '../connected/store';
import { redactLog } from './logParser';

/** Remove recognized credentials before any private preview or persistence; users still review the result. */
export function redactReportText(text: string): string {
  return redactLog(text)
    .replace(/\bwoa_[A-Za-z0-9_-]{20,256}\b/g, '[redacted-token]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted-token]')
    .replace(/https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/[^\s]+/gi, '[redacted-webhook]')
    .replace(/\b(?:password|api[_-]?key|secret)\s*[:=]\s*["']?[^"'\s]+/gi, '[redacted-secret]');
}
export function verifiedReportPlayer(runtime: ConnectedRuntime, discordId: string, submittedUuid: string | null) {
  const accountId = runtime.identity.account('discord', discordId);
  const candidates = runtime.store.db.prepare("SELECT id FROM cs_records WHERE kind='minecraft_claim' AND owner=? AND json_extract(data,'$.active')=1 LIMIT 2").all(accountId) as { id: string }[];
  const uuid = submittedUuid ? z.uuid().parse(submittedUuid).toLowerCase() : candidates.length === 1 ? candidates[0]!.id : null;
  if (!uuid || !runtime.identity.ownsMinecraft(accountId, uuid)) throw new ServiceError(403, 'IDENTITY_REQUIRED', 'Verify your Minecraft link first. If you have multiple linked accounts, select its UUID.');
  return { accountId, playerUuid: uuid, player: runtime.moderation.player(uuid) };
}
