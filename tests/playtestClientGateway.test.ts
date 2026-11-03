import { expect, it } from 'vitest';
import { handleBotGateway, type BotGatewayEnv } from '../workers/bot-gateway';
it('forwards only scoped installation credentials and never caches private enrollments or policy', async () => {
  const calls: Request[] = [];
  const env = { BOT_API: { fetch: async (request: Request) => { calls.push(request); return Response.json({ schemaVersion: '1.0', enabled: false }); } } } as BotGatewayEnv;
  const response = await handleBotGateway(new Request('https://gateway.example/api/playtest/v1/policy', { headers: { Authorization: 'Bearer ' + 'a'.repeat(43), Cookie: 'secret', 'X-WO-Admin-Session': 's'.repeat(43) } }), env);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(calls[0].headers.get('Authorization')).toBe('Bearer ' + 'a'.repeat(43));
  expect(calls[0].headers.has('Cookie')).toBe(false);
  expect(calls[0].headers.has('X-WO-Admin-Session')).toBe(false);
  const denied = await handleBotGateway(new Request('https://gateway.example/api/playtest/v1/policy'), env);
  expect(denied.status).toBe(401);
  expect(calls).toHaveLength(1);
});
