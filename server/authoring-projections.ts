import { configurationSchema } from '../contracts/v1/configuration';
import { contentMutationSchema, publicationSchema } from '../contracts/v1/content';

const publicationMessages = {
  'draft-saved': 'Private draft saved. Request publication when ready.',
  requested: 'Publication requested. Source will be submitted for public review.',
  'awaiting-review': 'The pull request is awaiting review and merge.',
  'awaiting-approval': 'Merged. Waiting for deployment approval.',
  deploying: 'Merged. Waiting for the matching website revision to be deployed.',
  published: 'The deployed website confirms this merged revision.',
  failed: 'Publication could not proceed. Reconcile source changes before requesting again.',
  cancelled: 'The request was cancelled. Submitted public artifacts remain in the repository.',
};
export function projectAuthoringResponse(path: string, value: unknown): unknown {
  if (path.startsWith('/configuration')) {
    const data = configurationSchema.parse(value), check = data.verification;
    const messages = { unverified: 'Verify the saved connection before using managed credentials.', verified: check.writeVerified ? 'Read access and the write credential scope are verified.' : 'Read access verified. Write credential scope remains unverified.', unavailable: 'The main server could not be reached or returned an unsupported response.', rejected: 'The main server rejected the connection credential.', 'wrong-server': 'This connection points to a different server.' };
    return { ...data, verification: { ...check, message: messages[check.state] }, bootstrap: data.bootstrap.map(item => ({ ...item, label: ['Encryption key', 'Credential encryption key'].includes(item.label) ? 'Credential encryption key' : 'Host configuration check' })) };
  }
  if (path.endsWith('/publication') || path.startsWith('/content/publications/')) {
    const data = publicationSchema.parse(value); return { ...data, message: publicationMessages[data.state] };
  }
  if (typeof value === 'object' && value !== null && 'publishing' in value) {
    const data = contentMutationSchema.parse(value); return { ...data, publishing: { ...data.publishing, message: publicationMessages['draft-saved'] } };
  }
  return value;
}
