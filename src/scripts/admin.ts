import { Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import {
  createTransmissionDraft,
  generateTransmissionMarkdown,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  normalizeTags,
  sanitizeGalleryImages,
  TRANSMISSION_TEMPLATES,
  transmissionSlug,
  validateTransmission,
} from '../lib/admin/cms';
import { HttpAdminCmsService, UnavailableAdminCmsService } from '../lib/admin/api';
import { editorHtmlToMarkdown, markdownToEditorHtml, markdownToPreviewHtml } from '../lib/admin/editorContent';
import type {
  AdminCmsService,
  AdminGalleryImage,
  AdminMediaPurpose,
  AdminSession,
  AdminTransmission,
  AdminTransmissionInput,
  AdminTransmissionSummary,
  PublishingStatus,
} from '../lib/admin/types';
import type { TransmissionType } from '../data/site';

type AdminBootstrap = {
  config: { apiBase: string; basePath: string; mode: 'api' | 'mock' | 'unavailable' };
  roadmap: { id: string; phase: string; title: string }[];
  seeds: AdminTransmissionSummary[];
};

const rootNode = document.querySelector<HTMLElement>('[data-admin-root]');
const bootstrapNode = rootNode?.querySelector<HTMLScriptElement>('[data-admin-bootstrap]');
if (!rootNode || !bootstrapNode?.textContent) throw new Error('Admin workspace bootstrap data is missing.');
const root: HTMLElement = rootNode;

const bootstrap = JSON.parse(bootstrapNode.textContent) as AdminBootstrap;
const service: AdminCmsService = await createAdminService();

const unavailableView = required<HTMLElement>('[data-admin-unavailable]');
const loginView = required<HTMLElement>('[data-admin-login]');
const loginForm = required<HTMLFormElement>('[data-admin-login-form]');
const loginError = required<HTMLElement>('[data-admin-login-error]');
const mockLoginWarning = required<HTMLElement>('[data-admin-mock-warning]');
const loginNote = required<HTMLElement>('[data-admin-login-note]');
const workspace = required<HTMLElement>('[data-admin-workspace]');
const workspaceWarning = required<HTMLElement>('[data-admin-workspace-warning]');
const dashboard = required<HTMLElement>('[data-admin-dashboard]');
const editorSection = required<HTMLElement>('[data-admin-editor]');
const recordsNode = required<HTMLElement>('[data-admin-records]');
const resultCount = required<HTMLElement>('[data-admin-result-count]');
const searchInput = required<HTMLInputElement>('[data-admin-search]');
const statusFilter = required<HTMLSelectElement>('[data-admin-status-filter]');
const typeFilter = required<HTMLSelectElement>('[data-admin-type-filter]');
const userName = required<HTMLElement>('[data-admin-user]');
const clearance = required<HTMLElement>('[data-admin-clearance]');
const form = required<HTMLFormElement>('[data-admin-form]');
const visualHost = required<HTMLElement>('[data-admin-visual]');
const markdownInput = required<HTMLTextAreaElement>('[data-admin-markdown]');
const preview = required<HTMLElement>('[data-admin-preview]');
const toolbar = required<HTMLElement>('[data-admin-toolbar]');
const validation = required<HTMLElement>('[data-admin-validation]');
const publishing = required<HTMLElement>('[data-admin-publishing]');
const galleryList = required<HTMLElement>('[data-admin-gallery-list]');
const coverPreview = required<HTMLElement>('[data-admin-cover-preview]');
const bodyFile = required<HTMLInputElement>('[data-admin-body-file]');
const coverFile = required<HTMLInputElement>('[data-admin-cover-file]');
const galleryFile = required<HTMLInputElement>('[data-admin-gallery-file]');
const toast = required<HTMLElement>('[data-admin-toast]');
const dangerZone = required<HTMLElement>('[data-admin-danger]');
const descriptionCount = required<HTMLElement>('[data-admin-description-count]');

const CmsImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      publicSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-public-src'),
        renderHTML: (attributes) => attributes.publicSrc ? { 'data-public-src': attributes.publicSrc } : {},
      },
    };
  },
});

