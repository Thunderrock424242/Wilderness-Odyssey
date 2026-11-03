import { createHash } from 'node:crypto';
import { z } from 'zod';
import { peerCapabilitiesSchema, peerSandboxRequest, sandboxOutput, peerTrainingRequest, peerJobSchema, peerCancellationSchema, peerAdmissionInput, peerAdmissionSchema, type PeerCapabilities, type Status, type SandboxInput, type SandboxOutput, type PeerTrainingInput, type PeerJob, type PeerCancellation, type PeerAdmissionInput, type PeerAdmission } from '../contracts/v1/aether-playground';
import type { AetherGatewayConfig } from './config';
import type { AetherPeer } from './aetherPeer';
import { ServiceError } from './store';

const healthSchema = z.object({ status:z.literal('UP'), ollama:z.string().max(1000), ready:z.boolean(), model:z.string().max(120), paused:z.boolean(), revision:z.number().int().nonnegative(), healthy:z.boolean() });
const admissionStatusSchema = z.object({ paused:z.boolean(), revision:z.number().int().nonnegative(), healthy:z.boolean() });
const requestIdSchema = z.uuid();
const prefix = '/v1/admin/playground';
const responseLimit = 524287;
class MissingPeerResource extends Error {}
const unavailable = () => new ServiceError(503, 'AETHER_UNAVAILABLE', 'Aether service is unavailable. Check its connection and approved capabilities.');
function validExpiry(expiresAt:string): boolean { const remaining=Date.parse(expiresAt)-Date.now(); return remaining>0 && remaining<=300000; }

