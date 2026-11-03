import { contentSetupSchema } from '../../contracts/v1/content';
import { authoringShell } from '../lib/admin/authoringShell';
import { AdminApiError } from '../lib/admin/types';
let setup: ReturnType<typeof contentSetupSchema.parse> | null = null;
const shell = authoringShell(async api => {
  try { render(await api.request('/content/setup',contentSetupSchema)); }
  catch (error) {
    if (error instanceof AdminApiError && [401,403].includes(error.status)) throw error;
    status.textContent = 'The setup check could not complete. Confirm the latest bot branch is deployed on Kinetic, then refresh. The guide below is still available.';
    publication.textContent = 'Publication readiness could not be checked.';
  }
});
const status = shell.root.querySelector<HTMLElement>('[data-content-setup]')!;
const publication = shell.root.querySelector<HTMLElement>('[data-content-publication-status]')!;
const acknowledge = shell.root.querySelector<HTMLInputElement>('[data-content-import-ack]')!;
const button = shell.root.querySelector<HTMLButtonElement>('[data-content-import]')!;
function update() { button.disabled = !setup || setup.imported || !acknowledge.checked || !shell.api.can('content:write'); }
function render(value: NonNullable<typeof setup>) {
  setup = value; acknowledge.checked = false; acknowledge.disabled = value.imported;
  status.textContent = value.imported ? 'Website source imported. ' + value.transmissionCount + ' transmissions and ' + value.pageCount + ' editable page collections are available.' : 'Website source has not been imported. ' + value.transmissionCount + ' private drafts are already stored. Import once to prepare the existing website content.';
  publication.textContent = value.publicationConfigured ? 'GitHub publication is configured. Saving a draft remains separate from requesting a reviewed publication.' : 'Draft editing is available. Reviewed publication still needs the GitHub App configuration on Kinetic.';
  update();
}
acknowledge.addEventListener('change',update);
button.addEventListener('click',async () => {
  if (button.disabled) return;
  button.disabled = true; status.textContent = 'Importing the current website source…';
  try { render(await shell.api.request('/content/source',contentSetupSchema,{method:'POST',body:JSON.stringify({acknowledgePublicSource:true})})); }
  catch (error) {
    shell.error(error);
    status.textContent = error instanceof AdminApiError && error.status === 409 ? 'Source was already imported, or a private draft has the same slug. Existing drafts were preserved. Refresh; contact the owner if the import still conflicts.' : 'Import could not be confirmed. Refresh the setup status before trying again.';
    update();
  }
});
void shell.refresh();