let session: AdminSession = { authenticated: false };
let summaries: AdminTransmissionSummary[] = [];
let current: AdminTransmissionInput = createTransmissionDraft('');
let currentId: string | undefined;
let editingMode: 'visual' | 'markdown' | 'preview' = 'visual';
let slugManuallyEdited = false;
let syncingEditor = false;
let previewTimer = 0;
let toastTimer = 0;

const editor = new Editor({
  element: visualHost,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    CmsImage.configure({ allowBase64: true, inline: false }),
  ],
  content: '<p></p>',
  editorProps: {
    attributes: {
      'aria-label': 'Transmission visual editor',
      'data-admin-editor-surface': 'true',
    },
  },
  onUpdate: () => {
    if (syncingEditor || editingMode !== 'visual') return;
    current.bodyMarkdown = editorHtmlToMarkdown(editor.getHTML());
    schedulePreview();
    updateToolbarState();
  },
  onSelectionUpdate: updateToolbarState,
});

void initialize();

async function createAdminService(): Promise<AdminCmsService> {
  if (bootstrap.config.mode === 'api') return new HttpAdminCmsService(bootstrap.config.apiBase);
  if (bootstrap.config.mode === 'mock' && import.meta.env.DEV) {
    const { MockAdminCmsService } = await import('../lib/admin/mock');
    return new MockAdminCmsService(bootstrap.seeds);
  }
  return new UnavailableAdminCmsService();
}

async function initialize() {
  if (service.mode === 'unavailable') {
    unavailableView.hidden = false;
    return;
  }
  mockLoginWarning.hidden = service.mode !== 'mock';
  workspaceWarning.hidden = service.mode !== 'mock';
  if (service.mode === 'mock') loginNote.textContent = 'Development-only local access. No credentials leave this browser.';
  try {
    session = await service.getSession();
  } catch (error) {
    loginError.textContent = errorMessage(error);
  }
  if (session.authenticated) await openWorkspace();
  else loginView.hidden = false;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const data = new FormData(loginForm);
  const username = String(data.get('username') ?? '');
  const password = String(data.get('password') ?? '');
  const button = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  setBusy(button, true, 'Verifying…');
  try {
    session = await service.login(username, password);
    loginForm.reset();
    await openWorkspace();
  } catch (error) {
    loginError.textContent = errorMessage(error);
  } finally {
    setBusy(button, false);
  }
});

required<HTMLButtonElement>('[data-admin-logout]').addEventListener('click', async () => {
  await service.logout();
  session = { authenticated: false };
  workspace.hidden = true;
  loginView.hidden = false;
});

root.querySelectorAll<HTMLButtonElement>('[data-admin-create]').forEach((button) => button.addEventListener('click', openNewTransmission));
required<HTMLButtonElement>('[data-admin-back]').addEventListener('click', showDashboard);
required<HTMLButtonElement>('[data-admin-save]').addEventListener('click', saveTransmission);
required<HTMLButtonElement>('[data-admin-copy]').addEventListener('click', copyMarkdown);
required<HTMLButtonElement>('[data-admin-delete]').addEventListener('click', deleteTransmission);
required<HTMLButtonElement>('[data-admin-template]').addEventListener('click', insertTemplate);
required<HTMLButtonElement>('[data-admin-cover-upload]').addEventListener('click', () => coverFile.click());
required<HTMLButtonElement>('[data-admin-cover-clear]').addEventListener('click', () => {
  current.coverImage = undefined;
  current.coverPreviewUrl = undefined;
  renderCover();
});
required<HTMLButtonElement>('[data-admin-add-gallery]').addEventListener('click', () => galleryFile.click());
form.addEventListener('submit', (event) => event.preventDefault());

[searchInput, statusFilter, typeFilter].forEach((control) => control.addEventListener('input', renderRecords));

