import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import * as c from '../contracts/v1/content';
import type { ContentService, Publication } from './content';
import type { PublicationJob, PublicationRepository } from './contentPublishing';
import { ServiceError } from './store';

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const object = z.object({sha});
export type ContentRepositoryConfig = { repository:string;appId:string;installationId:string;privateKey:string;environment:string };
export function contentRepositoryConfig(env:NodeJS.ProcessEnv):ContentRepositoryConfig|undefined {
  const parsed = z.object({ repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),appId:z.string().regex(/^\d+$/),installationId:z.string().regex(/^\d+$/),privateKey:z.string().min(100).max(16384) }).safeParse({ repository:env.CONTENT_GITHUB_REPOSITORY,appId:env.CONTENT_GITHUB_APP_ID,installationId:env.CONTENT_GITHUB_INSTALLATION_ID,privateKey:env.CONTENT_GITHUB_PRIVATE_KEY });
  if (!parsed.success) return undefined;
  try {
    const key = createPrivateKey(parsed.data.privateKey);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return undefined;
    return { ...parsed.data,environment:'cloudflare-production' };
  } catch { return undefined; }
}
class RepositoryError extends ServiceError {
  constructor(readonly upstreamStatus:number) { super(upstreamStatus === 409 ? 409 : 503,'REPOSITORY_UNAVAILABLE','Repository publication could not be confirmed.'); }
}

