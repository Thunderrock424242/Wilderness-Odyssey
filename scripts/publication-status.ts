import type { PublishingStatus } from '../src/lib/admin/types';
type Run = { status: string; conclusion?: string | null };
type Deployment = { state: string; environment_url?: string };
export function publicationState(run?: Run, deployment?: Deployment): PublishingStatus {
  if (run?.status === 'completed' && run.conclusion !== 'success') return { state: 'failed', message: 'Website checks or deployment verification failed. Review GitHub Actions.' };
  if (deployment && ['error', 'failure'].includes(deployment.state)) return { state: 'failed', message: 'Cloudflare deployment or verification failed. The change is not confirmed published.' };
  if (run?.status === 'completed' && run.conclusion === 'success' && deployment?.state === 'success' && deployment.environment_url) {
    try { const url = new URL(deployment.environment_url); if (url.protocol === 'https:' && !url.username && !url.password) return { state: 'published', message: 'Cloudflare deployment and website verification succeeded.', deploymentUrl: url.href }; } catch { /* Unverified URLs never become publication links. */ }
  }
  if (deployment?.state === 'in_progress') return { state: 'deploying', message: 'Cloudflare deployment or verification is running.' };
  if (run?.status === 'waiting' || deployment?.state === 'pending' || deployment?.state === 'queued') return { state: 'awaiting-approval', message: 'The deployment is waiting for approval or a runner. It has not been published.' };
  if (run?.status === 'completed' && run.conclusion === 'success') return { state: 'checks-passed', message: 'Website checks passed. No verified production deployment was found.' };
  return { state: 'build-running', message: 'Website checks are running. Production publication is not confirmed.' };
}