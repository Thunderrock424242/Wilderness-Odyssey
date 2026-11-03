import { z } from 'zod';
import type { Capability } from './admin';

const version = z.literal('1.0');
const id = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/);
export const modelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/).refine(value => !value.includes('://') && !value.includes('..'));
const revision = z.string().min(1).max(120);
const date = z.iso.datetime();
const reason = z.string().trim().min(10).max(1000);
export const messageSchema = z.object({role:z.enum(['system','user','assistant']),content:z.string().trim().min(1).max(4000)}).strict();
export const sandboxInput = z.object({modelId,messages:z.array(messageSchema).min(1).max(12),maxOutputTokens:z.number().int().min(1).max(1024),temperature:z.number().min(0).max(2)}).strict().refine(value => value.messages.reduce((sum,item) => sum + item.content.length,0) <= 16000);
export const exampleInput = z.object({title:z.string().trim().min(1).max(120),modelId,prompt:z.string().trim().min(1).max(4000),response:z.string().max(12000),expectedResponse:z.string().max(12000),notes:z.string().max(1000),rating:z.enum(['good','needs-work','unsafe']).nullable()}).strict().refine(value => !!(value.response.trim() || value.expectedResponse.trim()));
export const exampleSchema = exampleInput.safeExtend({id,revision,state:z.enum(['review','approved','rejected']),createdAt:date,updatedAt:date,reviewedAt:date.nullable()});
export const exampleSaveInput = z.object({example:exampleInput,revision}).strict();
export const reviewInput = z.object({revision,state:z.enum(['approved','rejected'])}).strict();
export const deleteInput = z.object({revision}).strict();
export const exampleEnvelope = z.object({schemaVersion:version,example:exampleSchema});
export const examplesSchema = z.object({schemaVersion:version,examples:z.array(exampleSchema).max(50),nextCursor:z.string().nullable()});
export const deletionSchema = z.object({schemaVersion:version,deleted:z.literal(true)});
export const trainingInput = z.object({baseModelId:modelId,presetId:id,examples:z.array(z.object({id,revision}).strict()).min(1).max(100),reason,acknowledgeTraining:z.literal(true)}).strict().refine(value => new Set(value.examples.map(item => item.id)).size === value.examples.length);
export const peerCapabilitiesSchema = z.object({schemaVersion:version,serverId:id,revision,
  features:z.object({sandbox:z.boolean(),training:z.boolean(),cancellation:z.boolean(),admission:z.boolean()}).strict(),
  models:z.array(z.object({id:modelId,label:z.string().min(1).max(120)}).strict()).max(50),
  presets:z.array(z.object({id,label:z.string().min(1).max(120),maxExamples:z.number().int().min(1).max(100)}).strict()).max(20),
  limits:z.object({maxMessages:z.number().int().min(1).max(12),maxInputCharacters:z.number().int().min(1).max(16000),maxOutputTokens:z.number().int().min(1).max(1024)}).strict(),
}).strict().refine(value => new Set(value.models.map(item=>item.id)).size === value.models.length && new Set(value.presets.map(item=>item.id)).size === value.presets.length);
export const statusSchema = z.object({schemaVersion:version,configured:z.boolean(),connectionId:z.string().nullable(),serverId:id,identityVerified:z.boolean(),reachable:z.boolean(),inferenceReady:z.boolean().nullable(),paused:z.boolean().nullable(),admissionRevision:z.number().int().nonnegative().nullable(),state:z.enum(['ready','setup-required','unavailable']),message:z.string().max(500),capabilities:peerCapabilitiesSchema.nullable()});
export const peerSandboxRequest = sandboxInput.safeExtend({schemaVersion:version,serverId:id,requestId:z.uuid(),actor:id,expiresAt:date});
export const sandboxOutput = z.object({schemaVersion:version,serverId:id,requestId:z.uuid(),modelId,answer:z.string().max(16000),finishReason:z.enum(['stop','length']),durationMs:z.number().nonnegative().nullable()}).strict();
export const datasetItemSchema = z.object({id,revision,prompt:z.string().min(1).max(4000),target:z.string().min(1).max(12000)}).strict();
export const datasetItemsSchema = z.array(datasetItemSchema).min(1).max(100);
export const peerTrainingRequest = z.object({schemaVersion:version,serverId:id,requestId:z.uuid(),actor:id,baseModelId:modelId,presetId:id,dataset:z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),json:z.string().max(262144).refine(value => new TextEncoder().encode(value).byteLength <= 262144)}).strict(),reason,createdAt:date,expiresAt:date,acknowledgeTraining:z.literal(true)}).strict();
export const peerJobSchema = z.object({schemaVersion:version,serverId:id,requestId:z.uuid(),jobId:id,baseModelId:modelId,presetId:id,datasetHash:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','running','cancel-requested','completed','failed','cancelled']),createdAt:date,updatedAt:date,progress:z.number().min(0).max(1).nullable(),candidateModelId:modelId.nullable()}).strict().refine(value => value.state !== 'completed' || value.candidateModelId !== null);
export const peerCancellationSchema = z.union([peerJobSchema,z.object({schemaVersion:version,serverId:id,requestId:z.uuid(),cancelledBeforeAcceptance:z.literal(true)}).strict()]);
export const jobSchema = z.object({id,requestId:z.uuid(),revision,baseModelId:modelId,presetId:id,datasetHash:z.string().regex(/^[a-f0-9]{64}$/),exampleCount:z.number().int().min(1).max(100),state:z.enum(['submitting','unknown','connection-changed','queued','running','cancel-requested','completed','failed','cancelled']),serverJobId:id.nullable(),createdAt:date,updatedAt:date,progress:z.number().min(0).max(1).nullable(),candidateModelId:modelId.nullable(),message:z.string().max(500)});
export const jobEnvelope = z.object({schemaVersion:version,job:jobSchema});
export const jobsSchema = z.object({schemaVersion:version,jobs:z.array(jobSchema).max(50)});
export const cancelInput = z.object({revision,reason}).strict();
export const admissionInput = z.object({paused:z.boolean(),revision:z.number().int().min(0).max(9999999999),reason}).strict();
export const admissionSchema = z.object({schemaVersion:version,paused:z.boolean(),revision:z.number().int().nonnegative()});
export const peerAdmissionInput = z.object({requestId:z.uuid(),expectedRevision:z.number().int().min(0).max(9999999999),expiresAt:date,paused:z.boolean(),actor:z.string().regex(/^[A-Za-z0-9._:@-]{1,128}$/)}).strict();
export const peerAdmissionSchema = z.object({paused:z.boolean(),revision:z.number().int().nonnegative(),healthy:z.boolean().optional(),replayed:z.boolean().optional()});
export type Example = z.infer<typeof exampleSchema>;
export type Job = z.infer<typeof jobSchema>;
export type PeerJob = z.infer<typeof peerJobSchema>;
export type PeerCancellation = z.infer<typeof peerCancellationSchema>;
export type PeerCapabilities = z.infer<typeof peerCapabilitiesSchema>;
export type Status = z.infer<typeof statusSchema>;
export type SandboxInput = z.infer<typeof sandboxInput>;
export type SandboxOutput = z.infer<typeof sandboxOutput>;
export type PeerTrainingInput = z.infer<typeof peerTrainingRequest>;
export type PeerAdmissionInput = z.infer<typeof peerAdmissionInput>;
export type PeerAdmission = z.infer<typeof peerAdmissionSchema>;
export type PlaygroundRoute = {method:string;path:string;pattern:RegExp;capability:Capability;input?:z.ZodType;output:z.ZodType;bodyLimit:number;timeoutMs:number};
function route(method:string,path:string,capability:Capability,output:z.ZodType,input?:z.ZodType,bodyLimit=65536,timeoutMs=15000):PlaygroundRoute {return {method,path,capability,input,output,bodyLimit,timeoutMs,pattern:new RegExp('^'+path.replaceAll(':id','[A-Za-z0-9_-]{1,96}')+'$')};}
const base = '/aether-playground';
export const playgroundRoutes = [
  route('GET',base,'playground:read',statusSchema),
  route('POST',base+'/sandbox','playground:write',sandboxOutput,sandboxInput,65536,65000),
  route('GET',base+'/examples','playground:read',examplesSchema),
  route('POST',base+'/examples','playground:write',exampleEnvelope,exampleInput),
  route('PUT',base+'/examples/:id','playground:write',exampleEnvelope,exampleSaveInput),
  route('PUT',base+'/examples/:id/review','playground:train',exampleEnvelope,reviewInput),
  route('DELETE',base+'/examples/:id','playground:write',deletionSchema,deleteInput),
  route('GET',base+'/jobs','playground:read',jobsSchema),
  route('POST',base+'/jobs','playground:train',jobEnvelope,trainingInput,65536,45000),
  route('GET',base+'/jobs/:id','playground:read',jobEnvelope),
  route('POST',base+'/jobs/:id/cancel','playground:train',jobEnvelope,cancelInput,65536,45000),
  route('POST',base+'/admission','playground:write',admissionSchema,admissionInput,65536,45000),
];
