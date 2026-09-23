import { z } from 'zod';
import { browserSessionSchema, incidentsSchema, modelsSchema, mutationSchema, overviewSchema, playerDetailSchema, playersSchema, reportDetailSchema, reportsSchema, roleCapabilities, type BrowserSession, type Capability } from '../../contracts/v1/admin';
import { statusPresentation } from '../lib/status';

const main = document.querySelector<HTMLElement>('[data-staff-section]')!;
const workspace = main.querySelector<HTMLElement>('[data-staff-workspace]')!;
const message = main.querySelector<HTMLElement>('[data-staff-message]')!;
const result = main.querySelector<HTMLElement>('[data-operation-result]')!;
const section = main.dataset.staffSection!;
let session: BrowserSession | null = null;
let overview: z.infer<typeof overviewSchema> | null = null;
let player: z.infer<typeof playerDetailSchema> | null = null;
let report: z.infer<typeof reportDetailSchema> | null = null;
let models: z.infer<typeof modelsSchema> | null = null;
let playerCursor: string | null = null;
let reportCursor: string | null = null;
let playerQuery = '';
let generation = 0;
let selection = 0;
const requestKeys = new Map<string, string>();
const requiredCapability: Record<string, Capability> = { server: 'status:read', players: 'players:read', reports: 'reports:read', models: 'models:read' };
const one = <T extends HTMLElement = HTMLElement>(selector: string) => main.querySelector<T>(selector)!;
const can = (capability: Capability) => !!session && session.capabilities.includes(capability) && roleCapabilities[session.user.role].includes(capability);
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; }
function text(selector: string, value: string) { const element = main.querySelector(selector); if (element) element.textContent = value; }
function item(title: string, description: string) { const element = node('article'); element.append(node('h3', title), node('p', description)); return element; }
function renderList(selector: string, entries: HTMLElement[], empty = 'No records were returned.') { const element = one(selector); element.replaceChildren(...entries); if (!entries.length) element.textContent = empty; }
function applyCapabilities() { main.querySelectorAll<HTMLElement>('[data-write]').forEach(element => { element.hidden = !can(element.dataset.write as Capability); }); }
function clearPrivateState() {
  generation++; selection++; requestKeys.clear(); session = null; overview = null; player = null; report = null; models = null;
  workspace.hidden = true;
  main.querySelectorAll('[data-player-name], [data-player-verification], [data-report-title], [data-report-provenance], [data-overview], [data-active-model], [data-player-results], [data-player-history], [data-player-restrictions], [data-player-appeals], [data-report-list], [data-report-excerpts], [data-report-actions], [data-performance], [data-incidents], [data-operations], [data-model-list]').forEach(element => element.replaceChildren());
  main.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea').forEach(element => { element.value = ''; });
  main.querySelectorAll<HTMLSelectElement>('select[name="operationId"],select[name="modelId"]').forEach(element => element.replaceChildren());
  main.querySelectorAll<HTMLElement>('[data-player-detail], [data-report-detail]').forEach(element => { element.hidden = true; });
  document.querySelector('[data-staff-identity]')!.textContent = 'Not signed in';
  one('[data-staff-signin]').hidden = false;
  result.hidden = true; result.textContent = '';
}
class UiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch('/api/admin/v1' + path, { ...init, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) }); }
  catch { throw new UiError('The request could not be confirmed. Refresh to check its status before retrying.', 0); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearPrivateState();
    let detail = response.status === 401 ? 'Sign in again through Cloudflare Access.' : 'The administration service is unavailable.';
    try { const body = await response.json(); if (typeof body.message === 'string') detail = body.message.slice(0, 500); } catch { /* HTML Access redirects are not rendered. */ }
    throw new UiError(detail, response.status);
  }
  try { return schema.parse(await response.json()); }
  catch { throw new UiError('The service returned an unsupported response. No changes have been confirmed.', 502); }
}
function showError(error: unknown) { message.textContent = error instanceof Error ? error.message : 'This request could not be completed.'; }
function localTime(value: string | null) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function fill(formName: string, name: string, value: string | boolean) {
  const control = main.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-form="' + formName + '"] [name="' + name + '"]');
  if (!control) return;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = value === true;
  else control.value = String(value);
}
function history(entries: z.infer<typeof playerDetailSchema>['history']) { return entries.map(entry => item(entry.action, entry.reason + ' · ' + entry.moderator + ' · ' + new Date(entry.createdAt).toLocaleString())); }