recordsNode.addEventListener('click', async (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-record-action]');
  if (!button?.dataset.recordId || !button.dataset.recordAction) return;
  const { recordId: id, recordAction: action } = button.dataset;
  if (action === 'edit') await openExistingTransmission(id);
  if (action === 'preview') await openExistingTransmission(id, true);
  if (action === 'publish') await setPublishedState(id, true, button);
  if (action === 'unpublish') await setPublishedState(id, false, button);
});

formField<HTMLInputElement>('title').addEventListener('input', () => {
  if (!slugManuallyEdited && !currentId) formField<HTMLInputElement>('slug').value = transmissionSlug(formField<HTMLInputElement>('title').value);
  schedulePreview();
});
formField<HTMLInputElement>('slug').addEventListener('input', () => { slugManuallyEdited = true; });
formField<HTMLTextAreaElement>('description').addEventListener('input', () => {
  updateDescriptionCount();
  schedulePreview();
});
formField<HTMLSelectElement>('type').addEventListener('change', schedulePreview);

root.querySelectorAll<HTMLButtonElement>('[data-admin-mode]').forEach((button) => {
  button.addEventListener('click', () => setEditingMode(button.dataset.adminMode as typeof editingMode));
});

toolbar.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-command]');
  if (!button?.dataset.command) return;
  runEditorCommand(button.dataset.command);
});

bodyFile.addEventListener('change', async () => {
  if (bodyFile.files?.[0]) await insertBodyImage(bodyFile.files[0]);
  bodyFile.value = '';
});
coverFile.addEventListener('change', async () => {
  if (coverFile.files?.[0]) await uploadCover(coverFile.files[0]);
  coverFile.value = '';
});
galleryFile.addEventListener('change', async () => {
  if (galleryFile.files) await uploadGalleryImages([...galleryFile.files]);
  galleryFile.value = '';
});

visualHost.addEventListener('dragover', (event) => {
  if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === 'file')) event.preventDefault();
});
visualHost.addEventListener('drop', (event) => {
  const file = [...(event.dataTransfer?.files ?? [])].find((candidate) => candidate.type.startsWith('image/'));
  if (!file) return;
  event.preventDefault();
  void insertBodyImage(file);
});
visualHost.addEventListener('paste', (event) => {
  const file = [...(event.clipboardData?.files ?? [])].find((candidate) => candidate.type.startsWith('image/'));
  if (!file) return;
  event.preventDefault();
  void insertBodyImage(file);
});

galleryList.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement;
  const row = input.closest<HTMLElement>('[data-gallery-index]');
  if (!row) return;
  const index = Number(row.dataset.galleryIndex);
  const image = current.galleryImages[index];
  if (!image) return;
  if (input.dataset.galleryField === 'alt') image.alt = input.value;
  if (input.dataset.galleryField === 'caption') image.caption = input.value;
  schedulePreview();
});
galleryList.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-gallery-remove]');
  if (!button) return;
  current.galleryImages.splice(Number(button.dataset.galleryRemove), 1);
  renderGallery();
  schedulePreview();
});

async function openWorkspace() {
  loginView.hidden = true;
  unavailableView.hidden = true;
  workspace.hidden = false;
  userName.textContent = session.user?.displayName ?? 'Authorized operator';
  clearance.textContent = session.user?.clearance ?? 'PUBLISHING ACCESS';
  await refreshSummaries();
  showDashboard();
}

async function refreshSummaries() {
  try {
    summaries = await service.listTransmissions();
    renderRecords();
  } catch (error) {
    showToast(errorMessage(error));
  }
}

