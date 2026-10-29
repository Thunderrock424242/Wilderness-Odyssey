import type { Campaign, HistoryGroup, PlaytestSession, Tester } from '../../../contracts/v1/playtests';
import { dateLabel, durationLabel, observedState, sparkLabels } from './playtestPresentation';

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
export function button(label: string, action: () => void) {
  const node = element('button', label); node.type = 'button'; node.addEventListener('click', action); return node;
}
export function stateView(campaign: Campaign, tester: Tester) {
  const node = element('p'); const state = element('strong', observedState(campaign, tester)); state.dataset.observedState = '';
  const update = () => { state.textContent = observedState(campaign, tester); };
  node.append(state, document.createTextNode(' · Last seen: ' + dateLabel(tester.lastSeenAt) + ' · Last upload: ' + dateLabel(tester.lastUploadAt) + ' · Dropped uploads: ' + (tester.droppedArtifacts ?? 'Not reported')));
  return { node, update };
}
export function profilePath(campaignId: string, testerId: string) { return '/playtests/' + campaignId + '/testers/' + testerId; }
export function artifactPath(session: PlaytestSession, artifactId: string, server = false) { return profilePath(session.campaignId, session.testerId) + '/sessions/' + session.id + (server ? '/server-profiles/' : '/artifacts/') + artifactId; }
function downloadLink(label: string, path: string, id: string, spark: boolean, actions: Actions) {
  const link = element('a', label); link.href = '/api/admin/v1' + path + '/download'; link.referrerPolicy = 'no-referrer';
  link.addEventListener('click', event => { event.preventDefault(); actions.download(path, id, spark); }); return link;
}
type Actions = {
  write: boolean;
  permission: (group: HistoryGroup, value: Tester['permission']) => void;
  notes: (session: PlaytestSession, value: string) => void;
  remove: (group: HistoryGroup) => void;
  log: (session: PlaytestSession, artifactId: string, target: HTMLElement) => void;
  download: (path: string, artifactId: string, spark: boolean) => void;
};
export function historyView(group: HistoryGroup, actions: Actions) {
  const root = element('section'); root.dataset.historyGroup = '';
  root.append(element('h3', group.campaign.title + ' · Build ' + group.campaign.build), element('p', group.tester.label + ' · Reported Minecraft name: ' + (group.tester.reportedName ?? 'Not reported') + ' (unverified)'));
  const state = stateView(group.campaign, group.tester); root.append(state.node);
  root.append(element('p', 'Collection desired: ' + (group.campaign.collect ? 'on' : 'off') + ' · Tester permission: ' + group.tester.permission + ' · Reports retained for up to ' + group.campaign.retentionDays + ' days from capture.'));
  if (actions.write) {
    const label = element('label', 'Collection permission for ' + group.tester.label + ' in ' + group.campaign.title), select = element('select'); select.dataset.requiresWrite = '';
    for (const [value, text] of [['allowed', 'Allow collection with local consent'], ['paused', 'Pause this tester'], ['revoked', 'Revoke this enrollment']]) select.add(new Option(text, value));
    select.value = group.tester.permission;
    select.addEventListener('change', () => { const value = select.value; select.value = group.tester.permission; if (value === 'allowed' || value === 'paused' || value === 'revoked') actions.permission(group, value); });
    label.append(select); root.append(label, element('p', 'Pause retains enrollment. Revocation requires a new private invitation and local consent before collection can resume.'));
    select.dataset.revoked = String(group.tester.permission === 'revoked'); select.disabled = group.tester.permission === 'revoked';
  }
  if (!group.sessions.length) root.append(element('p', 'No sessions have been uploaded for this playtest.'));
  for (const session of group.sessions) root.append(sessionView(session, actions));
  if (actions.write) root.append(button('Delete retained data for ' + group.tester.label + ' in ' + group.campaign.title, () => actions.remove(group)), element('p', 'Deletion removes this tester’s retained session details, logs, crash reports, client recordings and staff notes for this playtest. Shared server recordings have separate retention. Stop or revoke collection first if no new data should arrive.'));
  return { node: root, update: state.update };
}
function sessionView(session: PlaytestSession, actions: Actions) {
  const root = element('article'); root.dataset.sessionCard = '';
  root.append(element('h4', 'Session · ' + dateLabel(session.startedAt)));
  const details = element('section'); details.append(element('h5', 'Session details'), element('p', 'Build: ' + session.build + ' · ' + ({ singleplayer: 'Single-player', multiplayer: 'Multiplayer', unknown: 'Mode not reported' })[session.mode] + ' · Observed session: ' + session.state), element('p', 'Reported mod version: ' + (session.reportedModVersion ?? 'Not reported')), element('p', 'Started: ' + dateLabel(session.startedAt) + ' · Ended: ' + dateLabel(session.endedAt) + ' · Duration: ' + durationLabel(session.durationSeconds)), element('p', 'Upload errors: ' + (session.uploadErrors ?? 'Not reported') + ' · Dropped uploads: ' + (session.droppedArtifacts ?? 'Not reported'))); root.append(details);
  for (const [kind, heading, empty] of [['log', 'Logs', 'No log segments were uploaded.'], ['crash', 'Crash reports', 'No crash report was uploaded.'], ['spark', 'Spark recordings', 'No client Spark recording was uploaded.']] as const) {
    const section = element('section'); section.append(element('h5', heading));
    if (kind === 'spark') section.append(element('p', sparkLabels[session.sparkStatus]));
    const artifacts = session.artifacts.filter(value => value.kind === kind);
    if (!artifacts.length) section.append(element('p', empty));
    for (const artifact of artifacts) {
      const row = element('div'), path = artifactPath(session, artifact.id);
      row.append(element('p', 'Client capture: ' + dateLabel(artifact.capturedAt) + ' · Duration: ' + durationLabel(artifact.durationSeconds) + ' · ' + artifact.bytes + ' bytes'));
      if (kind !== 'spark') {
        const target = element('div');
        row.append(button('View redacted ' + (kind === 'log' ? 'log' : 'crash report'), () => actions.log(session, artifact.id, target)), downloadLink('Download redacted ' + (kind === 'log' ? 'log' : 'crash report'), path, artifact.id, false, actions), target);
      } else row.append(downloadLink('Download client .sparkprofile', path, artifact.id, true, actions));
      section.append(row);
    }
    root.append(section);
  }
  const shared = element('section'); shared.append(element('h5', 'Shared server Spark recordings'), element('p', 'These recordings describe the server during overlapping capture times, not this tester’s client.'));
  if (!session.sharedServerProfiles.length) shared.append(element('p', 'No shared server recording is attached.'));
  for (const profile of session.sharedServerProfiles) shared.append(element('p', 'Server capture: ' + dateLabel(profile.capturedAt) + ' · Duration: ' + durationLabel(profile.durationSeconds)), downloadLink('Download shared server .sparkprofile', artifactPath(session, profile.id, true), profile.id, true, actions));
  root.append(shared);
  const form = element('form'), label = element('label', 'Staff notes'), notes = element('textarea'); notes.value = session.notes; notes.maxLength = 4000; notes.readOnly = !actions.write; label.append(notes); form.append(label);
  if (actions.write) { const submit = element('button', 'Save staff notes'); submit.type = 'submit'; form.dataset.requiresWrite = ''; form.append(submit); form.addEventListener('submit', event => { event.preventDefault(); actions.notes(session, notes.value); }); }
  root.append(form); return root;
}
