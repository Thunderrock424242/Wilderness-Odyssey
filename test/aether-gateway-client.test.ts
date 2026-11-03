import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { AetherGatewayClient } from '../src/connected/aetherGatewayClient';
import type { AetherGatewayConfig } from '../src/connected/config';
const config: AetherGatewayConfig = {origin:'https://aether.example',serverId:'official',monitoringToken:'m'.repeat(32),administrationToken:'a'.repeat(32),accessClientId:'client',accessClientSecret:'secret',environment:'production'};
const caps = {schemaVersion:'1.0',serverId:'official',revision:'1',features:{sandbox:true,training:true,cancellation:true,admission:true},models:[{id:'aether',label:'Aether'}],presets:[{id:'small',label:'Small',maxExamples:10}],limits:{maxMessages:12,maxInputCharacters:16000,maxOutputTokens:1024}};
const health = {status:'UP',ollama:'reachable',ready:true,model:'aether',paused:false,revision:2,healthy:true};
const json = (value:unknown, status=200) => Response.json(value,{status});
const id = randomUUID();
const job = {schemaVersion:'1.0',serverId:'official',requestId:id,jobId:'job1',baseModelId:'aether',presetId:'small',datasetHash:'f'.repeat(64),state:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),progress:null,candidateModelId:null};
test('unconfigured peer has honest setup state and never contacts a server', async () => {
  const client = new AetherGatewayClient(undefined, async () => {throw new Error('must not call');});
  assert.equal((await client.status()).state,'setup-required');
  assert.equal(client.connectionId,null);
  await assert.rejects(client.capabilities(), /unavailable/i);
});
test('legacy native health remains reachable while missing handshake never authorizes writes', async () => {
  const calls:string[]=[];
  const client = new AetherGatewayClient(config, async (url) => { const path=new URL(String(url)).pathname; calls.push(path); return path==='/health' ? json(health) : path==='/v1/admin/admission' ? json({paused:false,revision:2,healthy:true}) : json({},404); });
  const status=await client.status();
  assert.equal(status.reachable,true); assert.equal(status.identityVerified,false); assert.equal(status.inferenceReady,true); assert.equal(status.state,'setup-required'); assert.equal(calls.length,3);
  await assert.rejects(client.admission({requestId:id,expectedRevision:2,expiresAt:new Date(Date.now()+60000).toISOString(),paused:true,actor:'staff'}));
  assert.equal(calls.filter(path=>path==='/v1/admin/admission').length,1);
});
test('status checks native endpoints in parallel, pins server identity and returns no peer diagnostics', async () => {
  let started=0;
  let release!:()=>void; const gate=new Promise<void>(resolve=>{release=resolve;});
  const client=new AetherGatewayClient(config,async url=>{if(++started===3) release(); await gate; const path=new URL(String(url)).pathname; return json(path==='/health'?health:path==='/v1/admin/admission'?{paused:false,revision:2,healthy:true}:caps);});
  const status=await client.status(); assert.equal(status.state,'ready'); assert.equal(status.identityVerified,true); assert.equal(started,3);
  const wrong=new AetherGatewayClient(config,async url=>json(new URL(String(url)).pathname.endsWith('capabilities')?{...caps,serverId:'other'}:health));
  assert.equal((await wrong.status()).identityVerified,false);
  assert.notEqual(client.connectionId,new AetherGatewayClient({...config,environment:'preview'}).connectionId);
  assert.equal(client.connectionId,new AetherGatewayClient({...config,monitoringToken:'different'}).connectionId);
});
test('sandbox uses administration and Access credentials, exact fixed route and validates echoed identity/model', async () => {
  let sent:unknown; let headers=new Headers(); let redirected:RequestRedirect|undefined;
  const client=new AetherGatewayClient(config,async (url,init)=>{const path=new URL(String(url)).pathname; if(path.endsWith('capabilities')) return json(caps); sent=JSON.parse(String(init?.body)); headers=new Headers(init?.headers); redirected=init?.redirect; return json({schemaVersion:'1.0',serverId:'official',requestId:id,modelId:'aether',answer:'hello',finishReason:'stop',durationMs:1});});
  assert.equal((await client.sandbox({modelId:'aether',messages:[{role:'user',content:'hello'}],maxOutputTokens:20,temperature:1},id,'staff')).answer,'hello');
  assert.equal(headers.get('authorization'),'Bearer '+config.administrationToken); assert.equal(headers.get('cf-access-client-id'),'client'); assert.equal(headers.get('cf-access-client-secret'),'secret'); assert.equal(redirected,'error');
  assert.equal((sent as {serverId:string}).serverId,'official');
  const wrong=new AetherGatewayClient(config,async url=>json(new URL(String(url)).pathname.endsWith('capabilities')?caps:{schemaVersion:'1.0',serverId:'official',requestId:id,modelId:'other',answer:'secret',finishReason:'stop',durationMs:null}));
  await assert.rejects(wrong.sandbox({modelId:'aether',messages:[{role:'user',content:'hello'}],maxOutputTokens:20,temperature:1},id,'staff'), error=>error instanceof Error && !error.message.includes('secret'));
});
test('admission preserves exact native schema and rejects expired inputs before dispatch',async()=>{
  let sent:unknown;
  const client=new AetherGatewayClient(config,async(url,init)=>{if(new URL(String(url)).pathname.endsWith('capabilities'))return json(caps);sent=JSON.parse(String(init?.body));return json({paused:true,revision:3,replayed:false});});
  const input={requestId:id,expectedRevision:2,expiresAt:new Date(Date.now()+60000).toISOString(),paused:true,actor:'discord:staff@example'};
  assert.equal((await client.admission(input)).revision,3);assert.deepEqual(sent,input);
  await assert.rejects(client.admission({...input,expiresAt:new Date(Date.now()-1).toISOString()}));
});
test('training acceptance rejects mismatched hashes and never retries an uncertain write',async()=>{
  let writes=0;
  const client=new AetherGatewayClient(config,async(url,init)=>{if(new URL(String(url)).pathname.endsWith('capabilities'))return json(caps);if(init?.method==='POST')writes++;return json({...job,datasetHash:'0'.repeat(64)});});
  const input={schemaVersion:'1.0' as const,serverId:'official',requestId:id,actor:'staff',baseModelId:'aether',presetId:'small',dataset:{sha256:'f'.repeat(64),json:'[]'},reason:'training reason',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),acknowledgeTraining:true as const};
  await assert.rejects(client.submitTraining(input));assert.equal(writes,1);
  const lost=new AetherGatewayClient(config,async(url,init)=>{if(new URL(String(url)).pathname.endsWith('capabilities'))return json(caps);if(init?.method==='POST')writes++;throw new Error('https://private.example bearer secret');});
  await assert.rejects(lost.submitTraining(input),error=>error instanceof Error&&!error.message.includes('private'));assert.equal(writes,2);
});
test('private job reads use administration scope and a missing request is unknown rather than failed',async()=>{
  let headers=new Headers();
  const client=new AetherGatewayClient(config,async(_url,init)=>{headers=new Headers(init?.headers);return json({},404);});
  assert.equal(await client.trainingStatus(id),null);assert.equal(headers.get('authorization'),'Bearer '+config.administrationToken);
  await assert.rejects(client.trainingStatus('../escape'));
});
test('oversized and malformed peer responses fail privately',async()=>{
  const client=new AetherGatewayClient(config,async()=>new Response('x'.repeat(524288)));
  await assert.rejects(client.capabilities(),error=>error instanceof Error && !error.message.includes('xxxx'));
});
test('training validates echoed base model and preset before accepting a job',async()=>{
  const input={schemaVersion:'1.0' as const,serverId:'official',requestId:id,actor:'staff',baseModelId:'aether',presetId:'small',dataset:{sha256:'f'.repeat(64),json:'[]'},reason:'training reason',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),acknowledgeTraining:true as const};
  for(const changed of [{baseModelId:'other'},{presetId:'other'}]){
    const client=new AetherGatewayClient(config,async url=>json(new URL(String(url)).pathname.endsWith('capabilities')?caps:{...job,...changed}));
    await assert.rejects(client.submitTraining(input));
  }
});
test('cancellation uses fixed pinned request identity and administration scope',async()=>{
  let received:unknown;let headers=new Headers();let path='';
  const client=new AetherGatewayClient(config,async(url,init)=>{path=new URL(String(url)).pathname;if(path.endsWith('capabilities'))return json(caps);received=JSON.parse(String(init?.body));headers=new Headers(init?.headers);return json({...job,state:'cancel-requested'});});
  const cancelled=await client.cancelTraining(id);assert.ok('state' in cancelled);assert.equal(cancelled.state,'cancel-requested');assert.deepEqual(received,{requestId:id});assert.equal(path,'/v1/admin/playground/training/jobs/by-request/'+id+'/cancel');assert.equal(headers.get('authorization'),'Bearer '+config.administrationToken);
});
test('readiness cannot be inferred from available credentials on a failed native health check',async()=>{
  const client=new AetherGatewayClient(config,async url=>new URL(String(url)).pathname.endsWith('capabilities')?json(caps):json({},503));
  const status=await client.status();assert.equal(status.inferenceReady,null);assert.equal(status.state,'setup-required');assert.equal(status.identityVerified,true);
});