function renderRecords() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const type = typeFilter.value;
  const visible = summaries.filter((record) => {
    const haystack = `${record.title} ${record.id} ${record.description} ${record.tags.join(' ')}`.toLowerCase();
    const statusMatches = status === 'all' || (status === 'draft' ? record.draft : !record.draft);
    return (!search || haystack.includes(search)) && statusMatches && (type === 'all' || record.type === type);
  });
  resultCount.textContent = `${visible.length} of ${summaries.length} records visible`;
  recordsNode.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = 'No transmissions match the current archive filters.';
    recordsNode.appendChild(empty);
    return;
  }
  visible.forEach((record) => recordsNode.appendChild(createRecordCard(record)));
}

function createRecordCard(record: AdminTransmissionSummary): HTMLElement {
  const article = document.createElement('article');
  article.className = 'admin-record';
  const information = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'admin-record__meta';
  const badge = document.createElement('span');
  badge.className = `admin-record__badge${record.draft ? ' admin-record__badge--draft' : ''}`;
  badge.textContent = record.draft ? 'DRAFT' : 'PUBLISHED';
  const type = document.createElement('span');
  type.textContent = record.type;
  const date = document.createElement('span');
  date.textContent = record.publishedAt;
  const gallery = document.createElement('span');
  gallery.textContent = `${record.galleryImageCount} visuals`;
  meta.append(badge, type, date, gallery);
  const title = document.createElement('h2');
  title.textContent = record.title;
  const slug = document.createElement('p');
  slug.textContent = `/transmissions/${record.id}/`;
  information.append(meta, title, slug);
  const actions = document.createElement('div');
  actions.className = 'admin-record__actions';
  actions.append(
    recordButton('Preview', 'preview', record.id, true),
    recordButton('Edit', 'edit', record.id),
    recordButton(record.draft ? 'Publish' : 'Unpublish', record.draft ? 'publish' : 'unpublish', record.id),
  );
  article.append(information, actions);
  return article;
}

function recordButton(label: string, action: string, id: string, secondary = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `admin-button${secondary ? ' admin-button--secondary' : ''}`;
  button.textContent = label;
  button.dataset.recordAction = action;
  button.dataset.recordId = id;
  return button;
}

function openNewTransmission() {
  currentId = undefined;
  slugManuallyEdited = false;
  current = createTransmissionDraft(session.user?.displayName ?? 'Thunderrock424242');
  fillForm(current);
  required<HTMLElement>('[data-admin-editor-kicker]').textContent = 'NEW RECORD';
  required<HTMLElement>('[data-admin-editor-title]').textContent = 'Compose transmission';
  dangerZone.hidden = true;
  showEditor();
}

async function openExistingTransmission(id: string, showPreview = false) {
  try {
    const transmission = await service.getTransmission(id);
    currentId = transmission.id;
    slugManuallyEdited = true;
    current = cloneInput(transmission);
    fillForm(current);
    required<HTMLElement>('[data-admin-editor-kicker]').textContent = transmission.draft ? 'DRAFT RECORD' : 'PUBLISHED RECORD';
    required<HTMLElement>('[data-admin-editor-title]').textContent = transmission.title;
    dangerZone.hidden = false;
    showEditor();
    if (showPreview) setEditingMode('preview');
  } catch (error) {
    showToast(errorMessage(error));
  }
}

function fillForm(input: AdminTransmissionInput) {
  formField<HTMLInputElement>('title').value = input.title;
  formField<HTMLInputElement>('slug').value = input.slug;
  formField<HTMLTextAreaElement>('description').value = input.description;
  formField<HTMLSelectElement>('type').value = input.type;
  formField<HTMLInputElement>('author').value = input.author;
  formField<HTMLInputElement>('tags').value = input.tags.join(', ');
  formField<HTMLInputElement>('version').value = input.version ?? '';
  formField<HTMLSelectElement>('relatedRoadmapItem').value = input.relatedRoadmapItem ?? '';
  formField<HTMLInputElement>('publishedAt').value = input.publishedAt;
  formField<HTMLInputElement>('updatedAt').value = input.updatedAt ?? '';
  formField<HTMLInputElement>('draft').checked = input.draft;
  formField<HTMLInputElement>('featured').checked = input.featured;
  syncingEditor = true;
  editor.commands.setContent(markdownToEditorHtml(input.bodyMarkdown, bootstrap.config.basePath));
  syncingEditor = false;
  markdownInput.value = input.bodyMarkdown;
  renderCover();
  renderGallery();
  updateDescriptionCount();
  validation.hidden = true;
  publishing.hidden = true;
  setEditingMode('visual');
}

