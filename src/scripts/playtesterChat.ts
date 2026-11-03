import { z } from 'zod';
import * as s from '../../contracts/v1/playtester-chat';
import { ChatApi } from '../lib/admin/chatApi';
import { AdminApiError } from '../lib/admin/types';

const root = document.querySelector<HTMLElement>('[data-authoring-root]')!;
const element = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>('[data-' + name + ']')!;
const workspace = element('authoring-workspace'), notice = element('authoring-message');
let home: z.infer<typeof s.chatHomeSchema> | null = null;
let selected: { campaignId: string; userId: string } | null = null;
let messages: z.infer<typeof s.chatMessageSchema>[] = [];
let before: string | null = null, broadcastId: string | null = null, generation = 0, threadGeneration = 0;
function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string) { const node = document.createElement(tag); node.textContent = value; return node; }
function clear() {
  generation++; threadGeneration++; home = null; selected = null; messages = []; before = null; broadcastId = null;
  workspace.hidden = true; element('chat-owner').hidden = true; element('chat-thread').hidden = true;
  for (const name of ['chat-threads', 'chat-messages', 'chat-admins', 'chat-campaign', 'chat-receipt', 'access-receipt', 'broadcast-receipt']) element(name).replaceChildren();
  for (const form of root.querySelectorAll<HTMLFormElement>('form')) form.reset();
  element('chat-title').textContent = 'Choose a conversation'; element('broadcast-refresh').hidden = true;
}
const api = new ChatApi(fetch, clear);
function errorMessage(error: unknown) { return error instanceof AdminApiError ? error.message : 'The request could not be confirmed. Check the fields and refresh before retrying.'; }
function button(label: string, action: () => Promise<void>) {
  const node = text('button', label); node.type = 'button';
  node.addEventListener('click', async () => { node.disabled = true; try { await action(); } finally { node.disabled = false; } });
  return node;
}
function renderThreads() {
  const list = element('chat-threads'); list.replaceChildren();
  if (!home?.threads.length) list.append(text('p', 'No conversations yet.'));
  for (const thread of home?.threads ?? []) {
    const title = home?.campaigns.find(campaign => campaign.id === thread.campaignId)?.title ?? thread.campaignId;
    const node = button(title + ' · ' + thread.userId, async () => {
      selected = { campaignId: thread.campaignId, userId: thread.userId }; messages = []; before = null;
      element<HTMLFormElement>('chat-reply').reset();
      element('chat-title').textContent = title + ' · ' + thread.userId;
      await loadThread();
    });
    list.append(node, text('p', 'Last message: ' + new Date(thread.lastMessageAt).toLocaleString()));
  }
  element('chat-more').hidden = !home?.nextCursor;
}
function renderMessages() {
  const list = element('chat-messages'); list.replaceChildren();
  for (const message of messages) {
    const article = document.createElement('article');
    article.append(text('h3', (message.direction === 'tester' ? 'Tester' : message.direction === 'update' ? 'Campaign update' : 'Staff ' + (message.authorId ?? 'team')) + ' · ' + message.status), text('time', new Date(message.createdAt).toLocaleString()), text('p', message.body));
    for (const file of message.attachments) article.append(button('Download ' + file.name, async () => {
      const current = generation;
      try {
        const blob = await api.download(file); if (current !== generation) return;
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = file.name.replace(/[\\/\u0000-\u001f]/g, '_'); document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        element('chat-receipt').textContent = 'Private download ready.';
      } catch (error) { element('chat-receipt').textContent = errorMessage(error); }
    }));
    list.append(article);
  }
  if (!messages.length) list.append(text('p', 'No messages in this conversation.'));
  element('chat-older').hidden = !before;
}
async function loadThread(older = false) {
  if (!selected) return;
  const current = ++threadGeneration, selection = selected;
  element('chat-receipt').textContent = 'Loading conversation…';
  if (!older) { element('chat-thread').hidden = true; element('chat-messages').replaceChildren(); }
  try {
    const result = await api.thread(selection.campaignId, selection.userId, older ? before ?? undefined : undefined);
    if (current !== threadGeneration || selected !== selection) return;
    messages = [...new Map([...(older ? [...result.messages, ...messages] : result.messages)].map(message => [message.id, message])).values()];
    before = result.nextCursor; renderMessages(); element('chat-thread').hidden = false; element('chat-receipt').textContent = 'Conversation refreshed.';
  } catch (error) { element('chat-receipt').textContent = errorMessage(error); }
}
function renderOwner() {
  element('chat-owner').hidden = !home?.owner;
  const list = element('chat-admins'); list.replaceChildren();
  if (!home?.owner) return;
  for (const admin of home.admins) {
    const row = text('p', admin.userId + ' · Approved ' + new Date(admin.approvedAt).toLocaleString() + ' ');
    row.append(button('Revoke ' + admin.userId, () => saveAccess(admin.userId, false))); list.append(row);
  }
}
async function saveAccess(userId: string, approved: boolean) {
  try {
    await api.change('/access', s.chatSavedSchema, s.chatAccessInput.parse({ userId, approved }));
    const current = generation; const value = await api.home(); if (current !== generation) return;
    home = { ...value, threads: home?.threads ?? value.threads, nextCursor: home?.nextCursor ?? value.nextCursor }; renderOwner();
    element('access-receipt').textContent = 'Inbox access saved.';
  } catch (error) { element('access-receipt').textContent = errorMessage(error); }
}
async function load() {
  api.invalidate(); const current = generation; notice.textContent = 'Checking private inbox access…';
  try {
    const session = await api.initialize();
    if (session.authMethod !== 'discord' || session.user.role !== 'administrator' || !api.can('server:write')) throw new AdminApiError('Discord administrator access is required.', 403);
    const result = await api.home(); if (current !== generation) return;
    home = result; renderThreads(); renderOwner();
    for (const campaign of result.campaigns) { const option = text('option', campaign.title); option.value = campaign.id; element('chat-campaign').append(option); }
    document.querySelector<HTMLElement>('[data-authoring-identity]')!.textContent = session.user.displayName;
    document.querySelector<HTMLButtonElement>('[data-authoring-signout]')!.disabled = false;
    workspace.hidden = false; notice.textContent = 'Private inbox access verified.';
  } catch (error) { notice.textContent = errorMessage(error); }
}
function form(name: string, action: (values: Record<string, FormDataEntryValue>) => Promise<void>) {
  const node = element<HTMLFormElement>(name);
  node.addEventListener('submit', async event => { event.preventDefault(); const submit = node.querySelector<HTMLButtonElement>('button[type="submit"]')!; submit.disabled = true; try { await action(Object.fromEntries(new FormData(node))); } finally { submit.disabled = false; } });
}
form('chat-reply', async values => {
  if (!selected) return;
  const selection = selected, current = threadGeneration;
  try {
    const value = await api.change('/threads/' + selection.campaignId + '/' + selection.userId + '/reply', s.chatReplySchema, s.chatReplyInput.parse(values));
    if (selection !== selected || current !== threadGeneration) return;
    if (value.message.campaignId !== selection.campaignId || value.message.userId !== selection.userId) throw new AdminApiError('This reply could not be verified.', 502);
    messages = [...new Map([...messages, value.message].map(message => [message.id, message])).values()]; renderMessages(); element<HTMLFormElement>('chat-reply').reset();
    element('chat-receipt').textContent = 'Reply ' + value.message.status + '. Refresh the conversation to check delivery.';
  } catch (error) { element('chat-receipt').textContent = errorMessage(error); }
});
form('chat-access', values => saveAccess(String(values.userId), true));
form('chat-broadcast', async values => {
  const current = generation;
  try {
    const value = await api.change('/broadcasts', s.chatBroadcastSchema, s.chatBroadcastInput.parse(values)); if (current !== generation) return;
    broadcastId = value.broadcastId; element('broadcast-refresh').hidden = false;
    element('broadcast-receipt').textContent = 'Update queued for ' + value.recipients + ' recipients. Refresh delivery to check outcomes.';
    element<HTMLFormElement>('chat-broadcast').reset();
  } catch (error) { element('broadcast-receipt').textContent = errorMessage(error); }
});
element('broadcast-refresh').addEventListener('click', async () => {
  const id = broadcastId, current = generation; if (!id) return;
  try { const value = await api.request('/playtester-chat/broadcasts/' + id, s.chatDeliverySchema); if (current !== generation || broadcastId !== id) return; if (value.broadcastId !== id) throw new AdminApiError('This delivery receipt could not be verified.', 502); element('broadcast-receipt').textContent = Object.entries(value.counts).map(([key, count]) => key + ': ' + count).join(' · '); }
  catch (error) { element('broadcast-receipt').textContent = errorMessage(error); }
});
element('chat-more').addEventListener('click', async () => {
  if (!home?.nextCursor) return;
  const current = generation, cursor = home.nextCursor;
  const node = element<HTMLButtonElement>('chat-more'); node.disabled = true;
  try { const value = await api.home(cursor); if (current !== generation || !home) return; home = { ...value, threads: [...new Map([...home.threads, ...value.threads].map(thread => [thread.campaignId + '/' + thread.userId, thread])).values()] }; renderThreads(); renderOwner(); }
  catch (error) { notice.textContent = errorMessage(error); } finally { node.disabled = false; }
});
element('chat-refresh').addEventListener('click', () => { void loadThread(); });
element('chat-older').addEventListener('click', () => { void loadThread(true); });
element('authoring-refresh').addEventListener('click', () => { void load(); });
document.querySelector('[data-authoring-signout]')!.addEventListener('click', async () => { clear(); try { await api.logout(); location.assign('/login/?signed_out=1'); } catch { notice.textContent = 'Sign-out could not be confirmed. Close this page and wait for the session to expire.'; } });
window.addEventListener('pagehide', () => api.invalidate());
window.addEventListener('pageshow', event => { if (event.persisted) void load(); });
void load();