function renderOverview() {
  if (!overview || !session) return;
  const status = statusPresentation(overview.status);
  text('[data-overview]', 'Minecraft: ' + status.minecraft + ' · Aether: ' + status.aether + '. ' + status.detail);
}
setInterval(() => { if (!document.hidden) renderOverview(); }, 5000);
async function load() {
  const current = ++generation;
  selection++;
  main.querySelectorAll<HTMLElement>('[data-player-detail], [data-report-detail]').forEach(element => { element.hidden = true; });
  message.textContent = 'Loading verified staff information…';
  workspace.hidden = true;
  try {
    const nextSession = await api('/session', browserSessionSchema);
    if (current !== generation) return;
    session = nextSession;
    if (!can(requiredCapability[section])) { clearPrivateState(); message.textContent = 'Your role does not permit this section. Choose an authorized section from the navigation.'; return; }
    document.querySelector('[data-staff-identity]')!.textContent = session.user.displayName + ' · ' + session.user.role;
    one('[data-staff-signin]').hidden = true;
    if (section === 'server') {
      const [data, incidents] = await Promise.all([api('/overview', overviewSchema), api('/incidents', incidentsSchema)]);
      if (current !== generation) return;
      overview = data;
      renderOverview();
      const rows = data.performance.map(point => {
        const tr = node('tr'); [new Date(point.observedAt).toLocaleString(), point.tps?.toFixed(1) ?? 'Unavailable', point.mspt?.toFixed(1) ?? 'Unavailable', String(point.players ?? 'Unavailable')].forEach(value => tr.append(node('td', value))); return tr;
      });
      if (!rows.length) { const tr = node('tr'); const td = node('td', 'No performance history has been reported.'); td.colSpan = 4; tr.append(td); rows.push(tr); }
      one('[data-performance]').replaceChildren(...rows);
      renderList('[data-incidents]', incidents.incidents.map(entry => item(entry.title + ' · ' + entry.state, entry.message + (entry.internalNote ? ' — Staff note: ' + entry.internalNote : ''))), 'No incidents were returned.');
      renderList('[data-operations]', data.operations.map(entry => item(entry.kind + ' · ' + entry.state, entry.summary + ' · ' + new Date(entry.updatedAt).toLocaleString())), 'No recent operation requests.');
      const maintenance = data.status.maintenance;
      fill('maintenance', 'active', maintenance.active); fill('maintenance', 'message', maintenance.message);
      fill('maintenance', 'minecraft', maintenance.services.includes('minecraft')); fill('maintenance', 'aether', maintenance.services.includes('aether'));
      fill('maintenance', 'startsAt', localTime(maintenance.startsAt)); fill('maintenance', 'endsAt', localTime(maintenance.endsAt));
      fill('ai-requests', 'paused', data.status.aether.requestsPaused ?? false);
      const select = one<HTMLSelectElement>('[name="operationId"]'); select.replaceChildren(new Option('Choose an approved operation', ''));
      data.allowedServiceOperations.forEach(operation => select.add(new Option(operation.label + ' — ' + operation.description, operation.id)));
    } else if (section === 'reports') { await loadReports(); }
    else if (section === 'models') {
      const data = await api('/models', modelsSchema);
      if (current !== generation) return;
      models = data;
      text('[data-active-model]', data.activeModelId ? 'Active model: ' + (data.models.find(model => model.id === data.activeModelId)?.name ?? data.activeModelId) : 'No active model has been reported.');
      renderList('[data-model-list]', data.models.map(model => item(model.name + ' · ' + model.readiness, model.detail)), 'No approved installed models were returned.');
      const select = one<HTMLSelectElement>('[name="modelId"]'); select.replaceChildren(new Option('Choose a ready, approved model', ''));
      data.models.forEach(model => { const option = new Option(model.name + ' · ' + model.readiness, model.id); option.disabled = model.readiness !== 'ready'; select.add(option); });
      for (const name of ['temperature', 'numPredict', 'numCtx'] as const) {
        fill('settings', name, String(data.settings[name]));
        const input = one<HTMLInputElement>('[name="' + name + '"]'); input.min = String(Math.max(Number(input.min), data.permittedSettings[name].min)); input.max = String(Math.min(Number(input.max), data.permittedSettings[name].max));
      }
    }
    if (current !== generation) return;
    applyCapabilities(); workspace.hidden = false;
    message.textContent = 'Connected. Actions require permission and are recorded in the audit history.';
  } catch (error) { if (current === generation || !session) showError(error); }
}
async function searchPlayers(cursor?: string) {
  const current = ++selection;
  const data = await api('/players?q=' + encodeURIComponent(playerQuery) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), playersSchema);
  if (current !== selection || !session) return;
  playerCursor = data.nextCursor; one('[data-player-next]').hidden = !playerCursor;
  renderList('[data-player-results]', data.players.map(entry => {
    const article = item(entry.username, entry.uuid + ' · Verified ' + new Date(entry.verifiedAt).toLocaleString());
    const button = node('button', 'Review ' + entry.username); button.type = 'button'; button.addEventListener('click', () => void selectPlayer(entry.uuid).catch(showError)); article.append(button); return article;
  }), 'No verified players match that search.');
}
function reasonForm(label: string, submit: (reason: string, decision: string) => Promise<void>, decisions?: string[]) {
  const form = node('form'); const reasonLabel = node('label', label + ' reason'); const textarea = node('textarea');
  textarea.required = true; textarea.minLength = 10; textarea.maxLength = 1000; reasonLabel.append(textarea); form.append(reasonLabel);
  const select = node('select');
  if (decisions) { const decisionLabel = node('label', 'Decision'); decisions.forEach(value => select.add(new Option(value, value))); decisionLabel.append(select); form.append(decisionLabel); }
  const button = node('button', label); button.type = 'submit'; form.append(button);
  form.addEventListener('submit', async event => { event.preventDefault(); if (!form.reportValidity() || !confirm(label + '? This action will be recorded.')) return; button.disabled = true; try { await submit(textarea.value, select.value); } catch (error) { showError(error); } finally { button.disabled = false; } });
  return form;
}
async function selectPlayer(playerUuid: string) {
  const current = ++selection;
  const data = await api('/players/' + encodeURIComponent(playerUuid), playerDetailSchema);
  if (current !== selection || !session) return;
  player = data;
  text('[data-player-name]', data.player.username);
  text('[data-player-verification]', data.player.uuid + ' · Verified ' + new Date(data.player.verifiedAt).toLocaleString());
  renderList('[data-player-history]', history(data.history), 'No recent moderation actions.');
  renderList('[data-player-restrictions]', data.restrictions.map(restriction => {
    const article = item(restriction.revokedAt ? 'Revoked restriction' : 'Aether restriction', restriction.reason + (restriction.expiresAt ? ' · Expires ' + new Date(restriction.expiresAt).toLocaleString() : ' · No expiry reported'));
    if (!restriction.revokedAt && can('players:write')) article.append(reasonForm('Revoke restriction', reason => mutate('/players/' + data.player.uuid + '/restrictions/' + restriction.id + '/revoke', 'POST', { reason, revision: restriction.revision })));
    return article;
  }), 'No Aether restrictions.');
  renderList('[data-player-appeals]', data.appeals.map(appeal => {
    const article = item('Appeal · ' + appeal.state, appeal.message);
    if (appeal.state === 'open' && can('players:write')) article.append(reasonForm('Record appeal decision', (reason, decision) => mutate('/players/' + data.player.uuid + '/appeals/' + appeal.id + '/resolve', 'POST', { reason, decision, revision: appeal.revision }), ['accepted', 'rejected', 'escalated']));
    return article;
  }), 'No appeals.');
  applyCapabilities(); one('[data-player-detail]').hidden = false;
}
async function loadReports(cursor?: string) {
  const current = generation;
  const data = await api('/reports' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), reportsSchema);
  if (current !== generation || !session) return;
  reportCursor = data.nextCursor; one('[data-report-next]').hidden = !reportCursor;
  renderList('[data-report-list]', data.reports.map(entry => {
    const article = item(entry.player.username + ' · ' + entry.state, entry.summary);
    const button = node('button', 'Review report ' + entry.id); button.type = 'button'; button.addEventListener('click', () => void selectReport(entry.id).catch(showError)); article.append(button); return article;
  }), 'No submitted reports were returned.');
}
async function selectReport(id: string) {
  const current = ++selection;
  const data = await api('/reports/' + encodeURIComponent(id), reportDetailSchema);
  if (current !== selection || !session) return;
  report = data;
  text('[data-report-title]', 'Report ' + data.report.id + ' · ' + data.report.player.username);
  text('[data-report-provenance]', data.provenance + ' · Retained until ' + new Date(data.retentionUntil).toLocaleString());
  one('[data-report-excerpts]').replaceChildren(...data.excerpts.map(excerpt => {
    const article = node('article'); article.append(node('h3', excerpt.speaker + ' · ' + new Date(excerpt.sentAt).toLocaleString())); const quote = node('p', excerpt.text); quote.className = 'excerpt'; article.append(quote); return article;
  }));
  renderList('[data-report-actions]', history(data.actions), 'No moderator actions have been recorded.');
  applyCapabilities(); one('[data-report-detail]').hidden = false;
}
async function mutate(path: string, method: string, payload: unknown) {
  if (!session) throw new UiError('Sign in again before submitting an action.', 401);
  const identity = session.user.id;
  const signature = identity + ':' + path + ':' + JSON.stringify(payload);
  const key = requestKeys.get(signature) ?? crypto.randomUUID(); requestKeys.set(signature, key);
  const data = await api(path, mutationSchema, { method, body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken, 'Idempotency-Key': key } });
  if (session?.user.id !== identity) return;
  result.hidden = false; result.textContent = 'Request ' + data.operation.id + ' · ' + data.operation.state + ': ' + data.operation.summary;
  const terminal = ['succeeded', 'failed', 'cancelled'];
  if (terminal.includes(data.operation.state)) requestKeys.delete(signature);
  else {
    const operationId = data.operation.id;
    void (async () => {
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        if (session?.user.id !== identity || document.hidden) return;
        try {
          const update = await api('/operations/' + encodeURIComponent(operationId), mutationSchema);
          if (session?.user.id !== identity) return;
          result.textContent = 'Request ' + operationId + ' · ' + update.operation.state + ': ' + update.operation.summary;
          if (terminal.includes(update.operation.state)) { requestKeys.delete(signature); return; }
        } catch (error) { showError(error); return; }
      }
      result.append(node('p', 'This request is still pending. Refresh the dashboard to check its status.'));
    })();
  }
}
main.querySelectorAll<HTMLFormElement>('[data-form]').forEach(form => form.addEventListener('submit', async event => {
  event.preventDefault(); if (!form.reportValidity() || !confirm('Submit this action? It will be checked and recorded.')) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!; button.disabled = true;
  const data = new FormData(form); const value = (name: string) => String(data.get(name) ?? ''); const reason = value('reason');
  const date = (name: string) => value(name) ? new Date(value(name)).toISOString() : null;
  try {
    switch (form.dataset.form) {
      case 'maintenance': if (!overview) return; await mutate('/maintenance', 'PUT', { active: data.has('active'), message: value('message'), services: ['minecraft', 'aether'].filter(name => data.has(name)), startsAt: date('startsAt'), endsAt: date('endsAt'), reason, revision: overview.maintenanceRevision }); break;
      case 'ai-requests': if (!overview) return; await mutate('/ai-requests', 'PUT', { paused: data.has('paused'), reason, revision: overview.aiRequestsRevision }); break;
      case 'service-operation': await mutate('/service-operations', 'POST', { operationId: value('operationId'), reason }); break;
      case 'warning': if (!player) return; await mutate('/players/' + player.player.uuid + '/warnings', 'POST', { reason }); break;
      case 'restriction': if (!player) return; if (Date.parse(value('expiresAt')) <= Date.now()) throw new Error('Choose a future restriction expiry.'); await mutate('/players/' + player.player.uuid + '/restrictions', 'POST', { scope: 'aether', expiresAt: date('expiresAt'), reason }); break;
      case 'report': if (!report) return; await mutate('/reports/' + report.report.id + '/resolve', 'POST', { decision: value('decision'), reason, revision: report.report.revision }); break;
      case 'model': if (!models) return; await mutate('/model-changes', 'POST', { modelId: value('modelId'), reason, revision: models.revision }); break;
      case 'settings': if (!models) return; await mutate('/inference-settings', 'PUT', { settings: { temperature: Number(value('temperature')), numPredict: Number(value('numPredict')), numCtx: Number(value('numCtx')) }, reason, revision: models.revision }); break;
    }
  } catch (error) { showError(error); }
  finally { button.disabled = false; }
}));
main.querySelector<HTMLFormElement>('[data-player-search]')?.addEventListener('submit', event => { event.preventDefault(); playerQuery = String(new FormData(event.currentTarget as HTMLFormElement).get('q') ?? '').trim(); void searchPlayers().catch(showError); });
main.querySelector('[data-player-next]')?.addEventListener('click', () => { if (playerCursor) void searchPlayers(playerCursor).catch(showError); });
main.querySelector('[data-report-next]')?.addEventListener('click', () => { if (reportCursor) void loadReports(reportCursor).catch(showError); });
one('[data-staff-refresh]').addEventListener('click', () => { void load(); });
window.addEventListener('pagehide', clearPrivateState);
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
setInterval(async () => {
  if (!session || document.hidden) return;
  const prior = session;
  try {
    const renewed = await api('/session', browserSessionSchema);
    if (!session) return;
    if (renewed.user.id !== prior.user.id || renewed.user.role !== prior.user.role || renewed.capabilities.join(',') !== prior.capabilities.join(',')) { clearPrivateState(); await load(); }
    else session = renewed;
  } catch (error) { clearPrivateState(); showError(error); }
}, 60000);
void load();