function collectInput(): AdminTransmissionInput {
  const bodyMarkdown = editingMode === 'markdown'
    ? markdownInput.value.trim()
    : editorHtmlToMarkdown(editor.getHTML());
  current = {
    ...current,
    slug: formField<HTMLInputElement>('slug').value.trim(),
    title: formField<HTMLInputElement>('title').value.trim(),
    description: formField<HTMLTextAreaElement>('description').value.trim(),
    type: formField<HTMLSelectElement>('type').value as TransmissionType,
    author: formField<HTMLInputElement>('author').value.trim(),
    tags: normalizeTags(formField<HTMLInputElement>('tags').value),
    version: optionalValue(formField<HTMLInputElement>('version').value),
    relatedRoadmapItem: optionalValue(formField<HTMLSelectElement>('relatedRoadmapItem').value),
    publishedAt: formField<HTMLInputElement>('publishedAt').value,
    updatedAt: optionalValue(formField<HTMLInputElement>('updatedAt').value),
    draft: formField<HTMLInputElement>('draft').checked,
    featured: formField<HTMLInputElement>('featured').checked,
    galleryImages: sanitizeGalleryImages(current.galleryImages),
    bodyMarkdown,
  };
  return current;
}

async function saveTransmission() {
  const button = required<HTMLButtonElement>('[data-admin-save]');
  const input = collectInput();
  const errors = validateTransmission(input, bootstrap.roadmap.map((item) => item.id), summaries.map((item) => item.id), currentId);
  if (errors.length) {
    showValidation(errors);
    return;
  }
  validation.hidden = true;
  setBusy(button, true, 'Saving…');
  setPublishing({ state: 'saving', message: 'Validating and submitting the transmission record…' });
  try {
    const result = currentId
      ? await service.updateTransmission(currentId, input)
      : await service.createTransmission(input);
    currentId = result.transmission.id;
    current = cloneInput(result.transmission);
    slugManuallyEdited = true;
    dangerZone.hidden = false;
    setPublishing(result.publishing);
    await refreshSummaries();
    if (result.publishing.operationId) void trackPublishing(result.publishing.operationId);
    showToast(service.mode === 'mock' ? 'Saved to this browser’s mock archive.' : 'Transmission accepted by the publishing service.');
  } catch (error) {
    setPublishing({ state: 'failed', message: errorMessage(error) });
  } finally {
    setBusy(button, false);
  }
}

async function setPublishedState(id: string, shouldPublish: boolean, button: HTMLButtonElement) {
  setBusy(button, true, shouldPublish ? 'Publishing…' : 'Unpublishing…');
  try {
    const transmission = await service.getTransmission(id);
    const input = cloneInput(transmission);
    input.draft = !shouldPublish;
    if (shouldPublish && !input.publishedAt) input.publishedAt = new Date().toISOString().slice(0, 10);
    const result = await service.updateTransmission(id, input);
    showToast(result.publishing.message);
    await refreshSummaries();
  } catch (error) {
    showToast(errorMessage(error));
  } finally {
    setBusy(button, false);
  }
}

async function deleteTransmission() {
  if (!currentId || !window.confirm(`Delete “${current.title || currentId}”? The Admin API controls whether this can be recovered.`)) return;
  try {
    await service.deleteTransmission(currentId);
    showToast('Transmission deleted.');
    await refreshSummaries();
    showDashboard();
  } catch (error) {
    showToast(errorMessage(error));
  }
}