/** Fixed GitHub destination and website branch. Browser input never selects repository paths or credentials. */
export class GitHubContentRepository implements PublicationRepository {
  private readonly key:KeyObject;
  private readonly prefix:string;
  private credential?:{token:string;expires:number};
  constructor(readonly config:ContentRepositoryConfig,readonly content:ContentService,readonly fetcher:typeof fetch = fetch) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository) || !/^\d+$/.test(config.appId) || !/^\d+$/.test(config.installationId)) throw new ServiceError(503,'PUBLICATION_CONFIG','Publication configuration is unavailable.');
    this.key = createPrivateKey(config.privateKey);
    if (this.key.asymmetricKeyType !== 'rsa' || (this.key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new ServiceError(503,'PUBLICATION_CONFIG','Publication configuration is unavailable.');
    this.prefix = '/repos/' + config.repository;
  }
  private async raw(path:string,method:string,credential:string,body?:unknown):Promise<unknown> {
    const response = await this.fetcher('https://api.github.com' + path,{ method,headers:{ authorization:'Bearer ' + credential,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2026-03-10','user-agent':'Wilderness-Odyssey-Content' },...(body === undefined ? {} : {body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(8000) });
    if (!response.ok) { await response.body?.cancel(); throw new RepositoryError(response.status); }
    if (!response.body || Number(response.headers.get('content-length') ?? 0) > 4 * 1024 * 1024) { await response.body?.cancel(); throw new RepositoryError(502); }
    const reader = response.body.getReader(),chunks:Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4 * 1024 * 1024) throw new RepositoryError(502); chunks.push(part.value); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally { await reader.cancel().catch(() => undefined); }
  }
  private async token():Promise<string> {
    if (this.credential && this.credential.expires > Date.now() + 60000) return this.credential.token;
    const now = Math.floor(Date.now()/1000),header = Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url'),payload = Buffer.from(JSON.stringify({iat:now-60,exp:now+540,iss:this.config.appId})).toString('base64url');
    const data = header + '.' + payload,jwt = data + '.' + sign('RSA-SHA256',Buffer.from(data),this.key).toString('base64url');
    const value = z.object({ token:z.string().min(1).max(4096),expires_at:z.iso.datetime() }).parse(await this.raw('/app/installations/' + this.config.installationId + '/access_tokens','POST',jwt,{ repositories:[this.config.repository.split('/')[1]],permissions:{ contents:'write',pull_requests:'write',actions:'read',deployments:'read' } }));
    this.credential = { token:value.token,expires:Date.parse(value.expires_at) }; return value.token;
  }
  private async get(path:string):Promise<unknown> { return this.raw(this.prefix + path,'GET',await this.token()); }
  private async post(path:string,body:unknown,verify:() => Promise<void>,beforeRequest?:() => void):Promise<unknown> {
    const token = await this.token(); await verify();
    beforeRequest?.();
    return this.raw(this.prefix + path,'POST',token,body);
  }
  private async maybe(path:string):Promise<unknown|null> {
    try { return await this.get(path); } catch (error) { if (error instanceof RepositoryError && error.upstreamStatus === 404) return null; throw error; }
  }
  private async fileSha(path:string,ref:string):Promise<string|null> {
    const value = await this.maybe('/contents/' + path + '?ref=' + encodeURIComponent(ref));
    return value === null ? null : z.object({sha,type:z.literal('file')}).parse(value).sha;
  }
  async submit(job:PublicationJob,verify:() => Promise<void>,checkpoint:() => void):Promise<void> {
    const branch = 'codex/content-' + job.id;
    const existing = await this.maybe('/git/ref/heads/' + branch);
    if (existing) {
      const remote = z.object({object}).parse(existing);
      if (!job.commitSha || remote.object.sha !== job.commitSha) throw new ServiceError(409,'BRANCH_CONFLICT','Publication branch changed.');
    } else {
      const head = z.object({object}).parse(await this.get('/git/ref/heads/website')).object.sha;
      if (job.sourceRevision !== null) sha.parse(job.sourceRevision);
      for (const file of job.files) {
        const expectedPath = job.kind === 'transmissions' ? 'src/content/transmissions/' + c.contentId.parse(job.contentId) + '.md' : 'src/data/editable/' + z.enum(['site','roadmap','gallery']).parse(job.contentId) + '.json';
        if (file.path !== expectedPath) throw new ServiceError(409,'INVALID_PATH','Invalid publication source path.');
        const current = await this.fileSha(file.path,head);
        const previous = job.sourceRevision ? await this.fileSha(file.path,job.sourceRevision) : null;
        if (current !== previous || (job.sourceRevision !== null && previous === null)) throw new ServiceError(409,'SOURCE_CONFLICT','Website source changed since import.');
      }
      const parent = z.object({tree:object}).parse(await this.get('/git/commits/' + head));
      const entries:{path:string;mode:'100644';type:'blob';content?:string;sha?:string}[] = job.files.map(file => ({...file,mode:'100644',type:'blob'}));
      let bytes = 0;
      for (const id of job.mediaIds) {
        const image = c.mediaSchema.parse(this.content.store.record('content_media',id));
        const row = this.content.store.db.prepare('SELECT bytes FROM cs_content_image_bytes WHERE id=?').get(id) as {bytes:Uint8Array}|undefined;
        if (!row || !image.src.startsWith('/images/transmissions/')) throw new ServiceError(409,'IMAGE_MISSING','Publication image is unavailable.');
        bytes += row.bytes.length;
        if (bytes > 24 * 1024 * 1024) throw new ServiceError(409,'IMAGE_QUOTA','A publication can contain at most 24 MiB of new images.');
        const blob = object.parse(await this.post('/git/blobs',{content:Buffer.from(row.bytes).toString('base64'),encoding:'base64'},verify));
        entries.push({path:'public' + image.src,mode:'100644',type:'blob',sha:blob.sha});
      }
      const tree = object.parse(await this.post('/git/trees',{base_tree:parent.tree.sha,tree:entries},verify));
      const commit = object.parse(await this.post('/git/commits',{ message:'update website content ' + job.contentId,tree:tree.sha,parents:[head],author:{name:'Wilderness Odyssey Content',email:'content@users.noreply.github.com',date:job.createdAt} },verify));
      job.commitSha = commit.sha; job.baseSha = head; checkpoint();
      await this.post('/git/refs',{ref:'refs/heads/' + branch,sha:commit.sha},verify);
    }
    if (await this.recover(job,checkpoint)) return;
    const pull = z.object({number:z.number().int().positive()}).parse(await this.post('/pulls',{title:'update website content ' + job.contentId,head:branch,base:'website',body:'Requested from the authenticated Wilderness Odyssey content editor. This change contains the frozen draft and its approved images. Review, merge and deployment approvals remain required.'},verify,() => { job.pullAttempted = true; checkpoint(); }));
    job.prNumber = pull.number; checkpoint();
  }
  async recover(job:PublicationJob,checkpoint:() => void):Promise<boolean> {
    const branch = 'codex/content-' + job.id,owner = this.config.repository.split('/')[0];
    const pulls = z.array(z.object({number:z.number().int().positive(),head:z.object({ref:z.string(),sha,repo:z.object({full_name:z.string()})}),base:z.object({ref:z.string()})})).max(10).parse(await this.get('/pulls?state=all&head=' + encodeURIComponent(owner + ':' + branch) + '&base=website&per_page=10'));
    const existingPull = pulls.find(pull => pull.head.ref === branch && pull.head.sha === job.commitSha && pull.head.repo.full_name.toLowerCase() === this.config.repository.toLowerCase() && pull.base.ref === 'website');
    if (!existingPull) return false;
    job.prNumber = existingPull.number; checkpoint(); return true;
  }
  async observe(job:PublicationJob):Promise<Publication & {sourceRevision?:string}> {
    if (!job.prNumber) throw new RepositoryError(502);
    const pullRequestUrl = 'https://github.com/' + this.config.repository + '/pull/' + job.prNumber;
    const pull = z.object({state:z.enum(['open','closed']),merged:z.boolean(),merge_commit_sha:sha.nullable(),head:z.object({sha}),base:z.object({ref:z.string()})}).parse(await this.get('/pulls/' + job.prNumber));
    if (pull.base.ref !== 'website' || pull.head.sha !== job.commitSha) return {state:'failed',message:'The review branch changed. An operator must reconcile this publication.',pullRequestUrl};
    if (!pull.merged) return {state:pull.state === 'open' ? 'awaiting-review':'cancelled',message:pull.state === 'open' ? 'Waiting for repository review and merge.':'The publication pull request was closed without merging.',pullRequestUrl};
    const revision = sha.parse(pull.merge_commit_sha);
    const runs = z.object({workflow_runs:z.array(z.object({head_sha:sha,head_branch:z.string(),status:z.string(),conclusion:z.string().nullable(),event:z.string()})).max(20)}).parse(await this.get('/actions/workflows/deploy-site.yml/runs?head_sha=' + revision + '&branch=website&per_page=20')).workflow_runs;
    const run = runs.find(value => value.head_sha === revision && value.head_branch === 'website' && value.event === 'push');
    if (run && run.status === 'completed' && run.conclusion !== 'success') return {state:'failed',message:'The matching website workflow did not succeed. Review its checks before retrying.',pullRequestUrl};
    if (run && !['completed','waiting','pending','requested','queued'].includes(run.status)) return {state:'deploying',message:'The matching website workflow is running.',pullRequestUrl};
    if (!run || run.status !== 'completed') return {state:'awaiting-approval',message:'Waiting for the matching website workflow or protected deployment approval.',pullRequestUrl};
    const deployments = z.array(z.object({id:z.number().int().positive(),sha,environment:z.string()})).max(20).parse(await this.get('/deployments?sha=' + revision + '&environment=' + encodeURIComponent(this.config.environment) + '&per_page=20'));
    const deployment = deployments.find(value => value.sha === revision && value.environment === this.config.environment);
    if (!deployment) return {state:'awaiting-approval',message:'Checks passed; a matching protected deployment has not been confirmed.',pullRequestUrl};
    const statuses = z.array(z.object({state:z.string(),environment_url:z.string().optional().nullable()})).max(20).parse(await this.get('/deployments/' + deployment.id + '/statuses?per_page=20'));
    const status = statuses[0];
    if (status?.state === 'success') return {state:'published',message:'The matching website workflow and protected deployment succeeded.',pullRequestUrl,sourceRevision:revision,...(c.publicLink.safeParse(status.environment_url).success ? {deploymentUrl:status.environment_url!} : {})};
    return {state:status && ['failure','error','inactive'].includes(status.state) ? 'failed':'deploying',message:'The protected deployment has not completed successfully.',pullRequestUrl};
  }
}
