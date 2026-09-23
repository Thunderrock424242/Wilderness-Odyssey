import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function protectedResponse(response) {
  if ([401, 403].includes(response.status)) return true;
  if (![302, 303, 307, 308].includes(response.status)) return false;
  try { return new URL(response.headers.get('location')).hostname.endsWith('.cloudflareaccess.com'); } catch { return false; }
}
export async function verifyPublishedSite(origin, sha, environment, headers = {}, fetchImpl = fetch) {
  const request = (path, suppliedHeaders = headers) => fetchImpl(new URL(path, origin), { headers: suppliedHeaders, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (environment === 'preview') {
    const anonymous = await request('/', {});
    if (!protectedResponse(anonymous)) throw new Error('Preview protection is missing or could not be verified.');
  }
  const revision = await request('/revision.json');
  if (!revision.ok || (await revision.json()).commit !== sha) throw new Error('Deployed revision does not match the tested commit.');
  for (const path of ['/', '/status/', '/support/', '/support/troubleshooting/', '/roadmap/', '/news/', '/patches/']) {
    const response = await request(path);
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Page verification failed: ' + path);
    await response.body?.cancel();
  }
  for (const path of ['/admin', '/admin/', '/admin/players/', '/admin/reports/', '/admin/models/', '/admin/content/', '/api/admin/v1/session', '/api/admin/v1/models']) {
    const response = await request(path, environment === 'preview' ? headers : {});
    if (!protectedResponse(response)) throw new Error('Staff route protection failed: ' + path);
    await response.body?.cancel();
  }
  const status = await request('/api/public/v1/status');
  const payload = await status.json();
  if (!(status.ok && payload.schemaVersion === '1.0') && !(status.status === 503 && typeof payload.code === 'string')) throw new Error('Public API response is not supported.');
}
function secureOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid verification origin.');
  return url.origin;
}
export function verificationTargets(deployment, project, environment, canonical) {
  const productionOrigin = 'https://' + project + '.pages.dev';
  const targets = new Map();
  if (environment === 'production') {
    targets.set(secureOrigin(canonical), 'production');
    targets.set(productionOrigin, 'production');
  }
  for (const value of [deployment.url, ...(deployment.aliases || [])]) {
    const origin = secureOrigin(value);
    const hostname = new URL(origin).hostname;
    if (!(origin === productionOrigin || hostname.endsWith('.' + project + '.pages.dev'))) throw new Error('Unexpected deployment hostname.');
    if (!targets.has(origin)) targets.set(origin, 'preview');
  }
  return [...targets].map(([origin, environment]) => ({ origin, environment }));
}
async function main() {
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_PAGES_PROJECT: project, GITHUB_SHA: sha, DEPLOY_BRANCH: branch, DEPLOY_ENVIRONMENT: environment } = process.env;
  if (!/^[a-f0-9]{32}$/.test(account ?? '') || !/^[a-z0-9-]+$/.test(project ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '') || !['production', 'preview'].includes(environment ?? '') || !token || !branch) throw new Error('Deployment verification configuration is incomplete.');
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/pages/projects/' + project + '/deployments';
  let deployment;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(endpoint, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Cloudflare deployment status could not be read.');
    const payload = await response.json();
    deployment = payload.result?.find(item => item.environment === environment && item.deployment_trigger?.metadata?.commit_hash === sha && item.deployment_trigger?.metadata?.branch === branch);
    if (deployment?.latest_stage?.status === 'success') break;
    if (deployment?.latest_stage?.status === 'failure') throw new Error('Cloudflare reported a failed deployment.');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (deployment?.latest_stage?.status !== 'success') throw new Error('Cloudflare did not confirm a successful deployment for this commit.');
  const targets = verificationTargets(deployment, project, environment, process.env.SITE_URL);
  const previewHeaders = { 'CF-Access-Client-Id': process.env.PREVIEW_ACCESS_CLIENT_ID || '', 'CF-Access-Client-Secret': process.env.PREVIEW_ACCESS_CLIENT_SECRET || '' };
  if (targets.some(target => target.environment === 'preview') && (!previewHeaders['CF-Access-Client-Id'] || !previewHeaders['CF-Access-Client-Secret'])) throw new Error('Preview verification credentials are required for deployment URLs.');
  for (const target of targets) await verifyPublishedSite(target.origin, sha, target.environment, target.environment === 'preview' ? previewHeaders : {});
  const publishedOrigin = environment === 'production' ? secureOrigin(process.env.SITE_URL) : secureOrigin(deployment.url);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'deployment_url=' + publishedOrigin + '\n');
  console.log('Verified deployment revision, public pages, and protected staff routes.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Deployment verification failed. Inspect the protected deployment and Cloudflare status before retrying.'); process.exitCode = 1; });