async function copyMarkdown() {
  const markdown = generateTransmissionMarkdown(collectInput());
  try {
    await navigator.clipboard.writeText(markdown);
    showToast('Complete frontmatter and Markdown copied.');
  } catch {
    const download = document.createElement('a');
    download.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    download.download = `${current.slug || 'transmission'}.md`;
    download.click();
    URL.revokeObjectURL(download.href);
    showToast('Clipboard unavailable; Markdown file downloaded instead.');
  }
}

function insertTemplate() {
  const type = formField<HTMLSelectElement>('type').value as TransmissionType;
  const template = TRANSMISSION_TEMPLATES[type];
  if (!template) {
    showToast('This transmission type does not have a starter template.');
    return;
  }
  const existing = collectInput().bodyMarkdown;
  if (existing.trim() && !window.confirm('Replace the current body with this type template?')) return;
  current.bodyMarkdown = template;
  syncingEditor = true;
  editor.commands.setContent(markdownToEditorHtml(template, bootstrap.config.basePath));
  syncingEditor = false;
  markdownInput.value = template;
  setEditingMode('visual');
}

function setEditingMode(mode: typeof editingMode) {
  if (!['visual', 'markdown', 'preview'].includes(mode)) return;
  if (editingMode === 'visual') {
    current.bodyMarkdown = editorHtmlToMarkdown(editor.getHTML());
    markdownInput.value = current.bodyMarkdown;
  } else if (editingMode === 'markdown') {
    current.bodyMarkdown = markdownInput.value;
    syncingEditor = true;
    editor.commands.setContent(markdownToEditorHtml(current.bodyMarkdown, bootstrap.config.basePath));
    syncingEditor = false;
  }
  editingMode = mode;
  visualHost.hidden = mode !== 'visual';
  toolbar.hidden = mode !== 'visual';
  markdownInput.hidden = mode !== 'markdown';
  preview.hidden = mode !== 'preview';
  root.querySelectorAll<HTMLButtonElement>('[data-admin-mode]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.adminMode === mode)));
  if (mode === 'preview') renderPreview();
}

function runEditorCommand(command: string) {
  if (editingMode !== 'visual') setEditingMode('visual');
  const chain = editor.chain().focus();
  if (command === 'bold') chain.toggleBold().run();
  else if (command === 'italic') chain.toggleItalic().run();
  else if (command === 'strike') chain.toggleStrike().run();
  else if (command === 'heading') chain.toggleHeading({ level: 2 }).run();
  else if (command === 'bulletList') chain.toggleBulletList().run();
  else if (command === 'orderedList') chain.toggleOrderedList().run();
  else if (command === 'blockquote') chain.toggleBlockquote().run();
  else if (command === 'codeBlock') chain.toggleCodeBlock().run();
  else if (command === 'undo') chain.undo().run();
  else if (command === 'redo') chain.redo().run();
  else if (command === 'image') bodyFile.click();
  else if (command === 'link') {
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Link URL (leave blank to remove):', previous ?? 'https://');
    if (href === null) return;
    if (!href.trim()) chain.extendMarkRange('link').unsetLink().run();
    else chain.extendMarkRange('link').setLink({ href: href.trim() }).run();
  }
  updateToolbarState();
}

function updateToolbarState() {
  const active: Record<string, boolean> = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    strike: editor.isActive('strike'),
    heading: editor.isActive('heading', { level: 2 }),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'),
    codeBlock: editor.isActive('codeBlock'),
    link: editor.isActive('link'),
  };
  toolbar.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
    button.classList.toggle('is-active', Boolean(active[button.dataset.command ?? '']));
  });
}

async function insertBodyImage(file: File) {
  const upload = await uploadMedia(file, 'body');
  if (!upload) return;
  const alt = window.prompt('Describe this image for readers using screen readers:', file.name.replace(/\.[^.]+$/, ''))?.trim() ?? '';
  if (!alt) {
    showToast('Image insertion cancelled because alt text is required.');
    return;
  }
  if (editingMode === 'markdown') {
    const addition = `\n\n![${alt}](${upload.src})\n`;
    markdownInput.setRangeText(addition, markdownInput.selectionStart, markdownInput.selectionEnd, 'end');
    current.bodyMarkdown = markdownInput.value;
  } else {
    setEditingMode('visual');
    editor.chain().focus().insertContent({ type: 'image', attrs: { src: upload.previewUrl, alt, publicSrc: upload.src } }).run();
  }
  schedulePreview();
}

