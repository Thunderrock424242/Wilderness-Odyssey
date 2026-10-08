import { capabilitySchema } from '../../../contracts/v1/admin';
import { AdminApiError } from './types';
import { HostedAdminApi } from './hostedApi';
export function authoringShell(load: (api: HostedAdminApi) => Promise<void>) {
  const root = document.querySelector<HTMLElement>('[data-authoring-root]')!, workspace = root.querySelector<HTMLElement>('[data-authoring-workspace]')!, message = root.querySelector<HTMLElement>('[data-authoring-message]')!, signin = root.querySelector<HTMLAnchorElement>('[data-authoring-signin]')!, signout = document.querySelector<HTMLButtonElement>('[data-authoring-signout]')!;
  const api = new HostedAdminApi(); let generation = 0;
  const clear = () => { api.invalidate(); workspace.hidden = true; signin.hidden = false; signout.disabled = true; root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea').forEach(input => { input.value = ''; }); root.querySelector('[data-page-fields]')?.replaceChildren(); document.querySelector('[data-authoring-identity]')!.textContent = 'Not signed in'; };
  function error(value: unknown) { if (value instanceof AdminApiError && [401, 403].includes(value.status)) { generation++; clear(); } message.textContent = value instanceof Error ? value.message : 'This request could not be completed.'; }
  async function refresh() {
    const current = ++generation; workspace.hidden = true; message.textContent = 'Loading verified administrator information…';
    try {
      const session = await api.initialize(); if (current !== generation) return;
      if (!api.can(capabilitySchema.parse(root.dataset.capability))) throw new AdminApiError('Your account cannot access this section.', 403);
      await load(api); if (current !== generation) return;
      document.querySelector('[data-authoring-identity]')!.textContent = session.user.displayName + ' · ' + session.user.role;
      workspace.hidden = false; signin.hidden = true; signout.disabled = false; message.textContent = 'Administrator information loaded.';
    } catch (value) { if (current === generation) error(value); }
  }
  root.querySelector('[data-authoring-refresh]')!.addEventListener('click', () => { void refresh(); });
  signout.addEventListener('click', async () => { generation++; signout.disabled = true; try { await api.logout(); clear(); message.textContent = 'Signed out.'; } catch (value) { clear(); error(value); } });
  return { api, root, error, message, refresh, clear };
}
