import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { GitHubContentRepository } from '../src/connected/contentRepository';
import { ContentService } from '../src/connected/content';
import { ConnectedStore } from '../src/connected/store';
import type { PublicationJob } from '../src/connected/contentPublishing';

test('repository publication only creates a content PR and waits for matching verified deployment', async () => {
  const db = new DatabaseSync(':memory:'),content = new ContentService(new ConnectedStore(db));
  const { privateKey } = generateKeyPairSync('rsa',{ modulusLength:2048 });
  const config = { repository:'owner/repo',appId:'123',installationId:'456',privateKey:privateKey.export({ type:'pkcs8',format:'pem' }).toString(),environment:'cloudflare-production' };
  const head = 'a'.repeat(40),commit = 'b'.repeat(40),tree = 'c'.repeat(40);
  let merged = false,deployed = false,verified = false;
  const writes:{path:string;body:Record<string,unknown>}[] = [];
  const fetcher:typeof fetch = async (input,init) => {
    const url = new URL(String(input)); assert.equal(url.origin,'https://api.github.com');
    assert.equal(init?.redirect,'error');
    const path = url.pathname;
    if (path.endsWith('/access_tokens')) {
      const value = JSON.parse(String(init?.body)); assert.deepEqual(value.repositories,['repo']);
      assert.equal(value.permissions.contents,'write'); assert.equal(value.permissions.actions,'read');
      return Response.json({ token:'private-installation-token',expires_at:new Date(Date.now()+3600000).toISOString() });
    }
    if (init?.method === 'POST') {
      assert.ok(verified); writes.push({path,body:JSON.parse(String(init.body))});
      if (path.endsWith('/git/trees')) return Response.json({ sha:tree });
      if (path.endsWith('/git/commits')) return Response.json({ sha:commit });
      if (path.endsWith('/git/refs')) return Response.json({ ref:'refs/heads/codex/content-job' });
      if (path.endsWith('/pulls')) return Response.json({ number:7 });
      throw new Error('Unexpected write ' + path);
    }
    if (path.endsWith('/git/ref/heads/website')) return Response.json({object:{sha:head}});
    if (path.includes('/git/ref/heads/codex/') || path.includes('/contents/')) return new Response(null,{status:404});
    if (path.endsWith('/git/commits/' + head)) return Response.json({tree:{sha:head}});
    if (path.endsWith('/pulls')) return Response.json([]);
    if (path.endsWith('/pulls/7')) return Response.json({state:merged ? 'closed':'open',merged,merge_commit_sha:merged ? commit:null,base:{ref:'website'},head:{sha:commit}});
    if (path.endsWith('/runs')) return Response.json({ workflow_runs:[{head_sha:commit,head_branch:'website',status:'completed',conclusion:'success',event:'push'}] });
    if (path.endsWith('/deployments')) return Response.json(deployed ? [{id:10,sha:commit,environment:'cloudflare-production'}] : []);
    if (path.endsWith('/statuses')) return Response.json([{state:'success',environment_url:'https://site.example/'}]);
    throw new Error('Unexpected read ' + path);
  };
  try {
    const repository = new GitHubContentRepository(config,content,fetcher);
    const job:PublicationJob = { id:'job',kind:'transmissions',contentId:'alpha',revision:'draft',sourceRevision:null,actor:{id:'admin',role:'administrator'},createdAt:new Date().toISOString(),expiresAt:Date.now()+300000,nextAt:0,attempts:0,files:[{path:'src/content/transmissions/alpha.md',content:'---\ndraft: false\n---\nContent'}],mediaIds:[],result:{state:'requested',message:'Waiting'} };
    await repository.submit(job,async () => { verified = true; },() => {});
    assert.equal(job.prNumber,7);
    const gitTree = writes.find(row => row.path.endsWith('/git/trees'))!.body;
    assert.equal(gitTree.base_tree,head);
    assert.deepEqual(gitTree.tree,[{path:'src/content/transmissions/alpha.md',mode:'100644',type:'blob',content:job.files[0].content}]);
    assert.equal(writes.find(row => row.path.endsWith('/pulls'))!.body.base,'website');
    assert.ok(writes.every(row => !row.path.endsWith('/merges')));
    assert.equal((await repository.observe(job)).state,'awaiting-review');
    merged = true; assert.equal((await repository.observe(job)).state,'awaiting-approval');
    deployed = true;
    const result = await repository.observe(job); assert.equal(result.state,'published'); assert.equal(result.sourceRevision,commit);
  } finally { db.close(); }
});
