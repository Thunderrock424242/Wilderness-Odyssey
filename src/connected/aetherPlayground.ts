import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as s from '../contracts/v1/aether-playground';
import { ConnectedStore, ServiceError, authorize, type Actor } from './store';
import { DASHBOARD_ISSUER } from './dashboardAuth';
import type { StaffRecheck } from './admin';
import type { AetherPeer } from './aetherPeer';
import { AetherPlaygroundStore, mismatch, type JobRecord } from './aetherPlaygroundStore';

const terminal = (state:s.Job['state']) => ['completed','failed','cancelled'].includes(state);
const labels:Record<string,string>={queued:'Training is queued on the server.',running:'The server is training a candidate model.','cancel-requested':'The server recorded a cancellation request.',completed:'Candidate training completed. The production model has not been changed.',failed:'The server reported that training failed.',cancelled:'The server confirmed cancellation.'};
export class AetherPlayground {
  readonly data:AetherPlaygroundStore;
  constructor(readonly store:ConnectedStore,readonly peer:AetherPeer,readonly recheck:StaffRecheck) {this.data=new AetherPlaygroundStore(store);}
  private async current(actor:Actor,capability:s.PlaygroundRoute['capability'],fresh=false) {
    if(actor.issuer!==DASHBOARD_ISSUER||actor.role!=='administrator')throw new ServiceError(403,'PLAYGROUND_DENIED','Use an enrolled Discord administrator account.');
    authorize(actor,capability);const current=await this.recheck(actor,capability,fresh);authorize(current,capability);return current;
  }
  async handle(actor:Actor,method:string,path:string,body:unknown,query:unknown,key:string):Promise<unknown> {
    const route=s.playgroundRoutes.find(item=>item.method===method&&item.pattern.test(path));
    if(!route)throw new ServiceError(404,'NOT_FOUND','Playground operation not found.');
    actor=await this.current(actor,route.capability);
    const parsed=(path.endsWith('/examples')&&method==='GET'?z.object({cursor:z.string().regex(/^\d{1,7}$/).optional()}).strict():z.object({}).strict()).parse(query) as {cursor?:string};
    const input:unknown=route.input?.parse(body),parts=path.split('/').filter(Boolean),id=parts[2];
    let result:unknown;
    if(parts.length===1) {result=await this.peer.status();await this.current(actor,route.capability);}
    else if(parts[1]==='examples') {
      if(method==='GET')result=this.data.examples(Number(parsed.cursor??0));
      else result=this.data.local(actor.id,method+path,key,input,id??null,()=>{
        if(method==='DELETE'){this.data.deleteExample(id!,s.deleteInput.parse(input).revision);return {schemaVersion:'1.0',deleted:true};}
        if(method==='POST')return {schemaVersion:'1.0',example:this.data.createExample(input)};
        const old=this.data.example(id!);
        if(parts[3]==='review') {const change=s.reviewInput.parse(input);mismatch(change.revision,old.revision);const example=s.exampleSchema.parse({...old,state:change.state,revision:randomUUID(),updatedAt:this.store.now(),reviewedAt:this.store.now()});this.data.putExample(example);return {schemaVersion:'1.0',example};}
        const change=s.exampleSaveInput.parse(input);mismatch(change.revision,old.revision);
        const example=s.exampleSchema.parse({...old,...this.data.cleanInput(change.example),revision:randomUUID(),state:'review',updatedAt:this.store.now(),reviewedAt:null});this.data.putExample(example);return {schemaVersion:'1.0',example};
      });
    } else if(parts[1]==='sandbox') {
      const sandbox=s.sandboxInput.parse(input),caps=await this.peer.capabilities();
      if(!caps.features.sandbox||!caps.models.some(model=>model.id===sandbox.modelId)||sandbox.maxOutputTokens>caps.limits.maxOutputTokens||sandbox.messages.length>caps.limits.maxMessages||sandbox.messages.reduce((n,item)=>n+item.content.length,0)>caps.limits.maxInputCharacters)throw new ServiceError(422,'SANDBOX_UNAVAILABLE','Choose an approved model and stay within the reported sandbox limits.');
      await this.current(actor,route.capability,true);
      this.data.claimEphemeral(actor.id,'sandbox',key,input);
      const requestId=randomUUID();
      result=await this.peer.sandbox(sandbox,requestId,this.actorLabel(actor));
      await this.current(actor,route.capability,true);
      const answer=s.sandboxOutput.parse(result);
      if(answer.serverId!==this.peer.serverId||answer.requestId!==requestId||answer.modelId!==sandbox.modelId)throw new ServiceError(502,'INVALID_PEER_RESPONSE','The sandbox response could not be verified.');
      this.store.audit(actor.id,'playground.sandbox',requestId,'succeeded');
    } else if(parts[1]==='admission') {
      const change=s.admissionInput.parse(input),caps=await this.peer.capabilities();
      if(!caps.features.admission)throw new ServiceError(503,'ADMISSION_UNAVAILABLE','The Aether server has not enabled admission controls.');
      await this.current(actor,route.capability,true);this.data.claimEphemeral(actor.id,'admission',key,input);
      const admission=await this.peer.admission({requestId:randomUUID(),expectedRevision:change.revision,expiresAt:new Date(this.store.clock()+120000).toISOString(),paused:change.paused,actor:this.actorLabel(actor)});
      await this.current(actor,route.capability,true);
      result={schemaVersion:'1.0',paused:admission.paused,revision:admission.revision};this.store.audit(actor.id,'playground.admission','aether','succeeded');
    } else if(parts[1]==='jobs') {
      if(method==='GET'&&!id)result={schemaVersion:'1.0',jobs:this.data.jobs().map(record=>this.view(record))};
      else if(method==='POST'&&!id) result=await this.submit(actor,s.trainingInput.parse(input),key);
      else if(method==='GET')result={schemaVersion:'1.0',job:await this.reconcile(actor,id!)};
      else result={schemaVersion:'1.0',job:await this.cancel(actor,id!,s.cancelInput.parse(input),key)};
    }
    return route.output.parse(result);
  }
  private actorLabel(actor:Actor){return 'staff-'+createHash('sha256').update(actor.id).digest('hex').slice(0,40);}
  private view(record:JobRecord):s.Job {
    if(!this.peer.connectionId||record.connectionId!==this.peer.connectionId||record.serverId!==this.peer.serverId)return {...record.job,state:'connection-changed',message:'Restore the original Aether connection to reconcile or cancel this request.'};
    return record.job;
  }
  private requireBinding(record:JobRecord) {
    if(this.view(record).state==='connection-changed')throw new ServiceError(409,'CONNECTION_CHANGED','This request belongs to the original Aether connection. Restore it before retrying.');
  }
  private accept(record:JobRecord,remote:s.PeerJob):s.Job {
    record=this.data.job(record.job.id);
    if(remote.serverId!==record.serverId||remote.requestId!==record.job.requestId||remote.datasetHash!==record.job.datasetHash||remote.baseModelId!==record.job.baseModelId||remote.presetId!==record.job.presetId)throw new ServiceError(502,'INVALID_JOB_SCOPE','The training result did not match this request.');
    if(record.job.serverJobId&&record.job.serverJobId!==remote.jobId)throw new ServiceError(502,'INVALID_JOB_SCOPE','The server changed the identity of this training request.');
    if(terminal(record.job.state)||(record.job.state==='cancel-requested'&&['queued','running'].includes(remote.state))||(record.job.state==='running'&&remote.state==='queued'))return this.view(record);
    const progress=record.job.state===remote.state&&record.job.progress!==null&&remote.progress!==null?Math.max(record.job.progress,remote.progress):remote.progress;
    const next=s.jobSchema.parse({...record.job,state:remote.state,serverJobId:remote.jobId,progress,candidateModelId:remote.candidateModelId,message:labels[remote.state]});
    if(JSON.stringify(next)!==JSON.stringify(record.job)){next.revision=randomUUID();next.updatedAt=this.store.now();}
    record.job=next;this.data.saveJob(record);return this.view(record);
  }
  private async submit(actor:Actor,input:ReturnType<typeof s.trainingInput.parse>,key:string) {
    const previous=this.data.receipt(actor.id,'training',key,input);
    if(previous?.entity_id)return {schemaVersion:'1.0',job:this.view(this.data.job(previous.entity_id))};
    const binding=this.peer.connectionId;
    if(!binding)throw new ServiceError(503,'AETHER_NOT_CONFIGURED','Configure the protected Aether server before starting training.');
    const caps=await this.peer.capabilities();await this.current(actor,'playground:train',true);
    if(binding!==this.peer.connectionId)throw new ServiceError(409,'CONNECTION_CHANGED','The Aether connection changed. Refresh before submitting.');
    const {record,payload}=this.data.beginTraining(actor.id,input,key,binding,this.peer.serverId,caps);
    if(!payload)return {schemaVersion:'1.0',job:this.view(record)};
    try {const remote=await this.peer.submitTraining(payload);this.requireBinding(record);this.accept(this.data.job(record.job.id),remote);}
    catch(error) {
      const current=this.data.job(record.job.id);
      if(current.job.state==='submitting'){current.job={...current.job,revision:randomUUID(),state:'unknown',updatedAt:this.store.now(),message:'Acceptance is unconfirmed. Refresh this job to reconcile the original request; do not start a duplicate.'};this.data.saveJob(current);}
      // Even rejected/malformed replies do not prove that a remote training job was not accepted.
      this.store.audit(actor.id,'playground.training.submit',record.job.id,error instanceof ServiceError?'unconfirmed':'unavailable');
    }
    await this.current(actor,'playground:train',true);
    return {schemaVersion:'1.0',job:this.view(this.data.job(record.job.id))};
  }
  private async reconcile(actor:Actor,id:string):Promise<s.Job> {
    const record=this.data.job(id);
    if(this.view(record).state==='connection-changed'||terminal(record.job.state))return this.view(record);
    const remote=await this.peer.trainingStatus(record.job.requestId);
    await this.current(actor,'playground:read');
    const current=this.data.job(id);this.requireBinding(current);
    if(terminal(current.job.state))return this.view(current);
    if(!remote) {if(current.job.state!=='unknown'){current.job={...current.job,state:'unknown',revision:randomUUID(),updatedAt:this.store.now(),message:'The server has not confirmed this request. The original request ID is retained; no duplicate was submitted.'};this.data.saveJob(current);}return current.job;}
    return this.accept(current,remote);
  }
  private async cancel(actor:Actor,id:string,input:ReturnType<typeof s.cancelInput.parse>,key:string):Promise<s.Job> {
    const record=this.data.job(id);this.requireBinding(record);mismatch(input.revision,record.job.revision);
    if(terminal(record.job.state))throw new ServiceError(409,'JOB_FINISHED','This training job is already finished.');
    const caps=await this.peer.capabilities();if(!caps.features.cancellation)throw new ServiceError(503,'CANCELLATION_UNAVAILABLE','The server has not enabled durable cancellation.');
    await this.current(actor,'playground:train',true);this.requireBinding(record);
    mismatch(input.revision,this.data.job(id).job.revision);
    this.data.claimEphemeral(actor.id,'cancel:'+id,key,input);
    const remote=await this.peer.cancelTraining(record.job.requestId);
    await this.current(actor,'playground:train',true);
    const current=this.data.job(id);this.requireBinding(current);if(terminal(current.job.state))return this.view(current);
    if('cancelledBeforeAcceptance' in remote){if(remote.serverId!==current.serverId||remote.requestId!==current.job.requestId||current.job.serverJobId!==null)throw new ServiceError(502,'INVALID_JOB_SCOPE','Cancellation could not be verified.');current.job={...current.job,state:'cancelled',revision:randomUUID(),updatedAt:this.store.now(),message:'The server durably cancelled this request before acceptance.'};this.data.saveJob(current);return current.job;}
    return this.accept(current,remote);
  }
  cleanup(){this.data.cleanup();}
}
