import { z } from 'zod';
import type { Capability } from './admin';
import * as c from './content';
import * as s from './configuration';

export type AuthoringRoute = { method: string; path: string; pattern: RegExp; capability: Capability; input?: z.ZodType; output: z.ZodType; bodyLimit: number };
const route = (method: string, path: string, capability: Capability, output: z.ZodType, input?: z.ZodType, bodyLimit = 16384): AuthoringRoute => ({
  method, path, capability, input, output, bodyLimit,
  pattern: new RegExp('^' + path.replaceAll(':id', '[a-zA-Z0-9_-]{1,96}').replace(':kind', '(?:site|roadmap|gallery)') + '$'),
});
export const authoringRoutes = [
  route('GET', '/content/transmissions', 'content:read', c.transmissionListSchema),
  route('GET', '/content/transmissions/:id', 'content:read', c.transmissionEnvelope),
  route('POST', '/content/transmissions', 'content:write', c.contentMutationSchema, c.contentSaveInput, 2 * 1024 * 1024),
  route('PUT', '/content/transmissions/:id', 'content:write', c.contentMutationSchema, c.contentSaveInput, 2 * 1024 * 1024),
  route('DELETE', '/content/transmissions/:id', 'content:write', z.object({ schemaVersion: z.literal('1.0'), deleted: z.literal(true) }), c.deleteContentInput),
  route('POST', '/content/transmissions/:id/publication', 'content:publish', c.publicationSchema, c.publicationInput),
  route('GET', '/content/publications/:id', 'content:read', c.publicationSchema),
  route('GET', '/content/pages/:kind', 'content:read', c.pageDocumentSchema),
  route('PUT', '/content/pages/:kind', 'content:write', c.pageDocumentSchema, c.pageSaveInput, 2 * 1024 * 1024),
  route('POST', '/content/pages/:kind/publication', 'content:publish', c.publicationSchema, c.publicationInput),
  route('GET', '/configuration', 'configuration:read', s.configurationSchema),
  route('PUT', '/configuration', 'configuration:write', s.configurationSchema, s.configurationInput),
  route('PUT', '/configuration/credentials', 'configuration:credentials', s.configurationSchema, s.credentialInput),
  route('POST', '/configuration/verification', 'configuration:write', s.configurationSchema, s.verificationInput),
];
