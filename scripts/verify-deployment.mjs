import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { deploymentEnvironment, requireDeploymentSettings } from './deployment-config.mjs';

function protectedResponse(response) {
  if ([401, 403].includes(response.status)) return true;
  if (![302, 303, 307, 308].includes(response.status)) return false;
  try { return new URL(response.headers.get('location')).hostname.endsWith('.cloudflareaccess.com'); } catch { return false; }
}
function disabledResponse(response) {
  return response.status === 503 && response.headers.get('X-WO-Staff-Mode') === 'disabled' && response.headers.get('Cache-Control') === 'no-store';
}

// Public-only production needs no preview service credentials. Its revision
// aliases must still deny anonymous access, including all staff/auth routes.
export async function verifyBlockedPreview(origin, fetchImpl = fetch) {
  for (const path of ['/', '/revision.json', '/status/', '/robots.txt', '/admin/', '/api/admin/v1/session', '/login/', '/api/auth/discord/start', '/api/public/v1/status']) {
    const response = await fetchImpl(new URL(path, origin), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const denied = protectedResponse(response) || disabledResponse(response);
    await response.body?.cancel();
    if (!denied) throw new Error('Preview protection failed: ' + path);
  }
}
function discordLoginResponse(response, origin) {
  if (response.status !== 303) return false;
  const location = response.headers.get('location');
  if (!location) return false;
  try {
    const destination = new URL(location, origin);
    return destination.origin === new URL(origin).origin && destination.pathname === '/login/' &&
      !destination.username && !destination.password && !destination.search && !destination.hash;
  } catch { return false; }
}
export async function verifyPublishedSite(origin, sha, environment, headers = {}, fetchImpl = fetch, staffAuthMode = 'access') {
  if (!['disabled', 'access', 'discord'].includes(staffAuthMode)) throw new Error('Unsupported staff authentication mode.');
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
  const staffPaths = ['/admin', '/admin/', '/admin/players/', '/admin/reports/', '/admin/models/', '/admin/content/', '/api/admin/v1/session', '/api/admin/v1/models'];
  if (staffAuthMode === 'disabled') staffPaths.push('/login/', '/api/auth/discord/start', '/api/auth/logout');
  for (const path of staffPaths) {
    const response = await request(path, environment === 'preview' ? headers : {});
    const discordRedirect = environment === 'production' && staffAuthMode === 'discord' &&
      path.startsWith('/admin') && discordLoginResponse(response, origin);
    const staffDisabled = staffAuthMode === 'disabled' && disabledResponse(response);
    if (!protectedResponse(response) && !discordRedirect && !staffDisabled) throw new Error('Staff route protection failed: ' + path);
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
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, GITHUB_SHA: sha, DEPLOY_BRANCH: branch } = process.env;
  const environment = deploymentEnvironment();
  const { CLOUDFLARE_PAGES_PROJECT: project, STAFF_AUTH_MODE: staffAuthMode, SITE_URL: siteUrl } = requireDeploymentSettings({ environment });
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
  const targets = verificationTargets(deployment, project, environment, siteUrl);
  const previewHeaders = { 'CF-Access-Client-Id': process.env.PREVIEW_ACCESS_CLIENT_ID || '', 'CF-Access-Client-Secret': process.env.PREVIEW_ACCESS_CLIENT_SECRET || '' };
  const publicProduction = environment === 'production' && staffAuthMode === 'disabled';
  if (!publicProduction && targets.some(target => target.environment === 'preview') && (!previewHeaders['CF-Access-Client-Id'] || !previewHeaders['CF-Access-Client-Secret'])) throw new Error('Preview verification credentials are required for deployment URLs.');
  for (const target of targets) {
    if (publicProduction && target.environment === 'preview') await verifyBlockedPreview(target.origin);
    else await verifyPublishedSite(target.origin, sha, target.environment, target.environment === 'preview' ? previewHeaders : {}, fetch, staffAuthMode);
  }
  const publishedOrigin = environment === 'production' ? secureOrigin(siteUrl) : secureOrigin(deployment.url);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'deployment_url=' + publishedOrigin + '\n');
  console.log('Verified deployment revision, public pages, and protected staff routes.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Deployment verification failed. Inspect the protected deployment and Cloudflare status before retrying.'); process.exitCode = 1; });
