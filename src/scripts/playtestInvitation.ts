export {};
let fragment = location.hash;
// Clear the private fragment before any interactions or navigation. This page
// makes no enrollment requests and uses no browser storage or third-party assets.
history.replaceState(null, '', location.pathname);
const originInput = document.querySelector<HTMLInputElement>('[data-invite-origin]')!;
const codeInput = document.querySelector<HTMLInputElement>('[data-invite-code]')!;
const values = document.querySelector<HTMLElement>('[data-invite-values]')!;
const message = document.querySelector<HTMLElement>('[data-invite-message]')!;
function clear() { codeInput.value = ''; originInput.value = ''; values.hidden = true; message.textContent = 'Invitation cleared from this page. Ask staff for a fresh private invitation if you need one.'; }
try {
  const params = new URLSearchParams(fragment.slice(1)), entries = [...params];
  const code = params.get('invitation') ?? '', origin = new URL(params.get('api') ?? '');
  if (fragment.length > 1024 || entries.length !== 2 || params.getAll('invitation').length !== 1 || params.getAll('api').length !== 1 || !/^[A-Za-z0-9_-]{32,256}$/.test(code) || origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error();
  codeInput.value = code; originInput.value = origin.origin; values.hidden = false;
  message.textContent = 'Keep these details private. Acceptance and installation enrollment happen only in your game. Staff can help if the invitation has expired or was already used.';
} catch { if (fragment) message.textContent = 'This invitation link could not be read. Ask staff for a fresh private link.'; }
fragment = '';
document.querySelector('[data-clear-invite]')!.addEventListener('click', clear);
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
