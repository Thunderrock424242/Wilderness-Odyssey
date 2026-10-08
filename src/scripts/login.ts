const messages: Record<string, string> = {
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
