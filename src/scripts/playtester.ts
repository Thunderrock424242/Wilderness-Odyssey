import { logoutSchema } from '../../contracts/v1/auth';
import { participantHomeSchema, participantHistorySchema } from '../../contracts/v1/participants';
import { participantRequest, browserParticipantSession, ParticipantError } from '../services/participant';

const root = document.querySelector<HTMLElement>('[data-tester-home]')!;
const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const message = element('[data-tester-message]'), workspace = element('[data-tester-workspace]');
const signIn = element('[data-tester-signin]'), logout = element<HTMLButtonElement>('[data-tester-logout]');
const more = element<HTMLButtonElement>('[data-tester-more]');
let csrf = '', cursor: string | null = null, generation = 0;
function text(tag: string, value: string) { const node = document.createElement(tag); node.textContent = value; return node; }
const duration = (seconds: number | null) => seconds === null ? 'Unavailable' : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
const recordedTime = (stats: { recordedSeconds: number; sessions: number; unknownDurationSessions: number }) => stats.sessions > 0 && stats.unknownDurationSessions === stats.sessions ? 'Unavailable' : duration(stats.recordedSeconds);
function clear() { workspace.hidden = true; for (const name of ['stats', 'campaigns', 'invitations', 'history']) element('[data-tester-' + name + ']').replaceChildren(); csrf = ''; cursor = null; more.hidden = true; }
function failure(error: unknown) { clear(); message.textContent = error instanceof ParticipantError ? error.message : 'Your records could not be loaded. Try again.'; signIn.hidden = !(error instanceof ParticipantError && error.status === 401); }
async function history(replace: boolean, current: number, userId: string) {
  const data = await participantRequest('history' + (!replace && cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), participantHistorySchema);
  if (current !== generation) return;
  if (data.userId !== userId) throw new ParticipantError(502);
  const container = element('[data-tester-history]'); if (replace) container.replaceChildren();
  if (!data.sessions.length && replace) container.append(text('p', 'No recorded sessions yet. Your history will appear after your invited game reports sessions.'));
  for (const session of data.sessions) {
    const item = document.createElement('article');
    item.append(text('h3', session.title), text('p', (session.startedAt ? new Date(session.startedAt).toLocaleString() : 'Session date unavailable') + ' · ' + session.state), text('p', 'Build: ' + (session.build ?? 'Unavailable') + ' · Recorded playtime: ' + duration(session.durationSeconds)));
    container.append(item);
  }
  cursor = data.nextCursor; more.hidden = !cursor;
}
let userId = '';
async function load() {
  const current = ++generation; clear(); signIn.hidden = true; logout.hidden = true; message.textContent = 'Loading your playtests…';
  try {
    const session = await participantRequest('session', browserParticipantSession);
    const data = await participantRequest('home', participantHomeSchema);
    if (current !== generation) return;
    if (data.user.id !== session.user.id) throw new ParticipantError(502);
    userId = session.user.id; csrf = session.csrfToken;
    element('[data-tester-heading]').textContent = 'Welcome home, ' + data.user.displayName;
    const stats = element('[data-tester-stats]');
    for (const [label, value] of [['Recorded playtime', recordedTime(data.stats)], ['Recorded sessions', String(data.stats.sessions)], ['Sessions without timing', String(data.stats.unknownDurationSessions)]]) { const card = document.createElement('div'); card.className = 'tester-stat'; card.append(text('strong', value!), text('span', label!)); stats.append(card); }
    const invitations = element('[data-tester-invitations]');
    if (!data.invitations.length) invitations.append(text('p', 'No pending invitations.'));
    for (const invite of data.invitations) invitations.append(text('p', invite.title + ' · Expires ' + new Date(invite.expiresAt).toLocaleString() + '. Open the claim link in your Discord DM.'));
    const campaigns = element('[data-tester-campaigns]');
    if (!data.campaigns.length) campaigns.append(text('p', 'Your home is ready. Claim a staff invitation to see your playtests here.'));
    for (const campaign of data.campaigns) {
      const card = document.createElement('article'); card.className = 'ops-card';
      card.append(text('h3', campaign.title), text('p', recordedTime(campaign.stats) + ' recorded · ' + campaign.stats.sessions + ' sessions'), text('p', campaign.collectionActive ? 'Staff has enabled collection. Your game still needs your consent and enrollment.' : 'Diagnostic collection is currently off.'));
      card.append(text('h4', 'Build instructions'), text('p', campaign.instructions || 'Staff has not posted build instructions yet. Check your Discord invitation.'));
      if (campaign.announcement) card.append(text('h4', 'Latest announcement'), text('p', campaign.announcement));
      if (campaign.tasks.length) { const tasks = document.createElement('ul'); for (const task of campaign.tasks) tasks.append(text('li', task)); card.append(text('h4', 'Things to try'), tasks); }
      campaigns.append(card);
    }
    await history(true, current, userId); if (current !== generation) return;
    workspace.hidden = false; logout.hidden = false; message.textContent = 'Your private playtester records are up to date.';
  } catch (error) { if (current === generation) failure(error); }
}
element('[data-tester-refresh]').addEventListener('click', () => { void load(); });
more.addEventListener('click', async () => { more.disabled = true; try { await history(false, generation, userId); } catch (error) { failure(error); } finally { more.disabled = false; } });
logout.addEventListener('click', async () => { logout.disabled = true; const logoutCsrf = csrf; try { await participantRequest('logout', logoutSchema, {}, csrf); ++generation; clear(); logout.hidden = true; signIn.hidden = false; message.textContent = 'You are signed out.'; } catch { ++generation; clear(); csrf = logoutCsrf; message.textContent = 'Your records are cleared, but server sign-out could not be confirmed. A remembered sign-in may remain valid for up to 30 days. If retrying cannot confirm revocation, contact the server owner.'; } finally { logout.disabled = false; } });
window.addEventListener('pagehide', () => { ++generation; clear(); });
window.addEventListener('pageshow', event => { if (event.persisted) void load(); });
void load();
