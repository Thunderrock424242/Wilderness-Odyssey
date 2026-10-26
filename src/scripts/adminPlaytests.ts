import * as s from '../../contracts/v1/playtests';
import { PlaytestApi } from '../lib/admin/playtestApi';
import { AdminApiError } from '../lib/admin/types';
import { artifactPath, button, element, historyView, profilePath, stateView } from '../lib/admin/playtestViews';
import { dateLabel } from '../lib/admin/playtestPresentation';

const root = document.querySelector<HTMLElement>('[data-authoring-root]')!;
const one = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const workspace = one('[data-authoring-workspace]'), message = one('[data-authoring-message]'), signin = one('[data-authoring-signin]');
const signout = document.querySelector<HTMLButtonElement>('[data-authoring-signout]')!;
const detail = one('[data-playtest-detail]'), history = one('[data-tester-history]'), invite = one('[data-invitation]');
let epoch = 0, busy = false;
let selected: s.Campaign | null = null, testerId: string | null = null;
let campaignCursor: string | null = null, testerCursor: string | null = null;
let campaignUpdates: (() => void)[] = [], historyUpdates: (() => void)[] = [];
const knownTesters = new Map<string, string>();
const api = new PlaytestApi(fetch, clear);

function clear() {
  epoch++; selected = null; testerId = null; campaignUpdates = []; historyUpdates = [];
  workspace.hidden = true; detail.hidden = true; history.replaceChildren(); invite.replaceChildren(); invite.hidden = true;
  one('[data-playtest-list]').replaceChildren(); one('[data-tester-list]').replaceChildren();
  knownTesters.clear(); one<HTMLSelectElement>('[data-existing-tester]').replaceChildren(new Option('New tester', ''));
  for (const selector of ['[data-playtest-title]', '[data-playtest-build]', '[data-collection-desired]', '[data-snapshot-time]']) one(selector).textContent = '';
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea').forEach(input => { input.value = ''; });
  root.querySelectorAll<HTMLFormElement>('[data-create-playtest],[data-invitation-form]').forEach(form => form.reset());
  document.querySelector('[data-authoring-identity]')!.textContent = 'Not signed in'; signin.hidden = false; signout.disabled = true;
}
function error(value: unknown) {
  message.textContent = value instanceof AdminApiError && value.status === 404 ? 'The playtest service is not connected yet. The backend staff endpoints must be available before these controls can be used.' : value instanceof Error ? value.message : 'This request could not be completed.';
}
function lock(locked: boolean) {
  root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea').forEach(control => {
    control.disabled = locked || (!!control.closest('[data-requires-write]') && !api.can('playtests:write')) || control.dataset.revoked === 'true';
  });
}
async function run(action: (current: number) => Promise<void>) {
  if (busy) return;
  busy = true; const current = epoch; lock(true);
  try { await action(current); }
  catch (value) { if (current === epoch || !api.session) error(value); }
  finally { busy = false; lock(false); }
}
function current(value: number) { return value === epoch && !!api.session; }
function snapshot() { one('[data-snapshot-time]').textContent = 'Observations loaded: ' + new Date().toLocaleString() + '. Refresh for new game acknowledgements and uploads.'; }
async function campaigns(token: number, cursor?: string) {
  const data = await api.request('/playtests' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), s.campaignListSchema);
  if (!current(token)) return;
  one('[data-playtest-list]').replaceChildren(...data.campaigns.map(campaign => {
    const row = element('article'); row.append(element('h3', campaign.title), element('p', 'Build ' + campaign.build + ' · Collection desired: ' + (campaign.collect ? 'on' : 'off')), button('Open ' + campaign.title, () => void run(value => loadCampaign(campaign.id, value)))); return row;
  }));
  if (!data.campaigns.length) one('[data-playtest-list]').textContent = 'No playtests have been created.';
  campaignCursor = data.nextCursor; one('[data-campaign-next]').hidden = !campaignCursor; snapshot();
}
async function refresh() {
  if (busy) return;
  api.invalidate();
  await run(async token => {
    message.textContent = 'Checking administrator access…';
    const session = await api.initialize(); if (!current(token)) return;
    if (!api.can('playtests:read') || session.user.role !== 'administrator') { api.invalidate(); throw new AdminApiError('Playtest administration is not enabled for this account. The backend must grant current administrator playtest access.', 403); }
    await campaigns(token); if (!current(token)) return;
    document.querySelector('[data-authoring-identity]')!.textContent = session.user.displayName + ' · ' + session.user.role;
    workspace.hidden = false; signin.hidden = true; signout.disabled = false;
    message.textContent = 'Private playtest records loaded. Collection status uses the last backend observations.';
  });
}
async function loadCampaign(id: string, token: number, cursor?: string) {
  history.replaceChildren(); historyUpdates = []; testerId = null; invite.replaceChildren(); invite.hidden = true; detail.hidden = true;
  const data = await api.request('/playtests/' + id + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), s.campaignDetailSchema);
  if (!current(token)) return;
  if (data.campaign.id !== id) throw new AdminApiError('This playtest could not be verified.', 502);
  selected = data.campaign; campaignUpdates = [];
  data.testers.forEach(tester => knownTesters.set(tester.id, tester.label));
  one<HTMLSelectElement>('[data-existing-tester]').replaceChildren(new Option('New tester', ''), ...[...knownTesters].map(([id, label]) => new Option(label, id)));
  one('[data-playtest-title]').textContent = data.campaign.title; one('[data-playtest-build]').textContent = 'Build ' + data.campaign.build + ' · Reports kept for up to ' + data.campaign.retentionDays + ' days from capture.';
  one<HTMLInputElement>('[data-collection-switch]').checked = data.campaign.collect;
  one('[data-collection-desired]').textContent = 'Collection desired: ' + (data.campaign.collect ? 'on. Waiting for each game to acknowledge before showing Recording.' : 'off. New uploads are rejected; stored reports are retained.');
  one('[data-tester-list]').replaceChildren(...data.testers.map(tester => {
    const row = element('article'), state = stateView(data.campaign, tester); campaignUpdates.push(state.update);
    row.append(element('h4', tester.label), state.node, element('p', 'Collection permission: ' + tester.permission), button('History for ' + tester.label, () => void run(value => loadHistory(tester.id, value)))); return row;
  }));
  if (!data.testers.length) one('[data-tester-list]').textContent = 'No enrolled testers. Create a private invitation to get started.';
  testerCursor = data.nextCursor; one('[data-tester-next]').hidden = !testerCursor; detail.hidden = false; snapshot();
}
async function loadHistory(id: string, token: number, cursor?: string) {
  history.replaceChildren(); historyUpdates = []; testerId = id;
  const data = await api.history(id, cursor); if (!current(token) || testerId !== id) return;
  history.append(element('h2', 'Tester history by playtest and build'));
  if (!data.groups.length) history.append(element('p', 'No retained history was returned for this tester.'));
  for (const group of data.groups) {
    const view = historyView(group, {
      write: api.can('playtests:write'),
      permission: (value, permission) => void run(async active => {
        if (permission === 'revoked' && !confirm('Revoke this installation? A fresh invitation and local consent will be needed to enroll again. Stored reports remain.')) return;
        await api.change(profilePath(value.campaign.id, id) + '/permission', s.testerEnvelope, 'PUT', { permission, revision: value.tester.revision });
        if (current(active)) { await loadCampaign(selected!.id, active); await loadHistory(id, active); message.textContent = 'Collection permission updated. Client acknowledgement is separate.'; }
      }),
      notes: (session, notes) => void run(async active => {
        const saved = await api.change(profilePath(session.campaignId, id) + '/sessions/' + session.id + '/notes', s.sessionEnvelope, 'PUT', { notes, revision: session.revision });
        if (current(active) && testerId === id) { if (saved.testerId !== id || saved.session.id !== session.id || saved.campaignId !== session.campaignId) throw new AdminApiError('The saved note could not be verified.', 502); await loadHistory(id, active); message.textContent = 'Staff notes saved privately.'; }
      }),
      remove: value => void run(async active => {
        if (!confirm('Permanently delete retained data for ' + value.tester.label + ' in ' + value.campaign.title + '? This does not switch collection off or delete shared server recordings.')) return;
        await api.change(profilePath(value.campaign.id, id) + '/data', s.deletionSchema, 'DELETE', { revision: value.tester.revision, confirmDelete: true });
        if (current(active)) { await loadHistory(id, active); message.textContent = 'Retained data deleted for this tester and playtest.'; }
      }),
      log: (session, artifactId, target) => void run(async active => {
        target.replaceChildren(); const value = await api.artifact(artifactPath(session, artifactId), session.campaignId, id, session.id, artifactId);
        if (!current(active) || testerId !== id || !target.isConnected) return;
        if (value.encoding !== 'utf8') throw new AdminApiError('This report is not redacted text.', 502);
        const text = element('pre', value.content); text.dataset.logText = ''; text.tabIndex = 0; text.setAttribute('aria-label', 'Private redacted report text'); target.append(text);
      }),
      download: (path, artifactId, spark) => void run(async active => {
        const blob = await api.download(path, spark); if (!current(active) || testerId !== id) return;
        const url = URL.createObjectURL(blob), link = element('a'); link.href = url; link.download = artifactId + (spark ? '.sparkprofile' : '.txt');
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    }); history.append(view.node); historyUpdates.push(view.update);
  }
  if (data.nextCursor) history.append(button('More tester history', () => void run(value => loadHistory(id, value, data.nextCursor!))));
  snapshot();
}
one<HTMLInputElement>('[data-collection-switch]').addEventListener('change', event => {
  const control = event.currentTarget as HTMLInputElement;
  if (!selected) return;
  const campaign = selected, collect = control.checked; control.checked = campaign.collect;
  void run(async token => {
    const changed = await api.change('/playtests/' + campaign.id + '/collection', s.campaignEnvelope, 'PUT', { collect, revision: campaign.revision });
    if (!current(token)) return;
    if (changed.campaign.id !== campaign.id || changed.campaign.collect !== collect) throw new AdminApiError('Collection permission could not be confirmed. Refresh before retrying.', 502);
    await loadCampaign(campaign.id, token); message.textContent = collect ? 'Collection requested. Each game must acknowledge before showing Recording.' : 'Collection is off. New uploads are rejected. Client authorization ends within 60 seconds; stored reports remain.';
  });
});
one<HTMLFormElement>('[data-create-playtest]').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget as HTMLFormElement; if (!form.reportValidity()) return;
  const data = new FormData(form);
  void run(async token => {
    const value = await api.change('/playtests', s.campaignEnvelope, 'POST', { title: String(data.get('title')), build: String(data.get('build')), retentionDays: Number(data.get('retentionDays')) });
    if (current(token)) { await campaigns(token); await loadCampaign(value.campaign.id, token); form.reset(); message.textContent = 'Playtest created. Collection needs local consent and a game acknowledgement.'; }
  });
});
one<HTMLFormElement>('[data-invitation-form]').addEventListener('submit', event => {
  event.preventDefault(); const form = event.currentTarget as HTMLFormElement; if (!selected || !form.reportValidity()) return;
  const campaign = selected, data = new FormData(form); invite.replaceChildren(); invite.hidden = true;
  void run(async token => {
    const value = await api.change('/playtests/' + campaign.id + '/invitations', s.invitationSchema, 'POST', { testerLabel: String(data.get('testerLabel')), ...(data.get('testerId') ? { testerId: String(data.get('testerId')) } : {}), expiresInHours: Number(data.get('expiresInHours')), revision: campaign.revision });
    if (!current(token)) return;
    if (value.campaignId !== campaign.id || Date.parse(value.invitation.expiresAt) <= Date.now()) throw new AdminApiError('The invitation could not be verified. Refresh and create a new one.', 502);
    const link = new URL('/playtest/', location.origin); link.hash = new URLSearchParams({ invitation: value.invitation.code, api: value.invitation.publicApiOrigin }).toString();
    const label = element('label', 'Private invitation link'), input = element('input'); input.type = 'text'; input.readOnly = true; input.value = link.href; label.append(input);
    invite.append(element('p', 'Share privately with ' + value.invitation.testerLabel + '. Expires ' + dateLabel(value.invitation.expiresAt) + '. This single-use invitation is shown only for this creation request.'), label, button('Clear invitation from this page', () => { invite.replaceChildren(); invite.hidden = true; })); invite.hidden = false;
    message.textContent = 'Private invitation created. It is not a recording acknowledgement.';
  });
});
one<HTMLSelectElement>('[data-existing-tester]').addEventListener('change', event => {
  const id = (event.currentTarget as HTMLSelectElement).value;
  one<HTMLInputElement>('[name="testerLabel"]').value = knownTesters.get(id) ?? '';
});
one('[data-authoring-refresh]').addEventListener('click', () => void refresh());
one('[data-campaign-next]').addEventListener('click', () => { if (campaignCursor) void run(token => campaigns(token, campaignCursor!)); });
one('[data-tester-next]').addEventListener('click', () => { if (selected && testerCursor) void run(token => loadCampaign(selected!.id, token, testerCursor!)); });
signout.addEventListener('click', async () => { signout.disabled = true; try { await api.logout(); clear(); location.assign('/login/?signed_out=1'); } catch (value) { clear(); error(value); } });
window.addEventListener('pagehide', () => api.invalidate());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
setInterval(() => { if (!document.hidden) [...campaignUpdates, ...historyUpdates].forEach(update => update()); }, 5000);
setInterval(() => {
  if (!api.session || document.hidden || busy) return;
  void run(async token => {
    const previous = api.session!, next = await api.initialize(); if (!current(token)) return;
    if (next.user.id !== previous.user.id || next.user.role !== 'administrator' || next.capabilities.join(',') !== previous.capabilities.join(',')) api.invalidate();
  });
}, 30000);
void refresh();
