import * as s from '../../contracts/v1/aether-playground';
import { conversationMessages, type SandboxTurn } from '../lib/admin/aetherConversation';
import { authoringShell } from '../lib/admin/authoringShell';
import type { HostedAdminApi } from '../lib/admin/hostedApi';
const base = '/aether-playground';
let status: s.Status | null = null, examples: s.Example[] = [], jobs: s.Job[] = [], editing: s.Example | null = null, cursor: string | null = null;
let answer: s.SandboxOutput | null = null, sandboxPrompt = '';
let turns: SandboxTurn[] = [], conversationEpoch = 0;
function resetConversation() { conversationEpoch++; turns = []; answer = null; sandboxPrompt = ''; get('[data-transcript]').replaceChildren(); get('[data-answer]').textContent = ''; get('[data-context-note]').textContent = 'New conversation. Earlier turns are no longer sent.'; get<HTMLButtonElement>('[data-save-answer]').disabled = true; }
function renderTranscript() { get('[data-transcript]').replaceChildren(...turns.flatMap(turn => { const user = document.createElement('p'), response = document.createElement('p'); user.textContent = 'You: ' + turn.user; response.textContent = 'Aether: ' + turn.answer; user.style.whiteSpace = response.style.whiteSpace = 'pre-wrap'; user.style.overflowWrap = response.style.overflowWrap = 'anywhere'; return [user, response]; })); }
const selected = new Map<string, string>();
const get = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const form = (selector: string) => get<HTMLFormElement>(selector);
const value = (element: HTMLFormElement, name: string) => String(new FormData(element).get(name) ?? '');
const set = (element: HTMLFormElement, name: string, content: string) => { (element.elements.namedItem(name) as HTMLInputElement).value = content; };
function options(element: HTMLSelectElement, items: { id: string; label: string }[]) { const previous = element.value; element.replaceChildren(...items.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; return option; })); if (items.some(item => item.id === previous)) element.value = previous; }
function button(label: string, action: () => Promise<void> | void) { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.addEventListener('click', () => { void run(action); }); return el; }
let busy = false, uncertainSubmission = false;
async function run(action: () => Promise<void> | void) { if (busy) return; busy = true; try { await action(); } catch (error) { shell.error(error); if (!shell.api.session) { examples = []; jobs = []; answer = null; selected.clear(); get('[data-examples]').replaceChildren(); get('[data-jobs]').replaceChildren(); get('[data-answer]').textContent = ''; shell.clear(); } } finally { busy = false; } }
function editor(example: s.Example | null) { editing = example; const el = form('[data-example]'); el.reset(); if (example) for (const name of ['title','modelId','prompt','response','expectedResponse','notes','rating'] as const) set(el, name, example[name] ?? ''); }
function render() {
  const ready = !!status?.identityVerified && status.state === 'ready', caps = status?.capabilities;
  const tokenLimit = form('[data-sandbox]').elements.namedItem('maxOutputTokens') as HTMLInputElement;
  tokenLimit.max = String(caps?.limits.maxOutputTokens ?? 1024); if (Number(tokenLimit.value) > Number(tokenLimit.max)) tokenLimit.value = tokenLimit.max;
  get('[data-pg-status]').textContent = status ? `Connection: ${status.reachable ? 'reachable' : 'unreachable'} · Identity: ${status.identityVerified ? 'verified' : 'unverified'} · Inference: ${status.inferenceReady === null ? 'unknown' : status.inferenceReady ? 'ready' : 'unavailable'} · Administration: ${ready ? 'ready' : 'setup required / unavailable'} · Training: ${ready && caps?.features.training ? 'ready' : 'unavailable'}. ${status.message}` : 'Setup required. The playground backend is not connected.';
  get('[data-pg-setup]').hidden = ready;
  for (const el of form('[data-sandbox]').querySelectorAll<HTMLButtonElement>('button')) el.disabled = !ready || !caps?.features.sandbox || !shell.api.can('playground:write');
  for (const el of form('[data-admission]').querySelectorAll<HTMLButtonElement>('button')) el.disabled = !ready || !caps?.features.admission || status?.admissionRevision === null || !shell.api.can('playground:write');
  form('[data-training]').querySelector('button')!.disabled = uncertainSubmission || !ready || !caps?.features.training || !shell.api.can('playground:train') || jobs.some(job => ['submitting','unknown'].includes(job.state));
  const oldModel = value(form('[data-sandbox]'), 'modelId');
  options(form('[data-sandbox]').elements.namedItem('modelId') as HTMLSelectElement, caps?.models ?? []);
  if (oldModel && oldModel !== value(form('[data-sandbox]'), 'modelId')) resetConversation();
  options(form('[data-training]').elements.namedItem('baseModelId') as HTMLSelectElement, caps?.models ?? []);
  options(form('[data-training]').elements.namedItem('presetId') as HTMLSelectElement, caps?.presets ?? []);
  get('[data-example-count]').textContent = `${examples.length} examples loaded · ${examples.filter(e => e.state === 'approved').length} approved · ${examples.filter(e => e.state === 'review').length} awaiting review`;
  get('[data-examples]').replaceChildren(...examples.map(example => {
    const row = document.createElement('article'), title = document.createElement('h3'); title.textContent = example.title + ' · ' + example.state; row.append(title);
    const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.disabled = example.state !== 'approved'; check.checked = selected.get(example.id) === example.revision && !check.disabled; check.addEventListener('change', () => { if (check.checked) selected.set(example.id, example.revision); else selected.delete(example.id); }); label.append(check, ' Select approved example for training'); row.append(label);
    row.append(button('Edit ' + example.title, () => editor(example)));
    if (shell.api.can('playground:train')) for (const state of ['approved','rejected'] as const) row.append(button((state === 'approved' ? 'Approve ' : 'Reject ') + example.title, async () => { await mutate('/examples/' + example.id + '/review', s.exampleEnvelope, 'PUT', { revision: example.revision, state }); await loadExamples(); }));
    if (shell.api.can('playground:write')) row.append(button('Delete ' + example.title, async () => { if (!confirm('Delete this private example?')) return; await mutate('/examples/' + example.id, s.deletionSchema, 'DELETE', { revision: example.revision }); selected.delete(example.id); if (editing?.id === example.id) editor(null); await loadExamples(); }));
    return row;
  }));
  get('[data-more]').hidden = cursor === null;
  get('[data-jobs]').replaceChildren(...jobs.map(job => {
    const row = document.createElement('article'), text = document.createElement('p'); text.textContent = `${job.id}: ${job.state}${job.state === 'unknown' ? ' — acceptance uncertain; reconcile this request' : ''}. ${job.message}${job.candidateModelId ? ' Candidate: ' + job.candidateModelId : ''}`; row.append(text);
    row.append(button('Reconcile ' + job.id, async () => { const result = await shell.api.request(base + '/jobs/' + job.id, s.jobEnvelope); jobs = jobs.map(old => old.id === job.id ? result.job : old); render(); }));
    if (caps?.features.cancellation && shell.api.can('playground:train') && ['queued','running','unknown','cancel-requested'].includes(job.state)) row.append(button('Cancel ' + job.id, async () => { const reason = prompt('Reason for cancelling (10–1000 characters)'); if (reason === null) return; const result = await mutate('/jobs/' + job.id + '/cancel', s.jobEnvelope, 'POST', s.cancelInput.parse({ revision: job.revision, reason })); jobs = jobs.map(old => old.id === job.id ? result.job : old); render(); }));
    return row;
  }));
}
async function mutate<T>(path: string, schema: import('zod').z.ZodType<T>, method: string, body: unknown) { return shell.api.request(base + path, schema, { method, body: JSON.stringify(body), ...((path === '/jobs' || path.endsWith('/cancel') || path === '/admission') ? { signal: AbortSignal.timeout(55000) } : {}) }); }
async function loadExamples(next = false) { const result = await shell.api.request(base + '/examples' + (next && cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), s.examplesSchema); examples = next ? [...examples, ...result.examples] : result.examples; cursor = result.nextCursor; for (const [id, revision] of selected) if (!examples.some(e => e.id === id && e.revision === revision && e.state === 'approved')) selected.delete(id); render(); }
const shell = authoringShell(async (api: HostedAdminApi) => {
  try { status = await api.request(base, s.statusSchema); } catch (error) { if (!api.session) throw error; status = null; }
  try { await loadExamples(); jobs = (await api.request(base + '/jobs', s.jobsSchema)).jobs; uncertainSubmission = false; } catch (error) { if (!api.session) throw error; if (status) throw error; examples = []; jobs = []; } render();
}, resetConversation);
form('[data-sandbox]').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
  const el = form('[data-sandbox]'), system = value(el,'system'), prompt = value(el,'prompt').trim();
  const limits = status?.capabilities?.limits;
  if (!limits) throw new Error('Conversation limits are unavailable. Refresh server readiness.');
  const context = conversationMessages(turns, system, prompt, limits);
  const input = s.sandboxInput.parse({ modelId: value(el,'modelId'), messages: context.messages, maxOutputTokens: Number(value(el,'maxOutputTokens')), temperature: Number(value(el,'temperature')) });
  const epoch = conversationEpoch;
  answer = null; get('[data-answer]').textContent = ''; get<HTMLButtonElement>('[data-save-answer]').disabled = true;
  get('[data-context-note]').textContent = [context.droppedPairs ? `${context.droppedPairs} earlier turn pairs omitted to fit server limits.` : '', context.truncatedAnswers ? `${context.truncatedAnswers} earlier answers shortened to 4,000 characters for request context. Full answers remain visible.` : ''].filter(Boolean).join(' ');
  const result = await shell.api.request(base + '/sandbox', s.sandboxOutput, { method:'POST', body: JSON.stringify(input), signal: AbortSignal.timeout(80000) });
  if (epoch !== conversationEpoch) return;
  answer = result; sandboxPrompt = prompt;
  turns.push({ user: prompt, answer: result.answer });
  if (turns.length > 6) { turns = turns.slice(-6); get('[data-context-note]').textContent += ' Only the latest six turn pairs are retained in this page.'; }
  renderTranscript(); get('[data-answer]').textContent = result.answer; get<HTMLButtonElement>('[data-save-answer]').disabled = false;
}); });
get('[data-reset-conversation]').addEventListener('click', resetConversation);
get<HTMLSelectElement>('[data-sandbox] [name="modelId"]').addEventListener('change', resetConversation);
get<HTMLTextAreaElement>('[data-sandbox] [name="system"]').addEventListener('input', resetConversation);
get('[data-save-answer]').addEventListener('click', () => { if (!answer) return; editor(null); const el = form('[data-example]'); set(el,'title','Sandbox example'); set(el,'modelId',answer.modelId); set(el,'prompt',sandboxPrompt); set(el,'response',answer.answer); });
get('[data-new-example]').addEventListener('click', () => editor(null));
form('[data-example]').addEventListener('submit', event => { event.preventDefault(); void run(async () => { const el = form('[data-example]'); const input = s.exampleInput.parse({ title:value(el,'title'),modelId:value(el,'modelId'),prompt:value(el,'prompt'),response:value(el,'response'),expectedResponse:value(el,'expectedResponse'),notes:value(el,'notes'),rating:value(el,'rating') || null }); const result = await mutate('/examples' + (editing ? '/' + editing.id : ''), s.exampleEnvelope, editing ? 'PUT' : 'POST', editing ? { example:input, revision:editing.revision } : input); editor(result.example); await loadExamples(); shell.message.textContent = 'Example saved for review. Any earlier approval is invalidated.'; }); });
get('[data-more]').addEventListener('click', () => { void run(() => loadExamples(true)); });
form('[data-training]').addEventListener('submit', event => { event.preventDefault(); void run(async () => { const el = form('[data-training]'); const input = s.trainingInput.parse({ baseModelId:value(el,'baseModelId'),presetId:value(el,'presetId'),examples:examples.filter(e => e.state === 'approved' && selected.get(e.id) === e.revision).map(e => ({id:e.id,revision:e.revision})),reason:value(el,'reason'),acknowledgeTraining:new FormData(el).get('acknowledgeTraining') === 'on' }); let result: { schemaVersion: '1.0'; job: s.Job }; try { result = await mutate('/jobs',s.jobEnvelope,'POST',input); } catch (error) { uncertainSubmission = true; render(); if (shell.api.session) throw new Error('Training acceptance is uncertain. Refresh jobs and reconcile the original request before submitting again.'); throw error; } jobs = [result.job,...jobs].slice(0,50); (el.elements.namedItem('acknowledgeTraining') as HTMLInputElement).checked = false; render(); shell.message.textContent = result.job.state === 'unknown' ? 'Acceptance uncertain. Reconcile this job before submitting again.' : 'Server reported job state: ' + result.job.state; }); });
form('[data-admission]').addEventListener('submit', event => { event.preventDefault(); const submitter = (event as SubmitEvent).submitter as HTMLButtonElement; void run(async () => { if (!status?.identityVerified || status.state !== 'ready' || !status.capabilities?.features.admission || status.admissionRevision === null) throw new Error('Admission is unavailable until server identity and readiness are verified.'); const input = s.admissionInput.parse({paused:submitter.value === 'true',revision:status.admissionRevision,reason:value(form('[data-admission]'),'reason')}); await mutate('/admission',s.admissionSchema,'POST',input); await shell.refresh(); }); });
void shell.refresh();
