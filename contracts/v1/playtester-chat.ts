import { z } from 'zod';
import { discordIdSchema } from './auth';

const campaign = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const cursor = z.string().regex(/^\d{1,16}$/);
export const chatAccessInput = z.object({ userId:discordIdSchema,approved:z.boolean() }).strict();
export const chatReplyInput = z.object({ body:z.string().trim().min(1).max(1800) }).strict();
export const chatBroadcastInput = z.object({ campaignId:campaign,body:z.string().trim().min(1).max(1600) }).strict();
export const chatFileSchema = z.object({ id:z.uuid(),name:z.string().max(160),size:z.number().int().min(1).max(5*1024*1024),kind:z.enum(['text','spark']) });
export const chatMessageSchema = z.object({ id:cursor,campaignId:campaign,userId:discordIdSchema,authorId:discordIdSchema.nullable(),direction:z.enum(['tester','staff','update']),body:z.string().max(4000),createdAt:z.iso.datetime(),status:z.enum(['received','queued','sending','sent','failed','unknown','cancelled']),attachments:z.array(chatFileSchema).max(3) });
export const chatHomeSchema = z.object({ schemaVersion:z.literal('1.0'),owner:z.boolean(),admins:z.array(z.object({ userId:discordIdSchema,approvedAt:z.iso.datetime() })).max(100),campaigns:z.array(z.object({id:campaign,title:z.string().max(120)})).max(100),threads:z.array(z.object({campaignId:campaign,userId:discordIdSchema,lastMessageAt:z.iso.datetime()})).max(50),nextCursor:cursor.nullable() });
export const chatThreadSchema = z.object({ schemaVersion:z.literal('1.0'),messages:z.array(chatMessageSchema).max(50),nextCursor:cursor.nullable() });
export const chatReplySchema = z.object({schemaVersion:z.literal('1.0'),message:chatMessageSchema});
export const chatBroadcastSchema = z.object({schemaVersion:z.literal('1.0'),broadcastId:z.uuid(),recipients:z.number().int().min(0).max(1000)});
export const chatDeliverySchema = z.object({schemaVersion:z.literal('1.0'),broadcastId:z.uuid(),counts:z.object({queued:z.number().int().nonnegative(),sending:z.number().int().nonnegative(),sent:z.number().int().nonnegative(),failed:z.number().int().nonnegative(),unknown:z.number().int().nonnegative(),cancelled:z.number().int().nonnegative()})});
export const chatSavedSchema = z.object({schemaVersion:z.literal('1.0'),saved:z.literal(true)});
const route = (method:string,path:string,output:z.ZodType,input?:z.ZodType,query?:z.ZodType) => ({method,pattern:new RegExp('^/playtester-chat' + path + '$'),output,input,query,bodyLimit:8192});
const thread = '/threads/[A-Za-z0-9_-]{1,100}/\\d{17,22}';
export const chatRoutes = [
  route('GET','',chatHomeSchema,undefined,z.object({cursor:cursor.optional()}).strict()),
  route('GET',thread,chatThreadSchema,undefined,z.object({before:cursor.optional()}).strict()),
  route('POST',thread + '/reply',chatReplySchema,chatReplyInput),
  route('POST','/access',chatSavedSchema,chatAccessInput),
  route('POST','/broadcasts',chatBroadcastSchema,chatBroadcastInput),
  route('GET','/broadcasts/[a-f0-9-]{36}',chatDeliverySchema),
];
