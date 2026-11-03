import { z } from 'zod';
import * as c from './content';
import type { Capability } from './admin';

export type AuthoringRoute = { method:string; pattern:RegExp; capability:Capability; input?:z.ZodType; output:z.ZodType; bodyLimit:number };
function route(method:string,path:string,capability:Capability,output:z.ZodType,input?:z.ZodType,bodyLimit = 16384):AuthoringRoute {
  return { method,pattern:new RegExp('^' + path.replace(':id','[a-zA-Z0-9_-]{1,96}').replace(':kind','(?:site|roadmap|gallery)') + '$'),capability,input,output,bodyLimit };
}
export const authoringRoutes = [
  route('GET','/content/transmissions','content:read',c.transmissionListSchema),
  route('GET','/content/transmissions/:id','content:read',c.transmissionEnvelope),
  route('POST','/content/transmissions','content:write',c.contentMutationSchema,c.contentSaveInput,2 * 1024 * 1024),
  route('PUT','/content/transmissions/:id','content:write',c.contentMutationSchema,c.contentSaveInput,2 * 1024 * 1024),
  route('DELETE','/content/transmissions/:id','content:write',z.object({ schemaVersion:z.literal('1.0'),deleted:z.literal(true) }),c.deleteContentInput),
  route('GET','/content/pages/:kind','content:read',c.pageDocumentSchema),
  route('PUT','/content/pages/:kind','content:write',c.pageDocumentSchema,c.pageSaveInput,2 * 1024 * 1024),
  route('POST','/content/transmissions/:id/publication','content:publish',c.publicationSchema,c.publicationInput),
  route('POST','/content/pages/:kind/publication','content:publish',c.publicationSchema,c.publicationInput),
  route('GET','/content/publications/:id','content:read',c.publicationSchema),
];
