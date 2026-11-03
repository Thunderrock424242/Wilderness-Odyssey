import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import * as s from '../src/contracts/v1/aether-playground';
import type { AetherPeer } from '../src/connected/aetherPeer';
import { AetherPlayground } from '../src/connected/aetherPlayground';
import { ConnectedStore, ServiceError, type Actor } from '../src/connected/store';
import { DASHBOARD_ISSUER } from '../src/connected/dashboardAuth';

const actor:Actor = {id:'staff',issuer:DASHBOARD_ISSUER,role:'administrator'};
const capabilities = s.peerCapabilitiesSchema.parse({schemaVersion:'1.0',serverId:'server',revision:'peer-1',features:{sandbox:true,training:true,cancellation:true,admission:true},models:[{id:'aether:8b',label:'Aether'}],presets:[{id:'small',label:'Small',maxExamples:100}],limits:{maxMessages:12,maxInputCharacters:16000,maxOutputTokens:256}});
function fixture() {
  const db = new DatabaseSync(':memory:'); let now = Date.now(), allowed = true, submits = 0, lost = false, connection = 'bound-1';
  let received:s.PeerTrainingInput | undefined;
  const remote = new Map<string,s.PeerJob>();
  const peer:AetherPeer = {
    get connectionId(){return connection;},serverId:'server',
    async status(){return {schemaVersion:'1.0',configured:true,connectionId:connection,serverId:'server',identityVerified:true,reachable:true,inferenceReady:true,paused:false,admissionRevision:0,state:'ready',message:'Ready',capabilities};},
    async capabilities(){return capabilities;},
    async sandbox(input,requestId){return {schemaVersion:'1.0',serverId:'server',requestId,modelId:input.modelId,answer:'Sandbox response',finishReason:'stop',durationMs:1};},
    async submitTraining(input){submits++;received=input;const job:s.PeerJob={schemaVersion:'1.0',serverId:'server',requestId:input.requestId,jobId:'remote-job',baseModelId:input.baseModelId,presetId:input.presetId,datasetHash:input.dataset.sha256,state:'queued',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),progress:null,candidateModelId:null};remote.set(input.requestId,job);if(lost)throw new ServiceError(503,'TIMEOUT','Uncertain');return job;},
    async trainingStatus(id){return remote.get(id)??null;},
    async cancelTraining(requestId){return {schemaVersion:'1.0',serverId:'server',requestId,cancelledBeforeAcceptance:true};},
    async admission(input){return {paused:input.paused,revision:input.expectedRevision+1};},
  };
  const store = new ConnectedStore(db,()=>now), service = new AetherPlayground(store,peer,async current=>{if(!allowed)throw new ServiceError(403,'FORBIDDEN','Revoked');return current;});
  const call = (method:string,path:string,body?:unknown,key=randomUUID()) => service.handle(actor,method,'/aether-playground'+path,body,{},key);
  return {db,store,service,call,peer,received:()=>received,submits:()=>submits,lost:()=>{lost=true;},revoke:()=>{allowed=false;},changeConnection:()=>{connection='bound-2';},advance:(ms:number)=>{now+=ms;}};
}
const input = {title:'Greeting',modelId:'aether:8b',prompt:'Hello',response:'Old response',expectedResponse:'Correct reviewed response',notes:'',rating:'needs-work' as const};

test('only reviewed revisions train; snapshots are immutable and lost acknowledgements reconcile without duplicate training', async()=>{
  const f=fixture();try{
    const created=s.exampleEnvelope.parse(await f.call('POST','/examples',input)).example;
    const training = (revision:string) => ({baseModelId:'aether:8b',presetId:'small',examples:[{id:created.id,revision}],reason:'Train reviewed greeting example',acknowledgeTraining:true});
    await assert.rejects(f.call('POST','/jobs',training(created.revision)));
    const approved=s.exampleEnvelope.parse(await f.call('PUT','/examples/'+created.id+'/review',{revision:created.revision,state:'approved'})).example;
    f.lost(); const key=randomUUID();
    const job=s.jobEnvelope.parse(await f.call('POST','/jobs',training(approved.revision),key)).job;
    assert.equal(job.state,'unknown');assert.equal(f.submits(),1);
    const frozen=f.received()!.dataset;
    assert.equal(createHash('sha256').update(frozen.json).digest('hex'),frozen.sha256);
    assert.equal(JSON.parse(frozen.json)[0].target,'Correct reviewed response');
    await f.call('POST','/jobs',training(approved.revision),key);assert.equal(f.submits(),1);
    const reconciled=s.jobEnvelope.parse(await f.call('GET','/jobs/'+job.id)).job;
    assert.equal(reconciled.state,'queued');
    const edited=s.exampleEnvelope.parse(await f.call('PUT','/examples/'+created.id,{revision:approved.revision,example:{...input,expectedResponse:'Different target'}})).example;
    assert.equal(edited.state,'review');assert.equal(f.received()!.dataset.json,frozen.json);
    await assert.rejects(f.call('POST','/jobs',training(approved.revision)));
    f.changeConnection();assert.equal(s.jobEnvelope.parse(await f.call('GET','/jobs/'+job.id)).job.state,'connection-changed');
    assert.equal(f.submits(),1);
  }finally{f.db.close();}
});

test('private example deletion/retention and permission withdrawal cannot leak cached text or dispatch training',async()=>{
  const f=fixture();try{
    const key=randomUUID(), created=s.exampleEnvelope.parse(await f.call('POST','/examples',input,key)).example;
    await f.call('DELETE','/examples/'+created.id,{revision:created.revision});
    await assert.rejects(f.call('POST','/examples',input,key));
    const saved=s.exampleEnvelope.parse(await f.call('POST','/examples',input)).example;
    f.advance(31*86400000);f.service.cleanup();
    assert.equal(s.examplesSchema.parse(await f.call('GET','/examples')).examples.length,0);
    f.revoke();await assert.rejects(f.call('POST','/sandbox',{modelId:'aether:8b',messages:[{role:'user',content:'test'}],maxOutputTokens:64,temperature:0.5}));
    assert.equal(f.submits(),0);assert.ok(saved.id);
    await assert.rejects(f.service.handle({id:'viewer',role:'viewer'},'GET','/aether-playground',undefined,{},''));
  }finally{f.db.close();}
});

test('a slow reconciliation cannot overwrite a confirmed cancellation with an older queued response',async()=>{
  const f=fixture();try{
    const created=s.exampleEnvelope.parse(await f.call('POST','/examples',input)).example;
    const approved=s.exampleEnvelope.parse(await f.call('PUT','/examples/'+created.id+'/review',{revision:created.revision,state:'approved'})).example;
    const job=s.jobEnvelope.parse(await f.call('POST','/jobs',{baseModelId:'aether:8b',presetId:'small',examples:[{id:approved.id,revision:approved.revision}],reason:'Train reviewed race scenario',acknowledgeTraining:true})).job;
    const old=await f.peer.trainingStatus(job.requestId);assert.ok(old);
    let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    f.peer.trainingStatus=async()=>{entered();await gate;return old;};
    f.peer.cancelTraining=async()=>({...old,state:'cancelled',updatedAt:new Date(Date.now()+1000).toISOString()});
    const read=f.call('GET','/jobs/'+job.id);await started;
    assert.equal(s.jobEnvelope.parse(await f.call('POST','/jobs/'+job.id+'/cancel',{revision:job.revision,reason:'Cancel the race scenario'})).job.state,'cancelled');
    release();assert.equal(s.jobEnvelope.parse(await read).job.state,'cancelled');
  }finally{f.db.close();}
});