async function uploadCover(file: File) {
  const upload = await uploadMedia(file, 'cover');
  if (!upload) return;
  current.coverImage = upload.src;
  current.coverPreviewUrl = upload.previewUrl;
  renderCover();
  schedulePreview();
}

async function uploadGalleryImages(files: File[]) {
  for (const file of files) {
    const upload = await uploadMedia(file, 'gallery');
    if (!upload) continue;
    current.galleryImages.push({
      src: upload.src,
      previewUrl: upload.previewUrl,
      alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      caption: '',
    });
  }
  renderGallery();
  schedulePreview();
}

async function uploadMedia(file: File, purpose: AdminMediaPurpose) {
  const error = validateImageFile(file);
  if (error) {
    showToast(error);
    return undefined;
  }
  const slug = formField<HTMLInputElement>('slug').value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    showToast('Set a valid slug before uploading media.');
    formField<HTMLInputElement>('slug').focus();
    return undefined;
  }
  try {
    showToast(`Uploading ${file.name}…`);
    return await service.uploadMedia(file, slug, purpose);
  } catch (caught) {
    showToast(errorMessage(caught));
    return undefined;
  }
}

function validateImageFile(file: File): string | undefined {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return 'Use a WebP, AVIF, PNG, JPEG, or GIF image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Images must be 12 MB or smaller.';
  return undefined;
}

function renderCover() {
  coverPreview.replaceChildren();
  if (!current.coverImage) {
    const placeholder = document.createElement('span');
    placeholder.textContent = 'No cover selected';
    coverPreview.appendChild(placeholder);
    return;
  }
  const image = document.createElement('img');
  image.src = current.coverPreviewUrl || publicAsset(current.coverImage);
  image.alt = '';
  coverPreview.appendChild(image);
}

function renderGallery() {
  galleryList.replaceChildren();
  if (!current.galleryImages.length) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = 'No gallery images attached to this transmission.';
    galleryList.appendChild(empty);
    return;
  }
  current.galleryImages.forEach((image, index) => galleryList.appendChild(createGalleryRow(image, index)));
}

function createGalleryRow(image: AdminGalleryImage, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'admin-gallery-row';
  row.dataset.galleryIndex = String(index);
  const previewImage = document.createElement('img');
  previewImage.src = image.previewUrl || publicAsset(image.src);
  previewImage.alt = '';
  const fields = document.createElement('div');
  fields.className = 'admin-gallery-row__fields';
  fields.append(fieldForGallery('Alt text', image.alt, 'alt'), fieldForGallery('Caption', image.caption ?? '', 'caption'));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.dataset.galleryRemove = String(index);
  row.append(previewImage, fields, remove);
  return row;
}

function fieldForGallery(labelText: string, value: string, field: 'alt' | 'caption'): HTMLLabelElement {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.value = value;
  input.dataset.galleryField = field;
  input.required = field === 'alt';
  label.append(span, input);
  return label;
}

