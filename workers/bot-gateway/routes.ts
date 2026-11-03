import { z } from 'zod';
import * as client from '../../contracts/v1/playtest-client';
import { adminRoutes } from '../../contracts/v1/routes';
import { authoringRoutes } from '../../contracts/v1/authoring-routes';
import { playtestRoutes } from '../../contracts/v1/playtest-routes';
import { chatRoutes } from '../../contracts/v1/playtester-chat';
import { discordStartInput, discordStartSchema, discordCallbackInput, discordCallbackSchema, discordSessionSchema, logoutSchema, rememberRefreshInput, rememberRefreshSchema } from '../../contracts/v1/auth';
import { mediaSchema } from '../../contracts/v1/content';
import { publicStatusSchema } from '../../contracts/v1/status';
import * as participant from '../../contracts/v1/participants';

export type BotRoute = {
  public?: boolean;
  installation?: boolean;
  input?: z.ZodType;
  output?: z.ZodType;
  query?: z.ZodType;
  bodyLimit: number;
  responseLimit: number;
  media?: boolean;
  attachment?: boolean;
};
const authRoutes = [
  { path: '/auth/discord/start', input: discordStartInput, output: discordStartSchema },
  { path: '/auth/discord/callback', input: discordCallbackInput, output: discordCallbackSchema },
  { path: '/auth/logout', input: z.object({}).strict(), output: logoutSchema },
  { path: '/auth/discord/refresh', input: rememberRefreshInput, output: rememberRefreshSchema },
  { path: '/auth/discord/forget', input: rememberRefreshInput, output: logoutSchema },
];

export function selectRoute(method: string, pathname: string): BotRoute | undefined {
  if (method === 'GET' && pathname === '/v1/public/status') return { public: true, output: publicStatusSchema, bodyLimit: 0, responseLimit: 65536 };
  if (pathname === '/api/playtest/v1/enroll' && method === 'POST') return { public: true, installation: true, input: client.enrollInput, output: client.enrollSchema, bodyLimit: 4096, responseLimit: 4096 };
  if (pathname === '/api/playtest/v1/policy' && method === 'GET') return { public: true, installation: true, output: client.policySchema, bodyLimit: 0, responseLimit: 4096 };
  if (pathname === '/api/playtest/v1/artifacts' && method === 'POST') return { public: true, installation: true, input: client.artifactInput, output: client.acceptedSchema, bodyLimit: 1536 * 1024, responseLimit: 4096 };
  if (!pathname.startsWith('/v1/admin/')) return;
  const path = pathname.slice('/v1/admin'.length);
  if (method === 'GET' && /^\/playtester-chat\/attachments\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(path)) return { attachment: true, bodyLimit: 0, responseLimit: 5 * 1024 * 1024 };
  const chat = chatRoutes.find(item => item.method === method && item.pattern.test(path));
  if (chat) return { ...chat, bodyLimit: chat.input ? chat.bodyLimit : 0, responseLimit: 1024 * 1024 };
  if (path.startsWith('/participant/')) {
    const action = path.slice('/participant/'.length);
    const definitions: Record<string, { method: string; input?: z.ZodType; output: z.ZodType; query?: z.ZodType }> = {
      start: { method: 'POST', input: discordStartInput, output: discordStartSchema },
      callback: { method: 'POST', input: discordCallbackInput, output: discordCallbackSchema },
      refresh: { method: 'POST', input: rememberRefreshInput, output: rememberRefreshSchema },
      forget: { method: 'POST', input: rememberRefreshInput, output: logoutSchema },
      session: { method: 'GET', output: participant.participantSessionSchema },
      home: { method: 'GET', output: participant.participantHomeSchema },
      history: { method: 'GET', output: participant.participantHistorySchema, query: participant.participantQuery },
      claim: { method: 'POST', input: participant.participantClaimInput, output: participant.participantClaimSchema },
      logout: { method: 'POST', input: z.object({}).strict(), output: logoutSchema },
    };
    const definition = Object.hasOwn(definitions, action) ? definitions[action] : undefined;
    if (!definition || definition.method !== method) return;
    return { ...definition, bodyLimit: definition.input ? 16384 : 0, responseLimit: action === 'home' ? 8 * 1024 * 1024 : 262144 };
  }
  if (method === 'POST') {
    const auth = authRoutes.find(item => item.path === path);
    if (auth) return { ...auth, bodyLimit: 16384, responseLimit: 16384 };
  }
  if (path === '/content/media' && method === 'POST') return { media: true, output: mediaSchema, bodyLimit: 12 * 1024 * 1024, responseLimit: 16384 };
  if (/^\/content\/media\/[a-zA-Z0-9_-]{1,96}$/.test(path) && method === 'GET') return { media: true, bodyLimit: 0, responseLimit: 12 * 1024 * 1024 };
  const authoring = authoringRoutes.find(item => item.method === method && item.pattern.test(path));
  if (authoring) return { ...authoring, bodyLimit: authoring.input ? authoring.bodyLimit : 0, responseLimit: 4 * 1024 * 1024 };
  const route = [...adminRoutes, ...playtestRoutes].find(item => item.method === method && item.pattern.test(path));
  if (route) return {
    ...route, output: path === '/session' ? discordSessionSchema : route.output,
    bodyLimit: route.input ? 16384 : 0, responseLimit: 1536 * 1024,
  };
}
