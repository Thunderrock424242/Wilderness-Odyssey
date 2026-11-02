import { HostedAdminApi } from '../lib/admin/hostedApi';
import { participantInviteInput, participantInviteSchema, participantRevokeInput, participantRevokeSchema, participantContentInput, participantContentSchema } from '../../contracts/v1/participants';
import { AdminApiError } from '../lib/admin/types';
const root = document.querySelector<HTMLElement>('[data-authoring-root]')!;
const workspace = root.querySelector<HTMLElement>('[data-authoring-workspace]')!;
const message = root.querySelector<HTMLElement>('[data-authoring-message]')!;
const fallback = root.querySelector<HTMLAnchorElement>('[data-invite-fallback]')!;
function clear() { workspace.hidden = true; fallback.hidden = true; fallback.removeAttribute('href'); }
const api = new HostedAdminApi(fetch, clear);
async function load() {
  clear();
  try { const session = await api.initialize(); if (session.user.role !== 'administrator' || !api.can('server:write')) throw new AdminApiError('Administrator access is required.',403); workspace.hidden = false; message.textContent = 'Administrator access verified.'; document.querySelector<HTMLElement>('[data-authoring-identity]')!.textContent = session.user.displayName; document.querySelector<HTMLButtonElement>('[data-authoring-signout]')!.disabled = false; }
  catch(error) { message.textContent = error instanceof AdminApiError ? error.message : 'Access could not be verified.'; }
}
for (const action of ['invite','content','revoke'] as const) {
  const form = root.querySelector<HTMLFormElement>('[data-member-' + action + ']')!;
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector<HTMLButtonElement>('button')!; button.disabled = true;
    const receipt = root.querySelector<HTMLElement>('[data-' + action + '-receipt]')!; receipt.textContent = 'Submitting…';
    fallback.hidden = true; fallback.removeAttribute('href');
    try {
      const values = Object.fromEntries(new FormData(form));
      if (action === 'invite') {
        const input = participantInviteInput.parse({ ...values, expiresInHours: Number(values.expiresInHours) });
        const result = await api.request('/participant-staff/invite', participantInviteSchema, { method: 'POST', body: JSON.stringify(input) });
        receipt.textContent = result.delivery === 'sent' ? 'Invitation sent by DM. Only the selected Discord account can claim it.' : 'DM delivery could not be confirmed. Privately share the account-bound fallback link with the selected person.';
        const url = new URL(result.claimUrl);
        if (url.origin !== location.origin || url.pathname !== '/playtester/claim/' || !/^#invitation=[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new Error();
        if (result.delivery !== 'sent') { fallback.href = url.href; fallback.hidden = false; }
      } else if (action === 'content') {
        const input = participantContentInput.parse({ ...values, tasks: String(values.tasks).split('\n').map(line => line.trim()).filter(Boolean) });
        await api.request('/participant-staff/content', participantContentSchema, { method:'POST', body: JSON.stringify(input) }); receipt.textContent = 'Playtester instructions saved.';
      } else {
        const input = participantRevokeInput.parse(values);
        await api.request('/participant-staff/revoke', participantRevokeSchema, { method:'POST', body:JSON.stringify(input) }); receipt.textContent = 'Website membership and pending claims revoked.';
      }
    } catch(error) { receipt.textContent = error instanceof AdminApiError ? error.message : 'Check the account, campaign and field lengths. No change has been confirmed.'; }
    finally { button.disabled = false; }
  });
}
root.querySelector('[data-authoring-refresh]')!.addEventListener('click', () => { void load(); });
document.querySelector('[data-authoring-signout]')!.addEventListener('click', async () => { clear(); try { await api.logout(); location.assign('/login/?signed_out=1'); } catch { message.textContent = 'Sign-out could not be confirmed. Close this page and wait for your session to expire.'; } });
window.addEventListener('pagehide', () => { api.invalidate(); clear(); });
window.addEventListener('pageshow', event => { if(event.persisted) void load(); });
void load();
