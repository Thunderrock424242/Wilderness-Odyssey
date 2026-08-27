import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTransmissionDraft } from '../src/lib/admin/cms';
import {
  detectImageType,
  LocalTransmissionRepository,
  parseTransmissionMarkdown,
  startLocalAdminServer,
} from '../scripts/local-admin-server';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local transmission repository', () => {
  it('round-trips the real Markdown schema without replacing the body', async () => {
    const source = await readFile(join(process.cwd(), 'src', 'content', 'transmissions', 'first-public-terminal-build.md'), 'utf8');
    const transmission = parseTransmissionMarkdown('first-public-terminal-build', source);

    expect(transmission.slug).toBe('first-public-terminal-build');
    expect(transmission.title).toBeTruthy();
    expect(transmission.bodyMarkdown).toContain('The terminal is not just decoration.');
    expect(transmission.revision).toMatch(/^[a-f0-9]{12}$/);
  });

  it('saves drafts to the content directory and supports a controlled slug rename', async () => {
    const root = await createTemporaryRepository();
    const repository = new LocalTransmissionRepository(root);
    const draft = {
      ...createTransmissionDraft('Local Operator', new Date('2026-08-26T12:00:00Z')),
      slug: 'first-local-draft',
      title: 'First Local Draft',
      description: 'A complete local editor persistence test record.',
      tags: ['local-editor'],
      bodyMarkdown: '## Field notes\n\nSaved from the local repository service.',
    };

    const saved = await repository.save(draft);
    expect(saved.paths).toEqual(['src/content/transmissions/first-local-draft.md']);
    expect((await repository.get('first-local-draft')).bodyMarkdown).toContain('Saved from the local repository service.');

    const renamed = await repository.save({ ...draft, slug: 'renamed-local-draft', title: 'Renamed Local Draft' }, 'first-local-draft');
    expect(renamed.paths).toContain('src/content/transmissions/renamed-local-draft.md');
    await expect(repository.get('first-local-draft')).rejects.toThrow('Transmission not found.');
  });

  it('detects supported image bytes instead of trusting the filename', () => {
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ extension: 'png', mimeType: 'image/png' });
    expect(detectImageType(Buffer.from('not-an-image'))).toBeUndefined();
  });
});

describe('local admin HTTP boundary', () => {
  it('auto-authenticates the local operator and writes a CSRF-protected draft', async () => {
    const root = await createTemporaryRepository();
    const origin = 'http://127.0.0.1:4321';
    const local = await startLocalAdminServer({ root, port: 0, allowedOrigins: [origin] });
    try {
      expect(local.apiBase).not.toMatch(/:0$/);
      const sessionResponse = await fetch(`${local.apiBase}/api/admin/session`, { headers: { Origin: origin } });
      const session = await sessionResponse.json() as { authenticated: boolean; csrfToken: string };
      expect(session.authenticated).toBe(true);
      expect(session.csrfToken).toBeTruthy();

      const input = {
        ...createTransmissionDraft('Local Operator', new Date('2026-08-26T12:00:00Z')),
        slug: 'http-local-draft',
        title: 'HTTP Local Draft',
        description: 'A draft saved through the protected loopback endpoint.',
        tags: ['local-editor'],
        bodyMarkdown: '## Protected draft\n\nThe request reached the local repository.',
      };
      const rejected = await fetch(`${local.apiBase}/api/admin/transmissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify(input),
      });
      expect(rejected.status).toBe(403);

      const saved = await fetch(`${local.apiBase}/api/admin/transmissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin, 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify(input),
      });
      const result = await saved.json() as { publishing: { state: string }; transmission: { id: string } };
      expect(saved.status).toBe(201);
      expect(result.transmission.id).toBe('http-local-draft');
      expect(result.publishing.state).toBe('local-saved');
      expect(await readFile(join(root, 'src', 'content', 'transmissions', 'http-local-draft.md'), 'utf8')).toContain('The request reached the local repository.');

      const mediaForm = new FormData();
      mediaForm.set('file', new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'field-capture.png', { type: 'image/png' }));
      mediaForm.set('slug', input.slug);
      mediaForm.set('purpose', 'body');
      const uploaded = await fetch(`${local.apiBase}/api/admin/media`, {
        method: 'POST',
        headers: { Origin: origin, 'X-CSRF-Token': session.csrfToken },
        body: mediaForm,
      });
      const media = await uploaded.json() as { mimeType: string; src: string };
      expect(uploaded.status).toBe(201);
      expect(media.mimeType).toBe('image/png');
      expect(media.src).toMatch(/^\/images\/transmissions\/http-local-draft\/field-capture-[a-f0-9]{10}\.png$/);
      await expect(readFile(join(root, 'public', ...media.src.slice(1).split('/')))).resolves.toHaveLength(8);
    } finally {
      await local.close();
    }
  });
});

async function createTemporaryRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'wo-local-admin-'));
  temporaryRoots.push(root);
  await Promise.all([
    mkdir(join(root, 'src', 'content', 'transmissions'), { recursive: true }),
    mkdir(join(root, 'public'), { recursive: true }),
  ]);
  return root;
}