function renderPreview() {
  const input = collectInput();
  preview.replaceChildren();
  const type = document.createElement('p');
  type.className = 'eyebrow';
  type.textContent = `${input.type.toUpperCase()} // ${input.publishedAt || 'UNSCHEDULED'}`;
  const title = document.createElement('h1');
  title.textContent = input.title || 'Untitled transmission';
  const description = document.createElement('p');
  description.className = 'article-header__description';
  description.textContent = input.description;
  preview.append(type, title, description);
  if (input.coverImage) {
    const cover = document.createElement('img');
    cover.src = input.coverPreviewUrl || publicAsset(input.coverImage);
    cover.alt = '';
    preview.appendChild(cover);
  }
  const content = document.createElement('div');
  content.innerHTML = markdownToPreviewHtml(input.bodyMarkdown, bootstrap.config.basePath);
  preview.appendChild(content);
  if (input.galleryImages.length) {
    const heading = document.createElement('h2');
    heading.textContent = 'Visual records';
    preview.appendChild(heading);
    const gallery = document.createElement('div');
    gallery.className = 'admin-preview-gallery';
    input.galleryImages.forEach((item) => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = item.previewUrl || publicAsset(item.src);
      image.alt = item.alt;
      figure.appendChild(image);
      if (item.caption) {
        const caption = document.createElement('figcaption');
        caption.textContent = item.caption;
        figure.appendChild(caption);
      }
      gallery.appendChild(figure);
    });
    preview.appendChild(gallery);
  }
}

function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    if (editingMode === 'preview') renderPreview();
  }, 160);
}

function showValidation(errors: string[]) {
  validation.replaceChildren();
  const heading = document.createElement('strong');
  heading.textContent = 'Resolve these items before saving:';
  const list = document.createElement('ul');
  errors.forEach((error) => {
    const item = document.createElement('li');
    item.textContent = error;
    list.appendChild(item);
  });
  validation.append(heading, list);
  validation.hidden = false;
  validation.focus();
}

function setPublishing(status: PublishingStatus) {
  publishing.hidden = false;
  publishing.classList.toggle('admin-alert--error', status.state === 'failed');
  publishing.classList.toggle('admin-alert--warning', status.state === 'mock-saved');
  publishing.textContent = `${status.state.replace(/-/g, ' ').toUpperCase()} // ${status.message}`;
  if (status.commitUrl || status.deploymentUrl) {
    publishing.append(' ');
    const link = document.createElement('a');
    link.href = status.deploymentUrl || status.commitUrl || '#';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = status.deploymentUrl ? 'Open deployment' : 'Open commit';
    publishing.appendChild(link);
  }
}

async function trackPublishing(operationId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
    try {
      const status = await service.getPublishingStatus(operationId);
      setPublishing(status);
      if (['published', 'failed', 'mock-saved'].includes(status.state)) return;
    } catch (error) {
      setPublishing({ state: 'failed', message: errorMessage(error) });
      return;
    }
  }
  setPublishing({ state: 'failed', message: 'Publishing status timed out. Check the repository workflow before retrying.' });
}

function showDashboard() {
  editorSection.hidden = true;
  dashboard.hidden = false;
  required<HTMLButtonElement>('[data-admin-route="dashboard"]').classList.add('is-active');
}

function showEditor() {
  dashboard.hidden = true;
  editorSection.hidden = false;
  required<HTMLButtonElement>('[data-admin-route="dashboard"]').classList.remove('is-active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateDescriptionCount() {
  descriptionCount.textContent = `${formField<HTMLTextAreaElement>('description').value.length} / 320`;
}

function publicAsset(path: string): string {
  return path.startsWith('/') ? `${bootstrap.config.basePath}${path}`.replace(/\/\/{2,}/g, '/') : path;
}

function cloneInput(transmission: AdminTransmission): AdminTransmissionInput {
  const { id: _id, revision: _revision, createdAt: _createdAt, ...input } = structuredClone(transmission);
  return input;
}

function optionalValue(value: string): string | undefined {
  return value.trim() || undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The admin operation failed unexpectedly.';
}

function showToast(message: string) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4800);
}

function setBusy(button: HTMLButtonElement | null | undefined, busy: boolean, busyLabel = 'Working…') {
  if (!button) return;
  if (busy) button.dataset.idleLabel = button.textContent ?? '';
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.idleLabel || button.textContent;
}

function formField<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(name: string): T {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLElement)) throw new Error(`Admin form field “${name}” is missing.`);
  return field as T;
}

function required<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required admin element missing: ${selector}`);
  return element;
}
