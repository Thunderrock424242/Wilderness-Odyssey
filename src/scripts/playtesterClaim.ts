import { participantClaimSchema } from '../../contracts/v1/participants';
import { participantRequest, browserParticipantSession, ParticipantError } from '../services/participant';

let fragment = location.hash;
history.replaceState(null, '', location.pathname);
const message = document.querySelector<HTMLElement>('[data-claim-message]')!;
const accept = document.querySelector<HTMLButtonElement>('[data-claim-accept]')!;
const signin = document.querySelector<HTMLElement>('[data-claim-signin]')!;
let token = '', csrf = '';
try { const params = new URLSearchParams(fragment.slice(1)); if (fragment.length > 100 || [...params].length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(params.get('invitation') ?? '')) throw new Error(); token = params.get('invitation')!; }
catch { message.textContent = 'Open the private invitation from your Discord DM. If it expired, ask staff for a new one.'; }
fragment = '';
async function prepare() {
  if (!token) return;
  try { const session = await participantRequest('session', browserParticipantSession); csrf = session.csrfToken; message.textContent = 'Signed in as ' + session.user.displayName + '. Claim only if staff invited this Discord account.'; accept.disabled = false; }
  catch (error) { message.textContent = error instanceof ParticipantError && error.status === 401 ? 'Sign in with Discord, then reopen this invitation from your DM. Your private link is not stored in your browser.' : 'Sign-in is temporarily unavailable. Reopen your DM invitation and try again later.'; signin.hidden = false; }
}
accept.addEventListener('click', async () => { accept.disabled = true; try { await participantRequest('claim', participantClaimSchema, { token }, csrf); token = ''; csrf = ''; message.textContent = 'Invitation claimed. Your playtester home is ready.'; } catch (error) { message.textContent = error instanceof ParticipantError ? error.message : 'This invitation could not be claimed.'; accept.disabled = false; } });
function clear() { token = ''; csrf = ''; accept.disabled = true; }
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', event => { if (event.persisted) { clear(); message.textContent = 'Reopen your private Discord invitation to continue.'; } });
void prepare();
