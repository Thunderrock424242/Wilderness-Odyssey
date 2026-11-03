import { createHash, randomUUID } from 'node:crypto';
import * as s from '../contracts/v1/aether-playground';
import { ConnectedStore, ServiceError } from './store';
import { redactReportText } from '../services/connectedReportService';

export type JobRecord = {job:s.Job;connectionId:string;serverId:string;actorId:string};
type Receipt = {hash:string;entity_id:string|null;result:string|null;kind:string};
const gone = ():never => {throw new ServiceError(410,'RECORD_EXPIRED','This private record was deleted or expired.');};
export const mismatch = (expected:string,actual:string) => {if(expected!==actual)throw new ServiceError(409,'REVISION_CONFLICT','This record changed. Refresh before submitting again.');};
export const payloadHash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class AetherPlaygroundStore {
  constructor(readonly store:ConnectedStore) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS cs_aether_examples(id TEXT PRIMARY KEY,data TEXT,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_aether_jobs(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_aether_requests(actor TEXT NOT NULL,action TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,entity_id TEXT,result TEXT,kind TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(actor,action,key));`);
  }
  example(id:string):s.Example {
    const row=this.store.db.prepare('SELECT data FROM cs_aether_examples WHERE id=? AND expires_at>?').get(id,this.store.clock()) as {data:string|null}|undefined;
    if(!row?.data)return gone();
    return s.exampleSchema.parse(JSON.parse(row.data));
  }
  examples(offset:number) {
    const rows=this.store.db.prepare('SELECT data FROM cs_aether_examples WHERE data IS NOT NULL AND expires_at>? ORDER BY rowid DESC LIMIT 11 OFFSET ?').all(this.store.clock(),offset) as {data:string}[];
    return {schemaVersion:'1.0',examples:rows.slice(0,10).map(row=>s.exampleSchema.parse(JSON.parse(row.data))),nextCursor:rows.length>10?String(offset+10):null};
  }
  putExample(value:s.Example) {
    const size=this.store.db.prepare('SELECT count(*) AS n,coalesce(sum(length(CAST(data AS BLOB))),0) AS bytes FROM cs_aether_examples WHERE data IS NOT NULL AND expires_at>?').get(this.store.clock()) as {n:number;bytes:number};
    if(size.n>=500&&!this.store.db.prepare('SELECT 1 FROM cs_aether_examples WHERE id=?').get(value.id)||size.bytes+Buffer.byteLength(JSON.stringify(value))>8*1024*1024)throw new ServiceError(429,'EXAMPLE_QUOTA','Review or delete old examples before saving more.');
    this.store.db.prepare('INSERT INTO cs_aether_examples VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at').run(value.id,JSON.stringify(value),this.store.clock()+30*86400000);
  }
  cleanInput(value:unknown) {
    const input=s.exampleInput.parse(value);
    return s.exampleInput.parse({...input,title:redactReportText(input.title),prompt:redactReportText(input.prompt),response:redactReportText(input.response),expectedResponse:redactReportText(input.expectedResponse),notes:redactReportText(input.notes)});
  }
  createExample(input:unknown):s.Example {
    const example=s.exampleSchema.parse({...this.cleanInput(input),id:randomUUID(),revision:randomUUID(),state:'review',createdAt:this.store.now(),updatedAt:this.store.now(),reviewedAt:null});
    this.putExample(example);return example;
  }
  deleteExample(id:string,revision:string) {
    mismatch(revision,this.example(id).revision);
    this.store.db.prepare('UPDATE cs_aether_examples SET data=NULL,expires_at=? WHERE id=?').run(this.store.clock(),id);
    this.store.db.prepare("UPDATE cs_aether_requests SET result=NULL,kind='deleted' WHERE entity_id=?").run(id);
  }
  receipt(actor:string,action:string,key:string,input:unknown):Receipt|undefined {
    if(!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new ServiceError(400,'IDEMPOTENCY_REQUIRED','A request identifier is required.');
    const row=this.store.db.prepare('SELECT hash,entity_id,result,kind FROM cs_aether_requests WHERE actor=? AND action=? AND key=?').get(actor,action,key) as Receipt|undefined;
    if(row)mismatch(payloadHash(input),row.hash);
    return row;
  }
  reserve(actor:string,action:string,key:string,input:unknown,kind:string,entityId:string|null=null) {
    const count=this.store.db.prepare('SELECT count(*) AS n,coalesce(sum(length(CAST(result AS BLOB))),0) AS bytes FROM cs_aether_requests').get() as {n:number;bytes:number};
    if(count.n>=10000||count.bytes>=16*1024*1024)throw new ServiceError(429,'REQUEST_QUOTA','Wait before submitting more requests.');
    this.store.db.prepare('INSERT INTO cs_aether_requests VALUES (?,?,?,?,?,NULL,?,?)').run(actor,action,key,payloadHash(input),entityId,kind,this.store.clock());
  }
  local<T>(actor:string,action:string,key:string,input:unknown,entityId:string|null,work:()=>T):T {
    return this.store.transaction(()=>{
      const old=this.receipt(actor,action,key,input);
      if(old){if(old.kind==='deleted')return gone();if(old.entity_id)this.example(old.entity_id);if(!old.result)return gone();return JSON.parse(old.result) as T;}
      this.reserve(actor,action,key,input,'example',entityId);
      const result=work();
      const data=result as {example?:s.Example};
      this.store.db.prepare('UPDATE cs_aether_requests SET result=?,entity_id=? WHERE actor=? AND action=? AND key=?').run(JSON.stringify(result),entityId??data.example?.id??null,actor,action,key);
      this.store.audit(actor,'playground.example.change',entityId??data.example?.id??'example','succeeded');return result;
    });
  }
  claimEphemeral(actor:string,action:string,key:string,input:unknown) {
    this.store.transaction(()=>{
      if(this.receipt(actor,action,key,input))throw new ServiceError(409,'REQUEST_USED','This request was already sent. Refresh status before starting another.');
      const count=this.store.db.prepare('SELECT count(*) AS n FROM cs_aether_requests WHERE actor=? AND action=? AND created_at>?').get(actor,action,this.store.clock()-60000) as {n:number};
      if(count.n>=6)throw new ServiceError(429,'RATE_LIMITED','Wait before starting another expensive request.');
      this.reserve(actor,action,key,input,'ephemeral');
    });
  }
  job(id:string):JobRecord {
    const row=this.store.db.prepare('SELECT data FROM cs_aether_jobs WHERE id=?').get(id) as {data:string}|undefined;
    if(!row)throw new ServiceError(404,'JOB_NOT_FOUND','Training request not found.');
    const record=JSON.parse(row.data) as JobRecord;
    record.job=s.jobSchema.parse(record.job);return record;
  }
  jobs():JobRecord[] {return (this.store.db.prepare("SELECT id FROM cs_aether_jobs ORDER BY CASE WHEN json_extract(data,'$.job.state') IN ('completed','failed','cancelled') THEN 1 ELSE 0 END,rowid DESC LIMIT 50").all() as {id:string}[]).map(row=>this.job(row.id));}
  saveJob(record:JobRecord) {this.store.db.prepare('INSERT INTO cs_aether_jobs VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.job.id,JSON.stringify(record),this.store.clock());}
  beginTraining(actor:string,input:ReturnType<typeof s.trainingInput.parse>,key:string,connectionId:string,serverId:string,capabilities:s.PeerCapabilities) {
    return this.store.transaction(()=>{
      const old=this.receipt(actor,'training',key,input);
      if(old?.entity_id)return {record:this.job(old.entity_id),payload:null};
      if(!capabilities.features.training||!capabilities.models.some(item=>item.id===input.baseModelId))throw new ServiceError(422,'TRAINING_UNAVAILABLE','This model is not approved for training.');
      const preset=capabilities.presets.find(item=>item.id===input.presetId);
      if(!preset||input.examples.length>preset.maxExamples)throw new ServiceError(422,'PRESET_UNAVAILABLE','Choose an approved training preset and example count.');
      const examples=input.examples.map(reference=>{const example=this.example(reference.id);mismatch(reference.revision,example.revision);if(example.state!=='approved')throw new ServiceError(422,'REVIEW_REQUIRED','Approve every example before training.');return {id:example.id,revision:example.revision,prompt:example.prompt,target:example.expectedResponse.trim()||example.response};}).sort((a,b)=>a.id.localeCompare(b.id));
      const json=JSON.stringify(s.datasetItemsSchema.parse(examples)),hash=createHash('sha256').update(json).digest('hex');
      if(Buffer.byteLength(json)>262144)throw new ServiceError(413,'DATASET_TOO_LARGE','Use a smaller reviewed dataset (up to 256 KiB).');
      const active=this.store.db.prepare("SELECT count(*) AS n FROM cs_aether_jobs WHERE json_extract(data,'$.job.state') NOT IN ('completed','failed','cancelled')").get() as {n:number};
      const total=this.store.db.prepare('SELECT count(*) AS n FROM cs_aether_jobs').get() as {n:number};
      if(active.n>=5||total.n>=500)throw new ServiceError(429,'JOB_QUOTA','Reconcile or cancel earlier jobs before starting more.');
      const duplicate=this.store.db.prepare("SELECT 1 FROM cs_aether_jobs WHERE json_extract(data,'$.job.datasetHash')=? AND json_extract(data,'$.job.state') NOT IN ('completed','failed','cancelled')").get(hash);
      if(duplicate)throw new ServiceError(409,'DATASET_BUSY','This snapshot already has an unresolved training request.');
      const job=s.jobSchema.parse({id:randomUUID(),requestId:randomUUID(),revision:randomUUID(),baseModelId:input.baseModelId,presetId:input.presetId,datasetHash:hash,exampleCount:examples.length,state:'submitting',serverJobId:null,createdAt:this.store.now(),updatedAt:this.store.now(),progress:null,candidateModelId:null,message:'Submitting the reviewed snapshot.'});
      const record:JobRecord={job,connectionId,serverId,actorId:actor};
      this.reserve(actor,'training',key,input,'job',job.id);this.saveJob(record);
      const payload=s.peerTrainingRequest.parse({schemaVersion:'1.0',serverId,requestId:job.requestId,actor:'staff-'+createHash('sha256').update(actor).digest('hex').slice(0,40),baseModelId:input.baseModelId,presetId:input.presetId,dataset:{sha256:hash,json},reason:input.reason,createdAt:this.store.now(),expiresAt:new Date(this.store.clock()+300000).toISOString(),acknowledgeTraining:true});
      if(Buffer.byteLength(JSON.stringify(payload))>524287)throw new ServiceError(413,'DATASET_TOO_LARGE','Use a smaller dataset; its escaped request must fit the peer transport limit.');
      this.store.audit(actor,'playground.training.request',job.id,'requested');return {record,payload};
    });
  }
  cleanup() {
    this.store.transaction(()=>{
      this.store.db.prepare("UPDATE cs_aether_requests SET result=NULL,kind='deleted' WHERE kind='example' AND entity_id IN (SELECT id FROM cs_aether_examples WHERE data IS NULL OR expires_at<=?)").run(this.store.clock());
      this.store.db.prepare('UPDATE cs_aether_examples SET data=NULL WHERE expires_at<=?').run(this.store.clock());
      this.store.db.prepare("DELETE FROM cs_aether_requests WHERE kind!='job' AND created_at<?").run(this.store.clock()-86400000);
      this.store.db.prepare("DELETE FROM cs_aether_jobs WHERE json_extract(data,'$.job.state') IN ('completed','failed','cancelled') AND json_extract(data,'$.job.updatedAt')<?").run(new Date(this.store.clock()-30*86400000).toISOString());
      this.store.db.prepare("DELETE FROM cs_aether_requests WHERE kind='job' AND NOT EXISTS(SELECT 1 FROM cs_aether_jobs WHERE id=entity_id)").run();
      this.store.db.prepare('DELETE FROM cs_aether_examples WHERE data IS NULL AND expires_at<?').run(this.store.clock()-86400000);
    });
  }
}
