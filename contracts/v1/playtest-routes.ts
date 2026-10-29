import { z } from 'zod';
import type { RouteDefinition } from './routes';
import * as s from './playtests';

function route(method: string, path: string, output: z.ZodType, input?: z.ZodType): RouteDefinition {
  return { method, path, output, input, capability: input ? 'playtests:write' : 'playtests:read', query: input ? undefined : z.object({ cursor: z.string().max(200).optional() }).strict(), pattern: new RegExp('^' + path.replace(/:[a-zA-Z]+/g, '[a-zA-Z0-9_-]{1,100}') + '$') };
}
const profile = '/playtests/:campaignId/testers/:testerId';
const session = profile + '/sessions/:sessionId';
export const playtestRoutes = [
  route('GET', '/playtests', s.campaignListSchema),
  route('POST', '/playtests', s.campaignEnvelope, s.createCampaignInput),
  route('GET', '/playtests/testers/:testerId/history', s.testerHistorySchema),
  route('GET', '/playtests/:campaignId', s.campaignDetailSchema),
  route('PUT', '/playtests/:campaignId/collection', s.campaignEnvelope, s.collectionInput),
  route('POST', '/playtests/:campaignId/invitations', s.invitationSchema, s.invitationInput),
  route('GET', profile, s.profileSchema),
  route('PUT', profile + '/permission', s.testerEnvelope, s.testerPermissionInput),
  route('DELETE', profile + '/data', s.deletionSchema, s.deleteDataInput),
  route('PUT', session + '/notes', s.sessionEnvelope, s.sessionNotesInput),
  route('GET', session + '/artifacts/:artifactId', s.privateArtifactSchema),
  route('GET', session + '/server-profiles/:artifactId', s.privateArtifactSchema),
];
