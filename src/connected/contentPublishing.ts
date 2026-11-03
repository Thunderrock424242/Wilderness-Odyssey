import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as c from '../contracts/v1/content';
import { ContentService, type ContentPublisher, type Publication } from './content';
import { transmissionImages } from './contentValidation';
import { authorize, ServiceError, type Actor } from './store';

export type PublicationFile = { path:string;content:string };
export type PublicationJob = {
  id:string;kind:'transmissions'|'pages';contentId:string;revision:string;sourceRevision:string|null;actor:Actor;
  createdAt:string;expiresAt:number;nextAt:number;attempts:number;files:PublicationFile[];mediaIds:string[];
  result:Publication;commitSha?:string;prNumber?:number;baseSha?:string;pullAttempted?:boolean;
};
export interface PublicationRepository {
  submit(job:PublicationJob,verify:() => Promise<void>,checkpoint:() => void):Promise<void>;
  recover(job:PublicationJob,checkpoint:() => void):Promise<boolean>;
  observe(job:PublicationJob):Promise<Publication & { sourceRevision?:string }>;
}
export function transmissionMarkdown(value:c.Transmission,action:'publish'|'unpublish'):string {
  const { id:_id,revision:_revision,sourceRevision:_sourceRevision,bodyMarkdown,slug:_slug,coverPreviewUrl:_preview,galleryImages,...metadata } = value;
  const fields = { ...metadata,draft:action === 'unpublish',galleryImages:galleryImages.map(({ previewUrl:_private,...image }) => image) };
  return '---\n' + Object.entries(fields).map(([key,field]) => key + ': ' + JSON.stringify(field)).join('\n') + '\n---\n\n' + bodyMarkdown.trim() + '\n';
}