/** Fixed authenticated peer protocol. No arbitrary URLs, redirects, retries or upstream diagnostics. */
export class AetherGatewayClient implements AetherPeer {
  readonly connectionId: string | null;
  readonly serverId: string;
  private cachedCapabilities?: {at:number;value:PeerCapabilities};
  constructor(private readonly config?: AetherGatewayConfig, private readonly fetcher: typeof fetch = fetch) {
    this.serverId=config?.serverId ?? 'unconfigured';
    this.connectionId=config ? createHash('sha256').update(JSON.stringify([new URL(config.origin).origin,config.serverId,config.environment])).digest('hex') : null;
  }
  async status(): Promise<Status> {
    const base:Status={schemaVersion:'1.0',configured:!!this.config,connectionId:this.connectionId,serverId:this.serverId,identityVerified:false,reachable:false,inferenceReady:null,paused:null,admissionRevision:null,state:'setup-required',message:'Configure the approved Aether connection to enable this playground.',capabilities:null};
    if(!this.config)return base;
    const [health,admission,capabilities]=await Promise.allSettled([
      this.request('/health').then(value=>healthSchema.parse(value)),
      this.request('/v1/admin/admission').then(value=>admissionStatusSchema.parse(value)),
      this.capabilities(),
    ]);
    const native=health.status==='fulfilled'?health.value:null;
    const control=admission.status==='fulfilled'?admission.value:null;
    const supported=capabilities.status==='fulfilled'?capabilities.value:null;
    const reachable=!!native || !!control || !!supported;
    const identityVerified=!!supported;
    const ready=identityVerified && !!native && !!control && !!this.config.administrationToken;
    return {...base,reachable,identityVerified,inferenceReady:native ? native.ready && native.healthy && !native.paused : null,paused:control?.paused ?? native?.paused ?? null,admissionRevision:control?.revision ?? native?.revision ?? null,capabilities:supported,state:ready?'ready':reachable?'setup-required':'unavailable',message:ready?'Aether connection and administration handshake are available.':reachable?'Aether is reachable; verify server identity, supported playground endpoints and administration setup.':'Aether could not be reached or its responses could not be verified.'};
  }
  async capabilities(): Promise<PeerCapabilities> {
    try {
      const data=peerCapabilitiesSchema.parse(await this.request(prefix+'/capabilities'));
      if(data.serverId!==this.serverId)throw unavailable();
      this.cachedCapabilities={at:Date.now(),value:data};
      return data;
    } catch {this.cachedCapabilities=undefined;throw unavailable();}
  }
  private async authorize(feature:keyof PeerCapabilities['features']): Promise<PeerCapabilities> {
    if(!this.config?.administrationToken)throw unavailable();
    const capabilities=this.cachedCapabilities && Date.now()-this.cachedCapabilities.at<5000 ? this.cachedCapabilities.value : await this.capabilities();
    if(!capabilities.features[feature])throw unavailable();
    return capabilities;
  }
  async sandbox(input:SandboxInput, requestId:string, actor:string):Promise<SandboxOutput> {
    try {
      const body=peerSandboxRequest.parse({...input,schemaVersion:'1.0',serverId:this.serverId,requestId,actor,expiresAt:new Date(Date.now()+60000).toISOString()});
      const capabilities=await this.authorize('sandbox');
      if(!capabilities.models.some(model=>model.id===body.modelId) || body.messages.length>capabilities.limits.maxMessages || body.messages.reduce((sum,message)=>sum+message.content.length,0)>capabilities.limits.maxInputCharacters || body.maxOutputTokens>capabilities.limits.maxOutputTokens)throw unavailable();
      const output=sandboxOutput.parse(await this.request(prefix+'/sandbox',body,25000));
      if(output.serverId!==this.serverId || output.requestId!==requestId || output.modelId!==input.modelId)throw unavailable();
      return output;
    } catch {throw unavailable();}
  }
  async submitTraining(input:PeerTrainingInput):Promise<PeerJob> {
    try {
      const body=peerTrainingRequest.parse(input);
      if(body.serverId!==this.serverId || !validExpiry(body.expiresAt))throw unavailable();
      const capabilities=await this.authorize('training');
      if(!capabilities.models.some(model=>model.id===body.baseModelId) || !capabilities.presets.some(preset=>preset.id===body.presetId))throw unavailable();
      const output=this.job(await this.request(prefix+'/training/jobs',body),body.requestId);
      if(output.datasetHash!==body.dataset.sha256 || output.baseModelId!==body.baseModelId || output.presetId!==body.presetId)throw unavailable();
      return output;
    } catch {throw unavailable();}
  }
  async trainingStatus(requestId:string):Promise<PeerJob|null> {
    try { requestIdSchema.parse(requestId); return this.job(await this.request(prefix+'/training/jobs/by-request/'+requestId,undefined,8000,'administration'),requestId); }
    catch(error){if(error instanceof MissingPeerResource)return null;throw unavailable();}
  }
  async cancelTraining(requestId:string):Promise<PeerCancellation> {
    try {
      requestIdSchema.parse(requestId);
      await this.authorize('cancellation');
      const result=peerCancellationSchema.parse(await this.request(prefix+'/training/jobs/by-request/'+requestId+'/cancel',{requestId}));
      if(result.serverId!==this.serverId || result.requestId!==requestId)throw unavailable();
      return result;
    }
    catch {throw unavailable();}
  }
  async admission(input:PeerAdmissionInput):Promise<PeerAdmission> {
    try {
      const body=peerAdmissionInput.parse(input);
      if(!validExpiry(body.expiresAt))throw unavailable();
      await this.authorize('admission');
      const result=peerAdmissionSchema.parse(await this.request('/v1/admin/admission',body));
      if(result.paused!==body.paused || typeof result.replayed!=='boolean')throw unavailable();
      return result;
    }
    catch {throw unavailable();}
  }
  private job(value:unknown,requestId:string):PeerJob {
    const job=peerJobSchema.parse(value);
    if(job.serverId!==this.serverId || job.requestId!==requestId)throw unavailable();
    return job;
  }
  private async request(path:string,body?:unknown,timeoutMs=8000,scope:'monitoring'|'administration'=body?'administration':'monitoring'):Promise<unknown> {
    if(!this.config || (scope==='administration' && !this.config.administrationToken))throw unavailable();
    const allowed=body ? path==='/v1/admin/admission' || path===prefix+'/sandbox' || path===prefix+'/training/jobs' || /^\/v1\/admin\/playground\/training\/jobs\/by-request\/[a-f0-9-]{36}\/cancel$/i.test(path) : path==='/health' || path==='/v1/admin/admission' || path===prefix+'/capabilities' || /^\/v1\/admin\/playground\/training\/jobs\/by-request\/[a-f0-9-]{36}$/i.test(path);
    if(!allowed)throw unavailable();
    const encoded=body ? JSON.stringify(body) : undefined;
    if(encoded && Buffer.byteLength(encoded)>responseLimit)throw unavailable();
    const config=this.config;
    const controller=new AbortController();
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(unavailable());},timeoutMs);});
    try {
      return await Promise.race([deadline,(async()=>{
        const response=await this.fetcher(new URL(path,config.origin),{method:body?'POST':'GET',redirect:'error',cache:'no-store',signal:controller.signal,headers:{authorization:'Bearer '+(scope==='administration'?config.administrationToken:config.monitoringToken),accept:'application/json',...(body?{'content-type':'application/json'}:{}),...(config.accessClientId&&config.accessClientSecret?{'CF-Access-Client-Id':config.accessClientId,'CF-Access-Client-Secret':config.accessClientSecret}:{})},...(encoded?{body:encoded}:{})});
        if(!response.ok){await response.body?.cancel();if(response.status===404)throw new MissingPeerResource();throw unavailable();}
        if(!response.body)throw unavailable();
        const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
        try {while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>responseLimit){await reader.cancel();throw unavailable();}parts.push(chunk.value);}}finally{reader.releaseLock();}
        return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
      })()]);
    } catch(error){if(error instanceof MissingPeerResource)throw error;throw unavailable();}
    finally{if(timeout)clearTimeout(timeout);}
  }
}
