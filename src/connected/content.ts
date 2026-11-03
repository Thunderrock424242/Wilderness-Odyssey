import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as c from '../contracts/v1/content';
import { authoringRoutes } from '../contracts/v1/authoring-routes';
import { ConnectedStore, authorize, ServiceError, type Actor } from './store';
import { transmissionImages } from './contentValidation';

const snapshotSchema = c.contentSourceSnapshotSchema;
type PageKind = c.PageDocument['kind'];
export type Publication = z.infer<typeof c.publicationSchema>;
export type ContentPublisher = { request(actor:Actor,kind:'transmissions'|'pages',id:string,input:unknown,key:string):Promise<Publication>; status(actor:Actor,id:string):Promise<Publication> };
const conflict = ():never => { throw new ServiceError(409,'REVISION_CONFLICT','This record changed. Refresh it before trying again.'); };
const missing = ():never => { throw new ServiceError(404,'NOT_FOUND','Content is not available. An operator may need to import the website source snapshot.'); };

export class ContentService {
  publisher?:ContentPublisher;
  constructor(readonly store:ConnectedStore) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS cs_content_receipts (actor TEXT NOT NULL, action TEXT NOT NULL, key TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY(actor,action,key));`);
    const columns = store.db.prepare('PRAGMA table_info(cs_content_receipts)').all() as {name:string}[];
    if (!columns.some(column => column.name === 'created_at')) {
      store.db.exec('ALTER TABLE cs_content_receipts ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
      store.db.prepare('UPDATE cs_content_receipts SET created_at=?').run(store.clock());
    }
  }
  async handle(actor:Actor,method:string,path:string,body:unknown,query:unknown,key:string):Promise<unknown> {
    const route = authoringRoutes.find(item => item.method === method && item.pattern.test(path));
    if (!route) throw new ServiceError(404,'NOT_FOUND','Editing route not found.');
    authorize(actor,route.capability); z.object({}).strict().parse(query);
    const input = route.input?.parse(body);
    const parts = path.split('/').filter(Boolean), id = parts[2];
    let result:unknown;
    if (path === '/content/setup') result = this.setup();
    else if (path === '/content/source') result = this.once(actor,method + path,key,input,() => {
      this.importSnapshot(c.contentImportInput.parse(input).snapshot,actor.id);
      return this.setup();
    });
    else if (parts[1] === 'publications' || parts[3] === 'publication') {
      if (!this.publisher) throw new ServiceError(503,'PUBLICATION_UNAVAILABLE','Repository publication needs host configuration. Your saved drafts are preserved.');
      result = parts[1] === 'publications' ? await this.publisher.status(actor,id!) : await this.publisher.request(actor,parts[1] as 'transmissions'|'pages',id!,input,key);
    } else if (parts[1] === 'transmissions') {
      if (method === 'GET') result = id ? this.envelope(this.transmission(id)) : { schemaVersion:'1.0',records:this.summaries() };
      else result = this.once(actor,method + path,key,input,() => {
        if (method === 'DELETE') {
          const current = this.transmission(id!);
          if (current.revision !== c.deleteContentInput.parse(input).revision) conflict();
          if (current.sourceRevision !== null) throw new ServiceError(409,'UNPUBLISH_FIRST','Published source is preserved. Request unpublication instead of deleting this record.');
          this.store.db.prepare("DELETE FROM cs_records WHERE kind='content_transmission' AND id=?").run(id!);
          return { schemaVersion:'1.0',deleted:true };
        }
        const value = c.contentSaveInput.parse(input), current = id ? this.transmission(id) : this.store.record<c.Transmission>('content_transmission',value.content.slug);
        if (id ? !current || value.revision !== current.revision || value.sourceRevision !== current.sourceRevision || value.content.slug !== id : current || value.revision !== null || value.sourceRevision !== null) conflict();
        if (!current && this.store.records('content_transmission',undefined,1000).length >= 1000) throw new ServiceError(429,'CONTENT_QUOTA','The content storage limit has been reached.');
        const transmission = c.transmissionSchema.parse({ ...value.content,id:value.content.slug,revision:randomUUID(),sourceRevision:current?.sourceRevision ?? null });
        this.validateTransmission(transmission);
        this.checkStorage(transmission);
        this.store.put('content_transmission',transmission.id,'website',transmission);
        return { ...this.envelope(transmission),publishing:{ state:'draft-saved',message:'Private draft saved. Request publication separately to update the website.' } };
      });
    } else {
      const kind = z.enum(['site','roadmap','gallery']).parse(id);
      if (method === 'GET') result = this.page(kind);
      else result = this.once(actor,method + path,key,input,() => {
        const value = c.pageSaveInput.parse(input), current = this.page(kind);
        if (value.document.kind !== kind || value.revision !== current.revision || value.document.revision !== current.revision || value.sourceRevision !== current.sourceRevision || value.document.sourceRevision !== current.sourceRevision) conflict();
        const document = c.pageDocumentSchema.parse({ ...value.document,revision:randomUUID(),sourceRevision:current.sourceRevision });
        this.validatePage(document);
        this.checkStorage(document);
        this.store.put('content_page',kind,'website',document); return document;
      });
    }
    return route.output.parse(result);
  }
  transmission(id:string):c.Transmission { return this.store.record<c.Transmission>('content_transmission',c.contentId.parse(id)) ?? missing(); }
  setup():z.infer<typeof c.contentSetupSchema> {
    return c.contentSetupSchema.parse({schemaVersion:'1.0',imported:!!this.store.get('content_source_imported'),sourceRevision:this.store.get('content_source_imported'),transmissionCount:this.store.records('content_transmission',undefined,1000).length,pageCount:this.store.records('content_page',undefined,3).length,publicationConfigured:!!this.publisher});
  }
  private summaries():unknown[] {
    const rows = this.store.db.prepare("SELECT json_set(json_remove(data,'$.bodyMarkdown','$.galleryImages'),'$.galleryImageCount',json_array_length(data,'$.galleryImages')) AS data FROM cs_records WHERE kind='content_transmission' ORDER BY rowid DESC LIMIT 1000").all() as {data:string}[];
    return rows.map(row => JSON.parse(row.data) as unknown);
  }
  private checkStorage(value:unknown):void {
    const row = this.store.db.prepare("SELECT coalesce(sum(length(CAST(data AS BLOB))),0) AS n FROM cs_records WHERE kind IN ('content_transmission','content_page')").get() as {n:number};
    if (row.n + Buffer.byteLength(JSON.stringify(value)) > 64 * 1024 * 1024) throw new ServiceError(429,'CONTENT_QUOTA','The private draft storage limit has been reached.');
  }
  page(kind:PageKind):c.PageDocument { return this.store.record<c.PageDocument>('content_page',kind) ?? missing(); }
  envelope(transmission:c.Transmission) {
    const sources = transmissionImages(transmission);
    const media = sources.flatMap(src => {
      const row = this.store.db.prepare("SELECT data FROM cs_records WHERE kind='content_media' AND json_extract(data,'$.src')=?").get(src) as {data:string}|undefined;
      return row ? [c.mediaSchema.parse(JSON.parse(row.data))] : [];
    });
    return { schemaVersion:'1.0',transmission,media };
  }
  once<T>(actor:Actor,action:string,key:string,input:unknown,change:() => T):T {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new ServiceError(400,'IDEMPOTENCY_REQUIRED','A request identifier is required.');
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM cs_content_receipts WHERE created_at<?').run(this.store.clock() - 86400000);
      const old = this.store.db.prepare('SELECT hash,result FROM cs_content_receipts WHERE actor=? AND action=? AND key=?').get(actor.id,action,key) as { hash:string;result:string }|undefined;
      if (old) { if (old.hash !== hash) conflict(); return JSON.parse(old.result) as T; }
      const result = change();
      const encoded = JSON.stringify(result),size = this.store.db.prepare('SELECT coalesce(sum(length(CAST(result AS BLOB))),0) AS n FROM cs_content_receipts').get() as {n:number};
      if (size.n + Buffer.byteLength(encoded) > 64 * 1024 * 1024) throw new ServiceError(429,'RECEIPT_QUOTA','The idempotency response storage limit has been reached. Try again after older receipts expire.');
      this.store.db.prepare('INSERT INTO cs_content_receipts VALUES (?,?,?,?,?,?)').run(actor.id,action,key,hash,encoded,this.store.clock());
      this.store.audit(actor.id,'content.change',action,'succeeded'); return result;
    });
  }
  importSnapshot(raw:unknown,operator:string):void {
    const input = snapshotSchema.parse(raw);
    if (new Set(input.transmissions.map(item => item.slug)).size !== input.transmissions.length) conflict();
    this.store.transaction(() => {
      if (this.store.get('content_source_imported') || this.store.records('content_page',undefined,1).length || input.transmissions.some(item => this.store.record('content_transmission',item.slug))) throw new ServiceError(409,'ALREADY_IMPORTED','Import cannot overwrite drafts or prior source.');
      this.store.set('content_assets',input.assets);
      for (const content of input.transmissions) this.store.put('content_transmission',content.slug,'website',{ ...content,id:content.slug,revision:randomUUID(),sourceRevision:input.sourceRevision });
      for (const kind of ['site','roadmap','gallery'] as const) this.store.put('content_page',kind,'website',c.pageDocumentSchema.parse({ schemaVersion:'1.0',kind,data:input[kind],revision:randomUUID(),sourceRevision:input.sourceRevision }));
      for (const item of this.store.records<c.Transmission>('content_transmission',undefined,1000)) this.validateTransmission(item);
      for (const kind of ['site','roadmap','gallery'] as const) this.validatePage(this.page(kind));
      this.store.set('content_source_imported',input.sourceRevision);
      this.store.audit(operator,'content.import','website','succeeded');
    });
  }
  assertImage(src:string):void {
    if (!(this.store.get<string[]>('content_assets') ?? []).includes(src) && !this.store.db.prepare("SELECT 1 FROM cs_records WHERE kind='content_media' AND json_extract(data,'$.src')=?").get(src)) throw new ServiceError(422,'IMAGE_MISSING','Choose an imported or uploaded website image.');
  }
  private validateTransmission(item:c.Transmission):void {
    for (const src of transmissionImages(item)) this.assertImage(src);
    if (item.relatedRoadmapItem) {
      const roadmap = this.page('roadmap');
      if (roadmap.kind !== 'roadmap' || !roadmap.data.some(row => row.id === item.relatedRoadmapItem)) throw new ServiceError(422,'REFERENCE_MISSING','Choose an existing roadmap record.');
    }
  }
  private validatePage(item:c.PageDocument):void {
    if (item.kind === 'site') { this.transmission(item.data.featuredTransmission); this.assertImage(item.data.social.image); }
    else for (const row of item.data) {
      if (row.image) this.assertImage(row.image);
      if ('relatedTransmissions' in row) for (const id of row.relatedTransmissions) this.transmission(id);
      if ('relatedTransmission' in row && row.relatedTransmission) this.transmission(row.relatedTransmission);
    }
  }
}
