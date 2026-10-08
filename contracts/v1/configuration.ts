import { z } from 'zod';
import { contentRevision } from './content';

const channel = z.string().regex(/^\d{17,22}$/).nullable();
export const connectionSettingsSchema = z.object({
  mainOrigin: z.string().max(2048).refine(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash; } catch { return false; }
  }, 'Use an approved HTTPS origin without a path.').nullable(),
  intervalMs: z.number().int().min(5000).max(300000), staleSeconds: z.number().int().min(15).max(300),
  failures: z.number().int().min(2).max(20), recoveries: z.number().int().min(2).max(20),
  staffChannel: channel, publicChannel: channel,
}).strict().refine(value => value.intervalMs < value.staleSeconds * 1000, 'The refresh interval must be shorter than the freshness limit.');
const credentialMetadata = z.object({ configured: z.boolean(), updatedAt: z.iso.datetime().nullable() });
export const configurationSchema = z.object({
  schemaVersion: z.literal('1.0'), revision: contentRevision, settings: connectionSettingsSchema,
  credentials: z.object({ read: credentialMetadata, write: credentialMetadata }),
  verification: z.object({ state: z.enum(['unverified', 'verified', 'unavailable', 'rejected', 'wrong-server']), checkedAt: z.iso.datetime().nullable(), readVerified: z.boolean(), writeVerified: z.boolean(), message: z.string().max(500) }),
  application: z.object({ state: z.enum(['applied', 'pending', 'restart-required']), revision: contentRevision }),
  bootstrap: z.array(z.object({ label: z.string().min(1).max(100), ready: z.boolean() })).max(20),
}).refine(value => {
  const check = value.verification;
  return (check.state === 'verified' ? check.readVerified && check.checkedAt !== null : !check.readVerified && !check.writeVerified)
    && (!check.writeVerified || (check.readVerified && value.credentials.write.configured))
    && (!check.readVerified || value.credentials.read.configured)
    && (value.application.state !== 'applied' || value.application.revision === value.revision)
    && (value.application.state !== 'restart-required' || value.application.revision !== value.revision);
}, 'The service returned inconsistent verification or application states.');
const reason = z.string().trim().min(10).max(1000);
export const configurationInput = z.object({ settings: connectionSettingsSchema, revision: contentRevision, reason }).strict();
export const credentialInput = z.object({ scope: z.enum(['read', 'write']), value: z.string().min(32).max(4096).regex(/^[^\s]+$/), revision: contentRevision, reason }).strict();
export const verificationInput = z.object({ revision: contentRevision }).strict();
export type ConnectionSettings = z.infer<typeof connectionSettingsSchema>;
export type Configuration = z.infer<typeof configurationSchema>;
