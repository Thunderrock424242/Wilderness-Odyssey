import { z } from 'zod';
import * as s from './admin';

export type RouteDefinition = { method: string; path: string; pattern: RegExp; capability?: s.Capability; input?: z.ZodType; output: z.ZodType; query?: z.ZodType };
const cursorQuery = z.object({ cursor: z.string().max(200).optional() }).strict();
const route = (method: string, path: string, output: z.ZodType, capability?: s.Capability, input?: z.ZodType, query?: z.ZodType): RouteDefinition => ({
  method, path, output, capability, input, query,
  pattern: new RegExp('^' + path.replace(':uuid', '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}').replaceAll(':id', '[a-zA-Z0-9_-]{1,96}') + '$'),
});
export const adminRoutes = [
  route('GET', '/session', s.sessionSchema),
  route('GET', '/overview', s.overviewSchema, 'status:read'),
  route('GET', '/incidents', s.incidentsSchema, 'status:read'),
  route('PUT', '/maintenance', s.mutationSchema, 'server:write', s.maintenanceInput),
  route('PUT', '/ai-requests', s.mutationSchema, 'server:write', s.aiRequestsInput),
  route('POST', '/service-operations', s.mutationSchema, 'server:write', s.serviceInput),
  route('GET', '/operations/:id', s.mutationSchema, 'status:read'),
  route('GET', '/players', s.playersSchema, 'players:read', undefined, z.object({ q: z.string().trim().min(2).max(64), cursor: z.string().max(200).optional() }).strict()),
  route('GET', '/players/:uuid', s.playerDetailSchema, 'players:read'),
  route('POST', '/players/:uuid/warnings', s.mutationSchema, 'players:write', s.warningInput),
  route('POST', '/players/:uuid/restrictions', s.mutationSchema, 'players:write', s.restrictionInput),
  route('POST', '/players/:uuid/restrictions/:id/revoke', s.mutationSchema, 'players:write', s.revokeInput),
  route('POST', '/players/:uuid/appeals/:id/resolve', s.mutationSchema, 'players:write', s.appealInput),
  route('GET', '/reports', s.reportsSchema, 'reports:read', undefined, cursorQuery),
  route('GET', '/reports/:id', s.reportDetailSchema, 'reports:read'),
  route('POST', '/reports/:id/resolve', s.mutationSchema, 'reports:write', s.reportInput),
  route('GET', '/models', s.modelsSchema, 'models:read'),
  route('POST', '/model-changes', s.mutationSchema, 'models:write', s.modelInput),
  route('PUT', '/inference-settings', s.mutationSchema, 'models:write', s.settingsInput),
];