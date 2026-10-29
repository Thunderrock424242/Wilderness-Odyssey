import { describe, expect, it } from 'vitest';
import { publicationState } from '../scripts/publication-status';
import { verifyPublishedSite, verificationTargets } from '../scripts/verify-deployment.mjs';

describe('truthful publishing', () => {
  it('does not call a checks-only workflow published', () => {
    expect(publicationState({ status: 'completed', conclusion: 'success' }).state).toBe('checks-passed');
  });
  it('keeps environment approval separate from publishing', () => {
    expect(publicationState({ status: 'waiting', conclusion: null }, { state: 'pending' }).state).toBe('awaiting-approval');
  });
  it('requires both workflow success and a deployment URL', () => {
    expect(publicationState({ status: 'completed', conclusion: 'success' }, { state: 'success' }).state).not.toBe('published');
    expect(publicationState({ status: 'completed', conclusion: 'success' }, { state: 'success', environment_url: 'https://site.pages.dev' }).state).toBe('published');
    expect(publicationState({ status: 'in_progress', conclusion: null }, { state: 'success', environment_url: 'https://site.pages.dev' }).state).not.toBe('published');
  });
  it('rejects unsafe deployment links', () => {
    expect(publicationState({ status: 'completed', conclusion: 'success' }, { state: 'success', environment_url: 'javascript:alert(1)' }).state).not.toBe('published');
  });
});

describe('deployment verification', () => {
  const sha = 'a'.repeat(40);
  const responder = (unprotected = false, actualSha = sha): typeof fetch => async input => {
    const path = new URL(String(input)).pathname;
    if (path.startsWith('/admin') || path.startsWith('/api/admin')) return new Response('', { status: unprotected ? 200 : 401 });
    if (path === '/revision.json') return Response.json({ commit: actualSha });
    if (path.startsWith('/api/public')) return Response.json({ code: 'STATUS_UNAVAILABLE' }, { status: 503 });
    return new Response('<!doctype html><html><title>Wilderness Odyssey</title></html>', { headers: { 'Content-Type': 'text/html' } });
  };
  it('rejects a different deployed revision', async () => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, responder(false, 'b'.repeat(40)))).rejects.toThrow(/revision/i);
  });
  it('rejects a deployment that exposes a staff page', async () => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, responder(true))).rejects.toThrow(/protect/i);
  });
  it('accepts the matching public artifact with protected staff routes', async () => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, responder())).resolves.toBeUndefined();
  });
  const redirected = (location: string, redirectApis = false, previewPublic = false): typeof fetch => async input => {
    const path = new URL(String(input)).pathname;
    if (path.startsWith('/admin') || (redirectApis && path.startsWith('/api/admin')) || (previewPublic && path === '/')) return new Response(null, { status: 303, headers: { Location: location } });
    return responder()(input);
  };
  it('accepts only the configured production Discord login redirect for staff HTML', async () => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, redirected('/login/'), 'discord')).resolves.toBeUndefined();
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, redirected('https://site.pages.dev/login/'), 'discord')).resolves.toBeUndefined();
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, redirected('/login/'), 'access')).rejects.toThrow(/protect/i);
  });
  it.each(['https://evil.example/login/', '//evil.example/login/', '/login/?next=https://evil.example', '/login/#fragment'])('rejects a changed or external login destination: %s', async location => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, redirected(location), 'discord')).rejects.toThrow(/protect/i);
  });
  it('does not accept login redirects for staff APIs or public previews', async () => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, redirected('/login/', true), 'discord')).rejects.toThrow(/protect/i);
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'preview', {}, redirected('/login/', false, true), 'discord')).rejects.toThrow(/protect/i);
  });
  it.each(['access', 'discord'])('preserves explicit Cloudflare Access protection in %s mode', async mode => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, redirected('https://team.cloudflareaccess.com/cdn-cgi/access/login', true), mode)).resolves.toBeUndefined();
  });

  it('accepts intentionally disabled staff responses on an otherwise working public site', async () => {
    const disabled: typeof fetch = async input => {
      const path = new URL(String(input)).pathname;
      if (path.startsWith('/admin') || path.startsWith('/api/admin') || path.startsWith('/login') || path.startsWith('/api/auth')) return new Response('Staff access is being set up', { status: 503, headers: { 'X-WO-Staff-Mode': 'disabled', 'Cache-Control': 'no-store' } });
      return responder()(input);
    };
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, disabled, 'disabled')).resolves.toBeUndefined();
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, disabled, 'discord')).rejects.toThrow(/protect/i);
  });

  it('rejects public staff routes and generic outages in disabled mode', async () => {
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, responder(true), 'disabled')).rejects.toThrow(/protect/i);
    const broken: typeof fetch = async input => {
      if (new URL(String(input)).pathname.startsWith('/admin')) return new Response('Unexpected failure', { status: 503 });
      return responder()(input);
    };
    await expect(verifyPublishedSite('https://site.pages.dev', sha, 'production', {}, broken, 'disabled')).rejects.toThrow(/protect/i);
  });

  it('checks that generated previews remain inaccessible without requiring preview credentials', async () => {
    const { verifyBlockedPreview } = await import('../scripts/verify-deployment.mjs');
    const unavailable: typeof fetch = async () => new Response('Staff access is being set up', { status: 503, headers: { 'X-WO-Staff-Mode': 'disabled', 'Cache-Control': 'no-store' } });
    await expect(verifyBlockedPreview('https://abc.project.pages.dev', unavailable)).resolves.toBeUndefined();
    await expect(verifyBlockedPreview('https://abc.project.pages.dev', responder())).rejects.toThrow(/protect/i);
    await expect(verifyBlockedPreview('https://abc.project.pages.dev', async () => new Response('Unexpected failure', { status: 503 }))).rejects.toThrow(/protect/i);
  });
});
describe('deployment hostname coverage', () => {
  it('checks canonical production, production Pages, unique deployment, and branch alias hosts', () => {
    expect(verificationTargets({ url: 'https://abc.project.pages.dev', aliases: ['https://website.project.pages.dev'] }, 'project', 'production', 'https://site.example.com')).toEqual([
      { origin: 'https://site.example.com', environment: 'production' },
      { origin: 'https://project.pages.dev', environment: 'production' },
      { origin: 'https://abc.project.pages.dev', environment: 'preview' },
      { origin: 'https://website.project.pages.dev', environment: 'preview' },
    ]);
  });
  it('requires protection for every preview alias', () => {
    expect(verificationTargets({ url: 'https://abc.project.pages.dev', aliases: ['https://preview-ui.project.pages.dev'] }, 'project', 'preview')).toHaveLength(2);
  });
  it('rejects an unexpected host or origin before supplying service credentials', () => {
    expect(() => verificationTargets({ url: 'https://outside.example.com' }, 'project', 'preview')).toThrow();
    expect(() => verificationTargets({ url: 'https://abc.project.pages.dev' }, 'project', 'production', 'https://user:pass@site.example.com')).toThrow();
  });
});