test('cancellation accepts an identity-pinned durable preacceptance receipt',async()=>{
  const receipt={schemaVersion:'1.0',serverId:'official',requestId:id,cancelledBeforeAcceptance:true};
  const client=new AetherGatewayClient(config,async url=>json(new URL(String(url)).pathname.endsWith('capabilities')?caps:receipt));
  assert.deepEqual(await client.cancelTraining(id),receipt);
  const wrong=new AetherGatewayClient(config,async url=>json(new URL(String(url)).pathname.endsWith('capabilities')?caps:{...receipt,requestId:randomUUID()}));
  await assert.rejects(wrong.cancelTraining(id));
});

test('status aborts all three stalled remote probes within one shared deadline',async()=>{
  const signals:AbortSignal[]=[];
  const client=new AetherGatewayClient(config,async(_url,init)=>{if(init?.signal)signals.push(init.signal);return await new Promise<Response>(()=>{});});
  const status=await client.status();
  assert.equal(status.state,'unavailable');assert.equal(status.reachable,false);assert.equal(signals.length,3);assert.ok(signals.every(signal=>signal.aborted));
});
test('admission requires a confirmed matching paused state and native replay result',async()=>{
  const input={requestId:id,expectedRevision:2,expiresAt:new Date(Date.now()+60000).toISOString(),paused:true,actor:'staff'};
  for(const output of [{paused:false,revision:3,replayed:false},{paused:true,revision:3}]){
    const client=new AetherGatewayClient(config,async url=>json(new URL(String(url)).pathname.endsWith('capabilities')?caps:output));
    await assert.rejects(client.admission(input));
  }
});

test('training acceptance returns the pinned matching job and reads reject identity substitution',async()=>{
  const input={schemaVersion:'1.0' as const,serverId:'official',requestId:id,actor:'staff',baseModelId:'aether',presetId:'small',dataset:{sha256:'f'.repeat(64),json:'[]'},reason:'training reason',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),acknowledgeTraining:true as const};
  const client=new AetherGatewayClient(config,async url=>json(new URL(String(url)).pathname.endsWith('capabilities')?caps:job));
  assert.deepEqual(await client.submitTraining(input),job);
  assert.deepEqual(await client.trainingStatus(id),job);
  for(const changed of [{serverId:'other'},{requestId:randomUUID()}]){
    const other=new AetherGatewayClient(config,async()=>json({...job,...changed}));
    await assert.rejects(other.trainingStatus(id));
  }
});