export class ContentPublishing implements ContentPublisher {
  private busy = false;
  private stopped = false;
  constructor(readonly content:ContentService,readonly repository:PublicationRepository,readonly recheck:(actor:Actor) => Promise<Actor>) {}
  async request(actor:Actor,kind:'transmissions'|'pages',id:string,raw:unknown,key:string):Promise<Publication> {
    authorize(actor,'content:publish');
    const input = c.publicationInput.parse(raw);
    return this.content.once(actor,'content:publish:' + kind + ':' + id,key,input,() => {
      const value = kind === 'transmissions' ? this.content.transmission(id) : this.content.page(z.enum(['site','roadmap','gallery']).parse(id));
      if (value.revision !== input.revision) throw new ServiceError(409,'REVISION_CONFLICT','Refresh this draft before requesting publication.');
      if (kind === 'pages' && input.action === 'unpublish') throw new ServiceError(422,'UNSUPPORTED','Structured website pages cannot be unpublished.');
      const active = this.content.store.db.prepare("SELECT 1 FROM cs_records WHERE kind='content_publication' AND json_extract(data,'$.kind')=? AND json_extract(data,'$.contentId')=? AND json_extract(data,'$.result.state') NOT IN ('published','failed','cancelled') LIMIT 1").get(kind,id);
      if (active) throw new ServiceError(409,'PUBLICATION_PENDING','A publication for this record is already pending. Check its existing status.');
      const pending = this.content.store.db.prepare("SELECT count(*) AS n FROM cs_records WHERE kind='content_publication' AND json_extract(data,'$.result.state') NOT IN ('published','failed','cancelled')").get() as {n:number};
      if (pending.n >= 32) throw new ServiceError(429,'PUBLICATION_QUOTA','The pending publication limit has been reached. Review existing requests before submitting more.');
      const images = 'bodyMarkdown' in value ? transmissionImages(value) : value.kind === 'site' ? [value.data.social.image] : value.data.flatMap(row => row.image ? [row.image] : []);
      const mediaIds = images.flatMap(src => {
        this.content.assertImage(src);
        const media = this.content.store.db.prepare("SELECT id FROM cs_records WHERE kind='content_media' AND json_extract(data,'$.src')=?").get(src) as {id:string}|undefined;
        return media ? [media.id] : [];
      });
      const file:PublicationFile = 'bodyMarkdown' in value ? { path:'src/content/transmissions/' + id + '.md',content:transmissionMarkdown(value,input.action) } : { path:'src/data/editable/' + id + '.json',content:JSON.stringify(value.data,null,2) + '\n' };
      const jobId = randomUUID(),result:Publication = { state:'requested',operationId:jobId,message:'Publication requested. Source becomes public when the review branch is submitted; deployment is separate.' };
      const job:PublicationJob = { id:jobId,kind,contentId:id,revision:value.revision,sourceRevision:value.sourceRevision,actor:{...actor},createdAt:this.content.store.now(),expiresAt:this.content.store.clock() + 300000,nextAt:0,attempts:0,files:[file],mediaIds,result };
      this.save(job); return result;
    });
  }
  async status(actor:Actor,id:string):Promise<Publication> {
    authorize(actor,'content:read');
    const job = this.content.store.record<PublicationJob>('content_publication',id);
    if (!job) throw new ServiceError(404,'NOT_FOUND','Publication not found.');
    return c.publicationSchema.parse(job.result);
  }
  stop():void { this.stopped = true; }
  async tick():Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const row = this.content.store.db.prepare("SELECT data FROM cs_records WHERE kind='content_publication' AND json_extract(data,'$.result.state') NOT IN ('published','failed','cancelled') AND json_extract(data,'$.nextAt')<=? ORDER BY json_extract(data,'$.nextAt'),rowid LIMIT 1").get(this.content.store.clock()) as {data:string}|undefined;
      if (!row) return;
      const job = JSON.parse(row.data) as PublicationJob;
      try {
        if (!job.prNumber && job.pullAttempted) {
          const recovered = await this.repository.recover(job,() => this.save(job));
          if (!recovered) {
            const expired = this.content.store.clock() > Date.parse(job.createdAt) + 86400000;
            job.result = { state:expired ? 'failed':'requested',operationId:job.id,message:expired ? 'Repository submission remains unconfirmed. An operator must inspect the review branch before retrying.' : 'Checking whether the repository accepted the earlier request. No duplicate submission will be made.' };
            job.nextAt = this.content.store.clock() + 30000;
            this.save(job); return;
          }
        }
        if (!job.prNumber) {
          const verify = async () => {
            if (this.stopped || this.content.store.clock() >= job.expiresAt) throw new ServiceError(403,'EXPIRED','Publication authorization expired.');
            await this.recheck(job.actor);
            if (this.stopped || this.content.store.clock() >= job.expiresAt) throw new ServiceError(403,'EXPIRED','Publication authorization expired.');
          };
          await verify();
          await this.repository.submit(job,verify,() => this.save(job));
        }
        const observed = await this.repository.observe(job);
        const { sourceRevision,...result } = observed;
        job.result = c.publicationSchema.parse({ ...result,operationId:job.id });
        if (observed.state === 'published' && sourceRevision) {
          this.content.store.transaction(() => {
            const kind = job.kind === 'transmissions' ? 'content_transmission' : 'content_page';
            const current = this.content.store.record<c.Transmission|c.PageDocument>(kind,job.contentId);
            if (current && current.sourceRevision === job.sourceRevision) this.content.store.put(kind,job.contentId,'website',{ ...current,sourceRevision,revision:randomUUID() });
            this.content.store.audit(job.actor.id,'content.published',job.id,'deployment_verified');
          });
        }
        job.nextAt = this.content.store.clock() + 30000;
      } catch (error) {
        const denied = error instanceof ServiceError && [401,403].includes(error.status);
        const conflict = error instanceof ServiceError && error.status === 409;
        job.attempts++;
        if (!job.prNumber && !job.pullAttempted && (denied || conflict || job.attempts >= 6)) job.result = { state:denied ? 'cancelled' : 'failed',operationId:job.id,message:denied ? 'Publication stopped because administrator authorization expired or was withdrawn. Any already submitted repository artifacts remain for operator review.' : conflict ? 'Website source changed. Import or reconcile the current source before publishing.' : 'Repository submission could not be confirmed. Ask an operator to inspect the publication before retrying.' };
        else job.nextAt = this.content.store.clock() + Math.min(300000,5000 * 2 ** Math.min(job.attempts,6));
      }
      this.save(job);
    } finally { this.busy = false; }
  }
  private save(job:PublicationJob):void {
    if (['published','failed','cancelled'].includes(job.result.state)) { job.files = []; job.mediaIds = []; }
    this.content.store.put('content_publication',job.id,job.actor.id,job);
  }
}
