import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { publicStatusSchema } from '../contracts/v1/status';
import { browserSessionSchema } from '../contracts/v1/admin';
import { adminRoutes } from '../contracts/v1/routes';
import { authoringRoutes } from '../contracts/v1/authoring-routes';
import { playtestRoutes } from '../contracts/v1/playtest-routes';
import { playgroundRoutes, peerCapabilitiesSchema, peerSandboxRequest, sandboxOutput, peerTrainingRequest, peerJobSchema, peerAdmissionInput, peerAdmissionSchema, peerCancellationSchema } from '../contracts/v1/aether-playground';
import { chatRoutes } from '../contracts/v1/playtester-chat';
import { mediaSchema } from '../contracts/v1/content';
import * as participant from '../contracts/v1/participants';
import { discordStartInput, discordStartSchema, discordCallbackInput, discordCallbackSchema, discordSessionSchema, logoutSchema, rememberRefreshInput, rememberRefreshSchema } from '../contracts/v1/auth';
mkdirSync('contracts/v1', { recursive: true });
const contract = {
  aetherPlayground: { peer: { cancellation: z.toJSONSchema(peerCancellationSchema), capabilities: z.toJSONSchema(peerCapabilitiesSchema), sandboxRequest: z.toJSONSchema(peerSandboxRequest), sandboxResponse: z.toJSONSchema(sandboxOutput), trainingRequest: z.toJSONSchema(peerTrainingRequest), job: z.toJSONSchema(peerJobSchema), admissionRequest: z.toJSONSchema(peerAdmissionInput), admissionResponse: z.toJSONSchema(peerAdmissionSchema) }, routes: playgroundRoutes.map(route => ({ method: route.method, websitePath: '/api/admin/v1' + route.path, backendPath: '/v1/admin' + route.path, capability: route.capability, bodyLimit: route.bodyLimit, timeoutMs: route.timeoutMs, input: route.input ? z.toJSONSchema(route.input) : null, output: z.toJSONSchema(route.output) })) },
  contractVersion: '1.0', publicStatus: z.toJSONSchema(publicStatusSchema),
  playtesterChat: { backendPrefix: '/v1/admin/playtester-chat', browserPrefix: '/api/admin/v1/playtester-chat', capability: 'server:write', authentication: 'Discord administrator session and backend owner selection', routes: chatRoutes.map(route => ({ method: route.method, pattern: route.pattern.source, input: route.input ? z.toJSONSchema(route.input) : null, query: route.query ? z.toJSONSchema(route.query) : null, output: z.toJSONSchema(route.output) })), attachments: { path: '/attachments/:uuid', maximumBytes: 5 * 1024 * 1024, contentTypes: ['text/plain; charset=utf-8', 'application/x-spark-sampler'], cache: 'no-store' } },
  playtests: { integrationStatus: 'implemented-requires-coordinated-bot-and-gateway-deployment', routes: playtestRoutes.map(route => ({ method: route.method, websitePath: '/api/admin/v1' + route.path, backendPath: '/v1/admin' + route.path, capability: route.capability, input: route.input ? z.toJSONSchema(route.input) : null, query: route.query ? z.toJSONSchema(route.query) : null, output: z.toJSONSchema(route.output) })), downloads: { suffix: '/download', backendSuffix: '', response: 'Validated private artifact bytes; never a storage URL.' } },
  participants: { backendPrefix: '/v1/admin/participant/', browserPrefix: '/api/participant/', callback: '/api/auth/discord/callback', sessionHeader: 'X-WO-Participant-Session', home: z.toJSONSchema(participant.participantHomeSchema), history: z.toJSONSchema(participant.participantHistorySchema), session: z.toJSONSchema(participant.participantSessionSchema), claimInput: z.toJSONSchema(participant.participantClaimInput), claim: z.toJSONSchema(participant.participantClaimSchema) },
  browserSession: z.toJSONSchema(browserSessionSchema),
  discordAuthentication: {
    staffSession: z.toJSONSchema(discordSessionSchema),
    sessionHeader: 'X-WO-Admin-Session',
    remembered: { input: z.toJSONSchema(rememberRefreshInput), output: z.toJSONSchema(rememberRefreshSchema), administratorDays: 7, participantDays: 30 },
    routes: [
      { method: 'POST', backendPath: '/v1/admin/auth/discord/start', input: discordStartInput, output: discordStartSchema },
      { method: 'POST', backendPath: '/v1/admin/auth/discord/callback', input: discordCallbackInput, output: discordCallbackSchema },
      { method: 'POST', backendPath: '/v1/admin/auth/logout', input: z.object({}).strict(), output: logoutSchema },
    ].map(route => ({ ...route, input: z.toJSONSchema(route.input), output: z.toJSONSchema(route.output) })),
  },
  authoring: { routes: authoringRoutes.map(route => ({ method: route.method, websitePath: '/api/admin/v1' + route.path, backendPath: '/v1/admin' + route.path, capability: route.capability, bodyLimit: route.bodyLimit, input: route.input ? z.toJSONSchema(route.input) : null, output: z.toJSONSchema(route.output) })), media: { websitePath: '/api/admin/v1/content/media', backendPath: '/v1/admin/content/media', uploadBytes: 12 * 1024 * 1024, multipartOverheadBytes: 1024 * 1024, output: z.toJSONSchema(mediaSchema) } },
  routes: adminRoutes.map(route => ({
    method: route.method, websitePath: '/api/admin/v1' + route.path, backendPath: '/v1/admin' + route.path,
    capability: route.capability ?? null,
    input: route.input ? z.toJSONSchema(route.input) : null,
    query: route.query ? z.toJSONSchema(route.query) : null,
    output: z.toJSONSchema(route.output),
  })),
};
writeFileSync('contracts/v1/schemas.json', JSON.stringify(contract, null, 2) + '\n');
console.log('Exported version 1.0 public and administration API contracts.');
