import { publicStatusSchema, type PublicStatus } from '../../contracts/v1/status';
import { statusPresentation } from '../lib/status';

const panels = [...document.querySelectorAll<HTMLElement>('[data-live-status]')];
const notices = [...document.querySelectorAll<HTMLElement>('[data-maintenance]')];
let lastStatus: PublicStatus | null = null;
let failed = false;
let timer: ReturnType<typeof setTimeout>;
let failures = 0;
let loading = false;
const unavailable = 'Unavailable';
function put(root: Element, selector: string, value: string) { root.querySelectorAll(selector).forEach(node => { node.textContent = value; }); }
function render() {
  const view = statusPresentation(lastStatus);
  const usable = view.freshness !== 'unknown' && lastStatus;
  for (const panel of panels) {
    panel.dataset.freshness = failed ? 'stale' : view.freshness;
    put(panel, '[data-status-detail]', (failed ? 'Refresh failed. ' : '') + view.detail);
    put(panel, '[data-status-minecraft]', failed && usable && view.freshness === 'fresh' ? 'Last known: ' + lastStatus!.minecraft.state : view.minecraft);
    put(panel, '[data-status-aether]', failed && usable && view.freshness === 'fresh' ? 'Last known: ' + (lastStatus!.aether.requestsPaused ? 'paused' : lastStatus!.aether.inference) : view.aether);
    const metrics: Record<string, string> = {};
    if (usable) {
      const { minecraft: mc, aether: ai } = lastStatus!;
      metrics.players = mc.players ? mc.players.online + ' / ' + mc.players.max : unavailable;
      metrics.tps = mc.tps === null ? unavailable : mc.tps.toFixed(1);
      metrics.mspt = mc.mspt === null ? unavailable : mc.mspt.toFixed(1) + ' ms';
      metrics.minecraftVersion = mc.minecraftVersion ?? unavailable;
      metrics.modpackVersion = mc.modpackVersion ?? unavailable;
      metrics.loader = mc.loader ?? unavailable;
      metrics.ollama = ai.ollama;
      metrics.requests = ai.requestsPaused === null ? unavailable : ai.requestsPaused ? 'Paused' : 'Accepting requests';
      const latency = ai.responseLatency;
      const latencyAge = latency ? Date.now() - Date.parse(latency.observedAt) : Infinity;
      metrics.latency = latency && latencyAge >= -60000 && latencyAge <= lastStatus!.staleAfterSeconds * 1000 ? latency.p50Ms.toFixed(0) + ' / ' + latency.p95Ms.toFixed(0) + ' ms' : unavailable;
      put(panel, '[data-latency-detail]', latency ? latency.sampleCount + ' responses over ' + latency.windowSeconds + ' seconds; observed ' + new Date(latency.observedAt).toLocaleString() + '.' : 'No inference timing has been reported.');
    }
    panel.querySelectorAll<HTMLElement>('[data-metric]').forEach(node => { node.textContent = metrics[node.dataset.metric!] ?? unavailable; });
    const incidents = panel.querySelector('[data-public-incidents]');
    if (incidents) {
      incidents.replaceChildren();
      if (!usable) incidents.textContent = 'Incident information is unavailable.';
      else if (!lastStatus!.incidents.length) incidents.textContent = 'No incidents were reported in this status update.';
      else for (const incident of lastStatus!.incidents) {
        const item = document.createElement('article'); item.className = 'incident';
        const heading = document.createElement('h4'); heading.textContent = incident.title + ' — ' + incident.state;
        const message = document.createElement('p'); message.textContent = incident.message;
        const time = document.createElement('p'); time.className = 'ops-muted'; time.textContent = 'Updated ' + new Date(incident.updatedAt).toLocaleString();
        item.append(heading, message, time); incidents.append(item);
      }
    }
  }
  for (const notice of notices) {
    notice.hidden = !usable || !lastStatus!.maintenance.active;
    if (!notice.hidden) {
      put(notice, '[data-maintenance-title]', view.freshness === 'stale' || failed ? 'Last reported maintenance' : 'Maintenance');
      put(notice, '[data-maintenance-message]', lastStatus!.maintenance.message || 'Maintenance is affecting ' + lastStatus!.maintenance.services.join(' and ') + '.');
    }
  }
}
async function refresh() {
  if (loading || document.hidden) return;
  clearTimeout(timer); loading = true;
  document.querySelectorAll<HTMLButtonElement>('[data-status-refresh]').forEach(button => { button.disabled = true; });
  try {
    const response = await fetch('/api/public/v1/status', { signal: AbortSignal.timeout(8000), credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error();
    lastStatus = publicStatusSchema.parse(await response.json());
    failed = false; failures = 0;
  } catch { failed = true; failures++; }
  finally {
    loading = false; render();
    document.querySelectorAll<HTMLButtonElement>('[data-status-refresh]').forEach(button => { button.disabled = false; });
    timer = setTimeout(refresh, Math.min(120000, 30000 * 2 ** Math.min(failures, 2)));
  }
}
document.querySelectorAll('[data-status-refresh]').forEach(button => button.addEventListener('click', refresh));
document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden) void refresh(); });
setInterval(() => { if (!document.hidden) render(); }, 5000);
if (panels.length || notices.length) void refresh();