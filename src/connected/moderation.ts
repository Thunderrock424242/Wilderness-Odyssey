import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { playerSchema, reportDetailSchema, reportSummarySchema } from '../contracts/v1/admin';
import { ConnectedStore, ServiceError } from './store';
import { IdentityService } from './identity';
const excerpt = z.object({ speaker: z.enum(['player', 'aether']), text: z.string().trim().min(1).max(2000), sentAt: z.iso.datetime({ offset: true }) }).strict();
export const reportSubmission = z.object({ accountId: z.uuid(), playerUuid: z.uuid(), summary: z.string().trim().min(10).max(500), excerpts: z.array(excerpt).min(1).max(10), provenance: z.string().min(1).max(500) }).strict().refine(input => input.excerpts.reduce((sum, item) => sum + item.text.length, 0) <= 12000);
type Report = z.infer<typeof reportSummarySchema> & { accountId: string; provenance: string; retentionUntil: string };
export class ModerationService {
  constructor(readonly store: ConnectedStore, readonly identity: IdentityService) {}
  player(uuid: string) {
    const player = this.store.record('player', uuid.toLowerCase());
    if (!player) throw new ServiceError(404, 'NOT_FOUND', 'Verified player not found.');
    return playerSchema.parse(player);
  }
  submitReport(input: z.infer<typeof reportSubmission>, dedupKey: string) {
    const parsed = reportSubmission.parse(input);
    const accountId = this.identity.canonical(parsed.accountId);
    if (!this.identity.ownsMinecraft(accountId, parsed.playerUuid)) throw new ServiceError(403, 'IDENTITY_REQUIRED', 'Link and verify your Minecraft account before submitting its excerpts.');
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(dedupKey)) throw new ServiceError(400, 'INVALID_INPUT', 'A request identifier is required.');
    const key = createHash('sha256').update(accountId + '\n' + dedupKey).digest('hex');
    const hash = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
    return this.store.transaction(() => {
      const old = this.store.record<{ id: string; hash: string }>('report_request', key);
      if (old) {
        if (old.hash !== hash) throw new ServiceError(409, 'CONFLICT', 'Request identifier conflict.');
        const found = this.store.record<Report>('report', old.id);
        if (!found) throw new ServiceError(410, 'EXPIRED', 'The report retention period has ended.');
        return reportSummarySchema.parse(found);
      }
      // Rate limit authenticated submissions without retaining chat outside the selected excerpts.
      const recent = this.store.records<Report>('report', accountId, 10).filter(row => Date.parse(row.submittedAt) > this.store.clock() - 3600000);
      if (recent.length >= 5) throw new ServiceError(429, 'RATE_LIMITED', 'Please wait before submitting another report.');
      const report: Report = { id: randomUUID(), player: this.player(parsed.playerUuid), accountId, summary: parsed.summary, state: 'open', submittedAt: this.store.now(), revision: randomUUID(), provenance: parsed.provenance, retentionUntil: new Date(this.store.clock() + 30 * 86400000).toISOString() };
      this.store.put('report', report.id, accountId, report);
      this.store.put('report_excerpt', report.id, accountId, { excerpts: parsed.excerpts, retentionUntil: report.retentionUntil });
      this.store.put('report_request', key, accountId, { id: report.id, hash });
      this.store.audit(accountId, 'report.submit', report.id, 'succeeded');
      // The staff notification contains a reference only, never the submitted content.
      this.store.enqueue(report.id, 'staff', 'A private Aether report is ready for review. Reference: ' + report.id);
      return reportSummarySchema.parse(report);
    });
  }
  detail(id: string) {
    const report = this.store.record<Report>('report', id);
    if (!report) throw new ServiceError(404, 'NOT_FOUND', 'Report not found.');
    const excerpts = Date.parse(report.retentionUntil) > this.store.clock() ? this.store.record<{ excerpts: unknown[] }>('report_excerpt', id)?.excerpts ?? [] : [];
    return reportDetailSchema.parse({ schemaVersion: '1.0', report, excerpts, provenance: report.provenance, retentionUntil: report.retentionUntil, actions: this.store.records('report_history', id, 100) });
  }
  appeal(accountId: string, playerUuid: string, message: string, key: string) {
    if (!this.identity.ownsMinecraft(accountId, playerUuid)) throw new ServiceError(403, 'IDENTITY_REQUIRED', 'Verify this Minecraft account first.');
    const body = z.object({ message: z.string().trim().min(10).max(4000), key: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/) }).parse({ message, key });
    const id = createHash('sha256').update(accountId + '\n' + key).digest('hex');
    const old = this.store.record<{ message: string }>('appeal', id);
    if (old) { if (old.message !== body.message) throw new ServiceError(409, 'CONFLICT', 'Request identifier conflict.'); return old; }
    const recent = this.store.db.prepare("SELECT count(*) AS total FROM cs_records WHERE kind='appeal' AND owner=? AND julianday(json_extract(data,'$.createdAt'))>julianday(?)").get(playerUuid.toLowerCase(), new Date(this.store.clock() - 3600000).toISOString()) as { total: number };
    if (recent.total >= 5) throw new ServiceError(429, 'RATE_LIMITED', 'Please wait before submitting another appeal.');
    const authors = this.store.db.prepare("SELECT DISTINCT json_extract(data,'$.createdBy') AS actor FROM cs_records WHERE ((kind='restriction' AND owner=?) OR (kind='account_restriction' AND owner=?)) AND json_extract(data,'$.createdBy') IS NOT NULL").all(playerUuid.toLowerCase(), this.identity.canonical(accountId)) as { actor: string }[];
    const result = { id, state: 'open', message: body.message, createdAt: this.store.now(), revision: randomUUID(), decisionAuthors: authors.map(row => row.actor) };
    this.store.put('appeal', id, playerUuid.toLowerCase(), result);
    this.store.audit(accountId, 'appeal.submit', id, 'succeeded');
    return result;
  }
  cleanup(now = this.store.clock()): void {
    this.store.transaction(() => {
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='report_excerpt' AND json_extract(data,'$.retentionUntil')<=?").run(new Date(now).toISOString());
      this.store.db.prepare("DELETE FROM cs_records WHERE kind IN ('report','report_history','history','maintenance_history','appeal') AND COALESCE(json_extract(data,'$.submittedAt'),json_extract(data,'$.createdAt'))<?").run(new Date(now - 180 * 86400000).toISOString());
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='identity_code' AND json_extract(data,'$.expiresAt')<?").run(new Date(now).toISOString());
      this.store.db.prepare('DELETE FROM cs_idempotency WHERE created_at<?').run(now - 7 * 86400000);
      const cutoff = new Date(now - 180 * 86400000).toISOString();
      this.store.db.prepare('DELETE FROM cs_audit WHERE created_at<?').run(cutoff);
      this.store.db.prepare("DELETE FROM cs_operations WHERE json_extract(data,'$.operation.state') IN ('succeeded','failed','cancelled') AND json_extract(data,'$.operation.updatedAt')<?").run(cutoff);
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='report_request' AND NOT EXISTS (SELECT 1 FROM cs_records reports WHERE reports.kind='report' AND reports.id=json_extract(cs_records.data,'$.id'))").run();
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='account_request' AND json_extract(data,'$.createdAt')<?").run(new Date(now - 7 * 86400000).toISOString());
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='announcement' AND json_extract(data,'$.published_at')<?").run(cutoff);
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='incident' AND json_extract(data,'$.status')='resolved' AND json_extract(data,'$.timestamps.resolved_at')<?").run(cutoff);
    });
  }
}

