import { rememberedFetch } from '../services/rememberedFetch';

const messages: Record<string, string> = {
  tester_login_failed: 'Playtester sign-in expired, was cancelled or could not be verified. Start again with Playtester sign-in, then reopen your invitation from Discord.',
  enrollment_required: 'Your account has not enabled dashboard access. Run /dashboard enable in the Wilderness Odyssey Discord server, then sign in again.',
  permission_denied: 'Your account does not currently have dashboard access. Check that you still have Administrator permission in the Wilderness Odyssey Discord server and have run /dashboard enable.',
  login_expired: 'This sign-in attempt or session has expired. Select Sign in with Discord to start again.',
  cancelled: 'Discord sign-in was cancelled. Select Sign in with Discord when you are ready.',
  service_unavailable: 'Discord sign-in is temporarily unavailable. Try again shortly. If this continues, contact the server owner.',
  signed_out: 'You have signed out of the dashboard.',
  logout_unconfirmed: 'You have signed out of this browser, but the service could not confirm session revocation. Run /dashboard disable in Discord to revoke dashboard access and all of your sessions.',
};
const notice = document.querySelector<HTMLElement>('[data-login-message]');
const url = new URL(location.href);
const error = url.searchParams.get('error');
const message = error ? messages[error] : url.searchParams.has('signed_out') ? messages.signed_out : undefined;
if (notice && message) {
  notice.textContent = message;
  notice.hidden = false;
}
// Discard arbitrary URL text and OAuth leftovers; never render supplied text.
if (url.search) history.replaceState(null, '', url.pathname);

const returnTo = url.searchParams.get('returnTo');
if (returnTo && /^\/admin(?:\/[a-z0-9_-]+)*\/?$/.test(returnTo)) {
  if (notice) { notice.hidden = false; notice.textContent = 'Restoring your administrator sign-in…'; }
  void rememberedFetch('/api/admin/v1/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) })
    .then(response => {
      void response.body?.cancel();
      if (response.ok) location.replace(returnTo);
      else if (notice) notice.textContent = response.status === 503 ? messages.service_unavailable : response.status === 403 ? messages.permission_denied : 'Sign in with Discord to continue.';
    }).catch(() => { if (notice) notice.textContent = messages.service_unavailable!; });
}

const form = document.querySelector<HTMLFormElement>('[data-login-form]');
const roles = document.querySelector<HTMLFieldSetElement>('[data-login-roles]');
if (form && roles) {
  roles.hidden = false;
  roles.disabled = false;
  form.addEventListener('formdata', event => event.formData.delete('destination'));
  const update = (role: HTMLInputElement) => {
    const admin = role.value === 'admin';
    form.action = admin ? '/api/auth/discord/start' : '/api/participant/start';
    document.querySelector<HTMLElement>('[data-admin-help]')!.hidden = !admin;
    document.querySelector<HTMLElement>('[data-playtester-help]')!.hidden = admin;
    document.querySelector<HTMLElement>('[data-remember-duration]')!.textContent = 'Remember this device for up to ' + (admin ? '7' : '30') + ' days. Use this only on a device you trust.';
  };
  for (const input of form.querySelectorAll<HTMLInputElement>('[data-login-role]')) input.addEventListener('change', () => update(input));
}
