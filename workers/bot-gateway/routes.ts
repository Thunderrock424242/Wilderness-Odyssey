import { z } from 'zod';
import { adminRoutes } from '../../contracts/v1/routes';
import { authoringRoutes } from '../../contracts/v1/authoring-routes';
import { playtestRoutes } from '../../contracts/v1/playtest-routes';
import { discordStartInput, discordStartSchema, discordCallbackInput, discordCallbackSchema, discordSessionSchema, logoutSchema } from '../../contracts/v1/auth';
import { mediaSchema } from '../../contracts/v1/content';
import { publicStatusSchema } from '../../contracts/v1/status';

export type BotRoute = {
  public?: boolean;
  input?: z.ZodType;
  output?: z.ZodType;
  query?: z.ZodType;
  bodyLimit: number;
  responseLimit: number;
  media?: boolean;
};
const authRoutes = [
  { path: '/auth/discord/start', input: discordStartInput, output: discordStartSchema },
  { path: '/auth/discord/callback', input: discordCallbackInput, output: discordCallbackSchema },
  { path: '/auth/logout', input: z.object({}).strict(), output: logoutSchema },
];

export function selectRoute(method: string, pathname: string): BotRoute | undefined {
  if (method === 'GET' && pathname === '/v1/public/status') return { public: true, output: publicStatusSchema, bodyLimit: 0, responseLimit: 65536 };
  if (!pathname.startsWith('/v1/admin/')) return;
  const path = pathname.slice('/v1/admin'.length);
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
