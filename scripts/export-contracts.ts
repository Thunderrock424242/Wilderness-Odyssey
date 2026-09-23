import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { publicStatusSchema } from '../contracts/v1/status';
import { browserSessionSchema } from '../contracts/v1/admin';
import { adminRoutes } from '../contracts/v1/routes';
mkdirSync('contracts/v1', { recursive: true });
const contract = {
  contractVersion: '1.0', publicStatus: z.toJSONSchema(publicStatusSchema),
  browserSession: z.toJSONSchema(browserSessionSchema),
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