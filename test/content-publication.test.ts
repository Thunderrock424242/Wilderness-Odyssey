import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ConnectedStore, ServiceError, type Actor } from '../src/connected/store';
import { ContentService } from '../src/connected/content';
import { ContentPublishing, type PublicationRepository } from '../src/connected/contentPublishing';

const actor:Actor = { id:'staff',role:'administrator' };
async function fixture() {
  const db = new DatabaseSync(':memory:'),store = new ConnectedStore(db),content = new ContentService(store);
  const created = await content.handle(actor,'POST','/content/transmissions',{ content:{ slug:'alpha',title:'Alpha update',description:'An expedition update.',publishedAt:'2026-11-02',type:'news',author:'Staff',tags:['news'],featured:false,draft:true,galleryImages:[],bodyMarkdown:'A private draft.' },revision:null,sourceRevision:null },{},'create-publish-draft-001') as { transmission:{revision:string} };
  let allowed = true,submissions = 0,published = false,lostResponse = false;
  const repository:PublicationRepository = {
    async submit(job,verify,checkpoint) { await verify(); submissions++; assert.equal(job.files[0].path,'src/content/transmissions/alpha.md'); assert.ok(job.files[0].content.includes('draft: false')); if (lostResponse) { job.pullAttempted = true; checkpoint(); throw new ServiceError(503,'UNCONFIRMED','Response lost'); } job.prNumber = 12; checkpoint(); },
    async recover(job,checkpoint) { if (lostResponse) { job.prNumber = 12; checkpoint(); return true; } return false; },
    async observe() { return published ? { state:'published',message:'Deployment verified.',sourceRevision:'a'.repeat(40) } : { state:'awaiting-review',message:'Waiting for review.' }; },
  };
  const publisher = new ContentPublishing(content,repository,async value => { if (!allowed) throw new ServiceError(403,'FORBIDDEN','Permission lost'); return value; });
  content.publisher = publisher;
  return { db,content,publisher,revision:created.transmission.revision,permission:(value:boolean) => { allowed = value; },published:() => { published = true; },loseResponse:() => { lostResponse = true; },submissions:() => submissions };
}

test('publication freezes a draft and only a verified deployment becomes published', async () => {
  const f = await fixture();
  try {
    const input = { revision:f.revision,action:'publish',acknowledgePublicSource:true };
    const result = await f.publisher.request(actor,'transmissions','alpha',input,'request-publication-001');
    assert.equal(result.state,'requested'); assert.ok(result.operationId);
    assert.equal(f.submissions(),0);
    assert.deepEqual(await f.publisher.request(actor,'transmissions','alpha',input,'request-publication-001'),result);
    await f.publisher.tick();
    assert.equal((await f.publisher.status(actor,result.operationId!)).state,'awaiting-review');
    assert.equal(f.submissions(),1);
    f.published(); f.publisher.content.store.db.prepare("UPDATE cs_records SET data=json_set(data,'$.nextAt',0) WHERE kind='content_publication'").run();
    await f.publisher.tick();
    assert.equal((await f.publisher.status(actor,result.operationId!)).state,'published');
    assert.equal(f.content.transmission('alpha').sourceRevision,'a'.repeat(40));
    assert.equal(f.submissions(),1);
  } finally { f.db.close(); }
});

test('staff permission loss cancels an unsubmitted publication without exposing source', async () => {
  const f = await fixture();
  try {
    const result = await f.publisher.request(actor,'transmissions','alpha',{ revision:f.revision,action:'publish',acknowledgePublicSource:true },'request-publication-002');
    f.permission(false); await f.publisher.tick();
    assert.equal(f.submissions(),0);
    const status = await f.publisher.status(actor,result.operationId!);
    assert.equal(status.state,'cancelled'); assert.ok(!JSON.stringify(status).includes('private draft'));
  } finally { f.db.close(); }
});

test('new publications are not starved by older PRs awaiting review', async () => {
  const f = await fixture();
  try {
    const result = await f.publisher.request(actor,'transmissions','alpha',{ revision:f.revision,action:'publish',acknowledgePublicSource:true },'request-publication-fair');
    const store = f.content.store;
    const fresh = store.record<Record<string,unknown>>('content_publication',result.operationId!)!;
    store.db.prepare("DELETE FROM cs_records WHERE kind='content_publication'").run();
    for (let i = 1;i <= 3;i++) store.put('content_publication','older-' + i,actor.id,{ ...fresh,id:'older-' + i,contentId:'older-' + i,prNumber:i,nextAt:Date.now()-1000,result:{ state:'awaiting-review',message:'Waiting for review' } });
    store.put('content_publication',result.operationId!,actor.id,fresh);
    await f.publisher.tick();
    assert.equal(f.submissions(),1);
    assert.equal((await f.publisher.status(actor,result.operationId!)).state,'awaiting-review');
  } finally { f.db.close(); }
});

test('lost PR response is reconciled after revocation without another repository write', async () => {
  const f = await fixture();
  try {
    f.loseResponse();
    const result = await f.publisher.request(actor,'transmissions','alpha',{ revision:f.revision,action:'publish',acknowledgePublicSource:true },'request-publication-lost');
    await f.publisher.tick();
    f.permission(false);
    f.content.store.db.prepare("UPDATE cs_records SET data=json_set(data,'$.nextAt',0) WHERE kind='content_publication'").run();
    await f.publisher.tick();
    assert.equal(f.submissions(),1);
    assert.equal((await f.publisher.status(actor,result.operationId!)).state,'awaiting-review');
  } finally { f.db.close(); }
});
