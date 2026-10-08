import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { publicStatusSchema } from '../contracts/v1/status';
import { browserSessionSchema } from '../contracts/v1/admin';
import { adminRoutes } from '../contracts/v1/routes';
import { authoringRoutes } from '../contracts/v1/authoring-routes';
import { mediaSchema } from '../contracts/v1/content';
import { discordStartInput, discordStartSchema, discordCallbackInput, discordCallbackSchema, discordSessionSchema, logoutSchema } from '../contracts/v1/auth';
mkdirSync('contracts/v1', { recursive: true });
const contract = {
  contractVersion: '1.0', publicStatus: z.toJSONSchema(publicStatusSchema),
  browserSession: z.toJSONSchema(browserSessionSchema),
  discordAuthentication: {
    staffSession: z.toJSONSchema(discordSessionSchema),
    sessionHeader: 'X-WO-Admin-Session',
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
