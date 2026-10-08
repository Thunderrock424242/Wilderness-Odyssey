import { featureCategories, pageDocumentSchema, pageSaveInput, publicationSchema, type PageDocument } from '../../contracts/v1/content';
import { authoringShell } from '../lib/admin/authoringShell';
type Data = string | number | boolean | Data[] | { [key: string]: Data };
let documentValue: PageDocument | null = null, getData: () => Data = () => ({}), operationId = '', loadGeneration = 0;
const shell = authoringShell(async () => { await load(); });
const select = shell.root.querySelector<HTMLSelectElement>('[data-page-kind]')!, form = shell.root.querySelector<HTMLFormElement>('[data-page-form]')!, fields = form.querySelector<HTMLElement>('[data-page-fields]')!, ack = shell.root.querySelector<HTMLInputElement>('[data-page-public-ack]')!, publish = shell.root.querySelector<HTMLButtonElement>('[data-page-publish]')!, check = shell.root.querySelector<HTMLButtonElement>('[data-page-publication-refresh]')!;
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, value => value.toUpperCase());
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
function blank(path: string[]) : Data {
  if (path.at(-1) === 'tasks') return { label: '', complete: false };
  if (path.length > 0) return '';
  return select.value === 'roadmap' ? { id: '', phase: '', title: '', description: '', category: 'Survival', status: 'Planned', progress: 0, progressLabel: '', priority: 'Medium', milestone: '', dependencies: [], relatedTransmissions: [], tasks: [], exitConditions: [], communitySignal: '', image: '' } : { id: '', category: 'Survival', title: '', caption: '', version: '', relatedTransmission: '', lore: '', image: '', alt: '', placeholderSymbol: '' };
}
function render(data: Data) {
  fields.replaceChildren();
  const getter = build(data, fields, []); getData = getter;
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled = !shell.api.can('content:write'); publish.disabled = !shell.api.can('content:publish');
}
function build(value: Data, parent: HTMLElement, path: string[]): () => Data {
  if (Array.isArray(value)) {
    const getters: (() => Data)[] = [];
    value.forEach((item, index) => {
      const box = element('fieldset'), legend = element('legend', typeof item === 'object' && item !== null && !Array.isArray(item) && 'title' in item ? String(item.title) : label(path.at(-1) ?? 'Record') + ' ' + (index + 1)); box.append(legend); parent.append(box);
      getters.push(build(item, box, [...path, String(index)]));
      const remove = element('button', 'Remove ' + label(path.at(-1) ?? 'record')); remove.type = 'button'; remove.className = 'secondary'; remove.disabled = !shell.api.can('content:write'); box.append(remove);
      remove.addEventListener('click', () => { const root = getData(); const target = at(root, path); if (Array.isArray(target)) target.splice(index, 1); render(root); });
    });
    const add = element('button', 'Add ' + label(path.at(-1) ?? 'record')); add.type = 'button'; add.className = 'secondary'; add.disabled = !shell.api.can('content:write'); parent.append(add);
    add.addEventListener('click', () => { const root = getData(), target = at(root, path); if (Array.isArray(target) && target.length < 100) { target.push(blank(path)); render(root); } });
    return () => getters.map(get => get());
  }
  if (typeof value === 'object') {
    const record = { ...value };
    if (path.length === 1 && select.value === 'gallery') for (const key of ['relatedTransmission', 'lore', 'image', 'alt']) record[key] ??= '';
    if (path.length === 1 && select.value === 'roadmap') record.image ??= '';
    const getters = Object.entries(record).map(([key, item]) => [key, build(item, parent, [...path, key])] as const);
    return () => Object.fromEntries(getters.map(([key, get]) => [key, get()]).filter(([key, item]) => !(item === '' && ['image', 'alt', 'lore', 'relatedTransmission'].includes(String(key))))) as Data;
  }
  const wrapper = element('label', label(path.at(-1) ?? 'Value')); parent.append(wrapper);
  const key = path.at(-1) ?? '', options = select.value === 'site' ? null : key === 'category' ? [...featureCategories, ...(select.value === 'gallery' ? ['Anomaly'] : [])] : key === 'status' ? ['Planned', 'Research', 'In Development', 'Testing', 'Blocked', 'Complete'] : key === 'priority' ? ['Critical', 'High', 'Medium', 'Later'] : null;
  if (options) { const control = element('select'); options.forEach(option => control.add(new Option(option, option))); control.value = String(value); wrapper.append(control); return () => control.value; }
  if (typeof value === 'boolean') { const control = element('input'); control.type = 'checkbox'; control.checked = value; wrapper.className = 'authoring-check'; wrapper.prepend(control); return () => control.checked; }
  if (typeof value === 'number') { const control = element('input'); control.type = 'number'; control.min = '0'; control.max = '100'; control.value = String(value); wrapper.append(control); return () => Number(control.value); }
  const control = ['description', 'caption', 'lore', 'communitySignal', 'dependencies', 'exitConditions'].includes(key) || String(value).length > 150 ? element('textarea') : element('input'); control.value = value; control.maxLength = key === 'lore' ? 4000 : 2000; wrapper.append(control); return () => control.value;
}
function at(root: Data, path: string[]): Data { let value = root; for (const part of path) { if (typeof value !== 'object') throw new Error('Invalid form'); value = Array.isArray(value) ? value[Number(part)] : value[part]; } return value; }
async function load() {
  const generation = ++loadGeneration;
  const value = await shell.api.request('/content/pages/' + select.value, pageDocumentSchema); if (generation !== loadGeneration || !shell.api.session) return;
  documentValue = value; render(value.data as Data); ack.checked = false; operationId = ''; check.hidden = true; shell.root.querySelector('[data-page-publication]')!.textContent = ''; shell.root.querySelector<HTMLElement>('[data-page-review]')!.hidden = true;
}
select.addEventListener('change', async () => { form.hidden = true; try { await load(); form.hidden = false; } catch (value) { shell.error(value); } });
form.addEventListener('submit', async event => {
  event.preventDefault(); if (!documentValue) return; const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!; button.disabled = true;
  try {
    const input = pageSaveInput.safeParse({ document: { ...documentValue, data: getData() }, revision: documentValue.revision, sourceRevision: documentValue.sourceRevision });
    if (!input.success) throw new Error('Check required fields, unique slugs, URLs, and referenced image paths. The draft has not been saved.');
    documentValue = await shell.api.request('/content/pages/' + documentValue.kind, pageDocumentSchema, { method: 'PUT', body: JSON.stringify(input.data) }); render(documentValue.data as Data); shell.message.textContent = 'Private draft saved. Submit it for review when ready.';
  } catch (value) { shell.error(value); } finally { button.disabled = !shell.api.can('content:write'); }
});
function publication(value: ReturnType<typeof publicationSchema.parse>) { operationId = value.operationId ?? ''; shell.message.textContent = 'Publication status updated.'; shell.root.querySelector('[data-page-publication]')!.textContent = value.state.replaceAll('-', ' ') + ': ' + value.message; const link = shell.root.querySelector<HTMLAnchorElement>('[data-page-review]')!; link.hidden = !value.pullRequestUrl; if (value.pullRequestUrl) link.href = value.pullRequestUrl; check.hidden = !operationId; }
publish.addEventListener('click', async () => { if (!documentValue || !ack.checked) { shell.message.textContent = 'Acknowledge public source visibility before requesting publication.'; ack.focus(); return; } publish.disabled = true; try { publication(await shell.api.request('/content/pages/' + documentValue.kind + '/publication', publicationSchema, { method: 'POST', body: JSON.stringify({ revision: documentValue.revision, action: 'publish', acknowledgePublicSource: true }) })); } catch (value) { shell.error(value); } finally { publish.disabled = !shell.api.can('content:publish'); } });
check.addEventListener('click', async () => { if (!operationId) return; check.disabled = true; try { publication(await shell.api.request('/content/publications/' + operationId, publicationSchema)); } catch (value) { shell.error(value); } finally { check.disabled = false; } });
void shell.refresh();
