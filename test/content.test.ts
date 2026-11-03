import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ContentService } from '../src/connected/content';
import { ConnectedStore, type Actor } from '../src/connected/store';

const actor:Actor = { id:'staff',role:'administrator' };
export const transmission = { slug:'alpha',title:'Alpha update',description:'An expedition update.',publishedAt:'2026-11-02',type:'news',author:'Staff',tags:['news'],featured:false,draft:true,galleryImages:[],bodyMarkdown:'## Alpha\n\nA new expedition.' };
const snapshot = () => ({ sourceRevision:'a'.repeat(40),transmissions:[transmission],roadmap:[],gallery:[],assets:['/images/logo.png'],site:{ name:'Wilderness Odyssey',tagline:'Explore',description:'A wilderness modpack',status:'Testing',version:'0.1',minecraftVersion:'1.21.1',neoForgeVersion:'1',downloadStatus:'Testing',featuredTransmission:'alpha',links:{ curseForge:'https://example.com/pack',discord:'https://discord.gg/example',github:'https://github.com/example/repo' },social:{ title:'Wilderness Odyssey',description:'Explore the wilderness',image:'/images/logo.png' },footer:'Wilderness Odyssey',author:'Staff' } });
function fixture() { const db = new DatabaseSync(':memory:'),store = new ConnectedStore(db),service = new ContentService(store); return { db,store,service }; }

test('source import preserves public content and source revisions and cannot overwrite drafts', async () => {
  const f = fixture();
  try {
    f.service.importSnapshot(snapshot(),'operator');
    const saved = f.service.transmission('alpha');
    assert.equal(saved.sourceRevision,'a'.repeat(40));
    assert.equal(saved.bodyMarkdown,transmission.bodyMarkdown);
    assert.throws(() => f.service.importSnapshot(snapshot(),'operator'),/overwrite/);
    const page = f.service.page('site');
    const value = await f.service.handle(actor,'PUT','/content/pages/site',{ revision:page.revision,sourceRevision:page.sourceRevision,document:{ ...page,data:{ ...snapshot().site,tagline:'New tagline' } } },{},'save-site-document-001') as { revision:string;data:{tagline:string} };
    assert.equal(value.data.tagline,'New tagline');
    assert.notEqual(value.revision,page.revision);
    await assert.rejects(f.service.handle(actor,'PUT','/content/pages/site',{ revision:page.revision,sourceRevision:page.sourceRevision,document:page },{},'save-site-document-002'),/changed/);
    assert.equal(new ContentService(f.store).page('site').revision,value.revision);
    await assert.rejects(f.service.handle(actor,'DELETE','/content/transmissions/alpha',{ revision:saved.revision },{},'delete-source-document-001'),/preserved/);
  } finally { f.db.close(); }
});

test('invalid source import rolls back every imported record', () => {
  const f = fixture();
  try {
    const input = snapshot(); input.site.featuredTransmission = 'missing';
    assert.throws(() => f.service.importSnapshot(input,'operator'));
    assert.equal(f.store.records('content_transmission').length,0);
    assert.equal(f.store.records('content_page').length,0);
    assert.equal(f.store.get('content_assets'),null);
  } finally { f.db.close(); }
});

test('private content rejects non-administrators and unsafe Markdown including reference links', async () => {
  const f = fixture();
  try {
    for (const role of ['viewer','moderator'] as const) await assert.rejects(f.service.handle({ id:role,role },'GET','/content/transmissions',undefined,{},''),/not permitted/);
    for (const [index,bodyMarkdown] of ['<Component />','<img src=x onerror=alert(1)>','[x][ref]\n\n[ref]: javascript:alert(1)','[x](data:text/html,test)','[x](//evil.example)','![x](/images/missing.png)','import X from "./code"'].entries()) {
      await assert.rejects(f.service.handle(actor,'POST','/content/transmissions',{ content:{ ...transmission,bodyMarkdown },revision:null,sourceRevision:null },{},'unsafe-markdown-' + index));
    }
    assert.equal(f.store.records('content_transmission').length,0);
  } finally { f.db.close(); }
});

test('deleting a private draft and conflicting idempotency keys preserve the expected records', async () => {
  const f = fixture();
  try {
    const body = { content:transmission,revision:null,sourceRevision:null };
    const saved = await f.service.handle(actor,'POST','/content/transmissions',body,{},'create-private-draft-001') as { transmission:{revision:string} };
    await assert.rejects(f.service.handle(actor,'POST','/content/transmissions',{ ...body,content:{ ...transmission,title:'Changed' } },{},'create-private-draft-001'),/changed/);
    const deleted = await f.service.handle(actor,'DELETE','/content/transmissions/alpha',{ revision:saved.transmission.revision },{},'delete-private-draft-001');
    assert.deepEqual(deleted,{ schemaVersion:'1.0',deleted:true });
    assert.throws(() => f.service.transmission('alpha'));
  } finally { f.db.close(); }
});

test('idempotency response storage is bounded separately from live drafts', async () => {
  const f = fixture();
  try {
    f.db.prepare('INSERT INTO cs_content_receipts(actor,action,key,hash,result) VALUES (?,?,?,?,zeroblob(?))').run('other','old-save','old-save-key','hash',64 * 1024 * 1024);
    await assert.rejects(f.service.handle(actor,'POST','/content/transmissions',{ content:transmission,revision:null,sourceRevision:null },{},'receipt-quota-test-001'),/storage limit/);
    assert.equal(f.store.records('content_transmission').length,0);
  } finally { f.db.close(); }
});
