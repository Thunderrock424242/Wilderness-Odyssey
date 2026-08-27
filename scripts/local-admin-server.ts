import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { ROADMAP_ITEMS } from '../src/data/roadmap';
import { TRANSMISSION_TYPES, type TransmissionType } from '../src/data/site';
import {
  generateTransmissionMarkdown,
  MAX_IMAGE_BYTES,
  normalizeTags,
  toTransmissionSummary,
  transmissionSlug,
  validateTransmission,
} from '../src/lib/admin/cms';
import type {
  AdminGalleryImage,
  AdminMediaPurpose,
  AdminMediaUpload,
  AdminMutationResult,
  AdminSession,
  AdminTransmission,
  AdminTransmissionInput,
  AdminTransmissionSummary,
  PublishingStatus,
} from '../src/lib/admin/types';

const execFileAsync = promisify(execFile);
const DEFAULT_SITE_ORIGIN = 'http://127.0.0.1:4321';
const SITE_BASE = '/Wilderness-Odyssey';
const DEFAULT_API_PORT = 4322;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MEDIA_REQUEST_OVERHEAD = 1024 * 1024;
const WORKFLOW_NAME = 'Deploy Wilderness Odyssey Website';
const DEPLOYMENT_URL = 'https://thunderrock424242.github.io/Wilderness-Odyssey/';
const ROADMAP_IDS = ROADMAP_ITEMS.map((item) => item.id);

type LocalAdminServerOptions = {
  root?: string;
  port?: number;
  allowedOrigins?: string[];
};

type LocalAdminServer = {
  apiBase: string;
  close(): Promise<void>;
  server: Server;
};

type StoredOperation = {
  sha: string;
  repository: string;
  status: PublishingStatus;
  lastCheckedAt: number;
};

type GitPublishResult = {
  operationId?: string;
  status: PublishingStatus;
};

type ParsedFrontmatter = Record<string, unknown>;

export class LocalTransmissionRepository {
  readonly contentDirectory: string;
  readonly publicDirectory: string;

  constructor(readonly root: string) {
    this.contentDirectory = join(root, 'src', 'content', 'transmissions');
    this.publicDirectory = join(root, 'public');
  }

  async list(): Promise<AdminTransmissionSummary[]> {
    const entries = await readdir(this.contentDirectory, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => this.get(entry.name.slice(0, -3))),
    );
    return records
      .map(toTransmissionSummary)
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || left.title.localeCompare(right.title));
  }

  async get(id: string): Promise<AdminTransmission> {
    assertSlug(id);
    const path = this.transmissionPath(id);
    try {
      const [source, details] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
      return parseTransmissionMarkdown(id, source, details.birthtime.toISOString());
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') throw new LocalAdminError('Transmission not found.', 404, 'NOT_FOUND');
      throw error;
    }
  }

  async save(input: AdminTransmissionInput, currentId?: string): Promise<{ paths: string[]; transmission: AdminTransmission }> {
    const summaries = await this.list();
    const errors = validateTransmission(input, ROADMAP_IDS, summaries.map((item) => item.id), currentId);
    if (errors.length) throw new LocalAdminError(errors.join(' '), 400, 'VALIDATION_FAILED');
    if (currentId) assertSlug(currentId);

    const cleaned = cleanTransmissionInput(input);
    const destination = this.transmissionPath(cleaned.slug);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, generateTransmissionMarkdown(cleaned), 'utf8');

    const paths = [this.relativePath(destination)];
    if (currentId && currentId !== cleaned.slug) {
      const previous = this.transmissionPath(currentId);
      try {
        await unlink(previous);
        paths.push(this.relativePath(previous));
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT') throw error;
      }
    }
    paths.push(...this.assetPaths(cleaned));
    return { transmission: await this.get(cleaned.slug), paths: unique(paths) };
  }

  async remove(id: string): Promise<{ paths: string[]; transmission: AdminTransmission }> {
    const transmission = await this.get(id);
    const path = this.transmissionPath(id);
    await unlink(path);
    return { transmission, paths: [this.relativePath(path)] };
  }

  async storeMedia(fileName: string, declaredMimeType: string, bytes: Buffer, slug: string): Promise<AdminMediaUpload> {
    assertSlug(slug);
    if (bytes.length > MAX_IMAGE_BYTES) throw new LocalAdminError('Images must be 12 MB or smaller.', 413, 'MEDIA_TOO_LARGE');
    const detected = detectImageType(bytes);
    if (!detected || detected.mimeType !== declaredMimeType) {
      throw new LocalAdminError('The uploaded file does not match a supported image format.', 400, 'INVALID_MEDIA');
    }
    const stem = transmissionSlug(fileName.replace(/\.[^.]+$/, '')) || 'media';
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const publicPath = `/images/transmissions/${slug}/${stem}-${digest}.${detected.extension}`;
    const destination = this.publicAssetPath(publicPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    return {
      src: publicPath,
      previewUrl: `${DEFAULT_SITE_ORIGIN}${SITE_BASE}${publicPath}`,
      fileName: `${stem}-${digest}.${detected.extension}`,
      mimeType: detected.mimeType,
      kind: 'image',
    };
  }

  private transmissionPath(id: string): string {
    return containedPath(this.root, join(this.contentDirectory, `${id}.md`));
  }

  private publicAssetPath(sitePath: string): string {
    if (!sitePath.startsWith('/images/')) throw new LocalAdminError('Only site image paths can be published.', 400, 'INVALID_ASSET_PATH');
    return containedPath(this.publicDirectory, join(this.publicDirectory, sitePath.slice(1)));
  }

  private assetPaths(input: AdminTransmissionInput): string[] {
    const sitePaths = [
      input.coverImage,
      ...input.galleryImages.map((image) => image.src),
      ...extractMarkdownImagePaths(input.bodyMarkdown),
    ].filter((path): path is string => Boolean(path?.startsWith('/images/')));
    return unique(sitePaths.map((path) => this.relativePath(this.publicAssetPath(path))));
  }

  private relativePath(path: string): string {
    return relative(this.root, path).replaceAll('\\', '/');
  }
}

export class LocalGitPublisher {
  private readonly operations = new Map<string, StoredOperation>();
  private preparedRepository = '';

  constructor(private readonly root: string) {}

  async prepare(): Promise<void> {
    const branch = await this.gitText(['branch', '--show-current']);
    if (branch !== 'website') throw new LocalAdminError('Switch to the website branch before publishing.', 409, 'WRONG_BRANCH');
    const staged = await this.gitText(['diff', '--cached', '--name-only']);
    if (staged) throw new LocalAdminError('Unstage existing files before publishing so the admin cannot commit unrelated work.', 409, 'STAGED_CHANGES');

    const remote = await this.gitText(['remote', 'get-url', 'origin']);
    this.preparedRepository = parseGitHubRepository(remote);
    await this.git(['fetch', 'origin', 'website']);
    const localHead = await this.gitText(['rev-parse', 'HEAD']);
    const remoteHead = await this.gitText(['rev-parse', 'origin/website']);
    if (localHead !== remoteHead) {
      throw new LocalAdminError(
        'The local website branch is not synchronized with GitHub. Pull or push the existing branch changes before publishing.',
        409,
        'BRANCH_OUT_OF_SYNC',
      );
    }
  }

  async publish(paths: string[], message: string): Promise<GitPublishResult> {
    const safePaths = unique(paths.filter(Boolean));
    if (!safePaths.length) return { status: localSavedStatus('No repository files changed.') };
    await this.verifySite();
    await this.git(['add', '--', ...safePaths]);
    const staged = await this.gitText(['diff', '--cached', '--name-only']);
    if (!staged) return { status: localSavedStatus('The record already matches the repository.') };

    await this.git(['commit', '-m', message]);
    const sha = await this.gitText(['rev-parse', 'HEAD']);
    try {
      await this.git(['push', 'origin', 'website']);
    } catch (error) {
      throw new LocalAdminError(
        `A local commit was created, but GitHub rejected the push. ${errorMessage(error)}`,
        502,
        'PUSH_FAILED',
      );
    }

    const operationId = randomUUID();
    const commitUrl = `https://github.com/${this.preparedRepository}/commit/${sha}`;
    const status: PublishingStatus = {
      state: 'commit-created',
      message: 'Changes were pushed. GitHub Pages is starting its deployment checks.',
      operationId,
      commitUrl,
    };
    this.operations.set(operationId, { sha, repository: this.preparedRepository, status, lastCheckedAt: 0 });
    return { operationId, status };
  }

  async publishingStatus(operationId: string): Promise<PublishingStatus> {
    const operation = this.operations.get(operationId);
    if (!operation) throw new LocalAdminError('Publishing operation not found in this local session.', 404, 'OPERATION_NOT_FOUND');
    if (Date.now() - operation.lastCheckedAt < 7_500) return operation.status;
    operation.lastCheckedAt = Date.now();

    try {
      const endpoint = new URL(`https://api.github.com/repos/${operation.repository}/actions/runs`);
      endpoint.searchParams.set('head_sha', operation.sha);
      endpoint.searchParams.set('per_page', '10');
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Wilderness-Odyssey-Local-Admin' },
      });
      if (!response.ok) return operation.status;
      const payload = (await response.json()) as { workflow_runs?: GitHubWorkflowRun[] };
      const run = payload.workflow_runs?.find((candidate) => candidate.name === WORKFLOW_NAME && candidate.head_branch === 'website');
      if (!run) return operation.status;
      if (run.status === 'completed' && run.conclusion === 'success') {
        operation.status = {
          state: 'published',
          message: 'GitHub Pages deployed the transmission successfully.',
          operationId,
          commitUrl: operation.status.commitUrl,
          deploymentUrl: DEPLOYMENT_URL,
        };
      } else if (run.status === 'completed') {
        operation.status = {
          state: 'failed',
          message: `The GitHub Pages workflow finished with ${run.conclusion ?? 'an unknown result'}.`,
          operationId,
          commitUrl: operation.status.commitUrl,
        };
      } else {
        operation.status = {
          state: run.status === 'queued' ? 'commit-created' : 'build-running',
          message: run.status === 'queued' ? 'GitHub Pages is waiting to start.' : 'GitHub Pages is validating and deploying the site.',
          operationId,
          commitUrl: operation.status.commitUrl,
        };
      }
    } catch {
      // Keep the last confirmed state when GitHub status cannot be reached.
    }
    return operation.status;
  }

  private async git(args: string[]): Promise<{ stderr: string; stdout: string }> {
    try {
      return await execFileAsync('git', args, { cwd: this.root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    } catch (error) {
      const stderr = isExecError(error) ? error.stderr?.trim() : '';
      throw new LocalAdminError(stderr || `Git command failed: git ${args[0]}`, 500, 'GIT_FAILED');
    }
  }

  private async gitText(args: string[]): Promise<string> {
    return (await this.git(args)).stdout.trim();
  }

  private async verifySite(): Promise<void> {
    try {
      const npmEntry = process.env.npm_execpath;
      if (npmEntry) {
        await execFileAsync(process.execPath, [npmEntry, 'run', 'verify'], {
          cwd: this.root,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        });
      } else {
        await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'verify'], {
          cwd: this.root,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        });
      }
    } catch (error) {
      const details = isExecError(error) ? (error.stderr?.trim() || error.stdout?.trim()) : '';
      throw new LocalAdminError(
        `The website verification failed, so nothing was committed or pushed.${details ? ` ${lastUsefulLine(details)}` : ''}`,
        422,
        'VERIFICATION_FAILED',
      );
    }
  }
}

export async function startLocalAdminServer(options: LocalAdminServerOptions = {}): Promise<LocalAdminServer> {
  const root = resolve(options.root ?? process.cwd());
  const port = options.port ?? DEFAULT_API_PORT;
  const allowedOrigins = new Set(options.allowedOrigins ?? [DEFAULT_SITE_ORIGIN, 'http://localhost:4321']);
  const repository = new LocalTransmissionRepository(root);
  const publisher = new LocalGitPublisher(root);
  const csrfToken = randomBytes(24).toString('base64url');
  let mutationTail: Promise<unknown> = Promise.resolve();

  const session: AdminSession = {
    authenticated: true,
    csrfToken,
    user: { id: 'local-repository', displayName: 'Local Repository Operator', clearance: 'LOCAL FILE + PUBLISH' },
  };

  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => sendError(response, error));
  });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) throw new LocalAdminError('This local admin server rejects the requesting origin.', 403, 'ORIGIN_REJECTED');
    setCorsHeaders(response, origin && allowedOrigins.has(origin) ? origin : DEFAULT_SITE_ORIGIN);
    if (request.method === 'OPTIONS') return sendEmpty(response, 204);

    const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const method = request.method ?? 'GET';
    const isSessionMutation = method === 'POST' && ['/api/admin/login', '/api/admin/logout'].includes(url.pathname);
    if (isMutation(method) && !isSessionMutation && request.headers['x-csrf-token'] !== csrfToken) {
      throw new LocalAdminError('The local admin security token is missing or expired. Reload the page.', 403, 'CSRF_REJECTED');
    }

    if (method === 'GET' && url.pathname === '/api/admin/session') return sendJson(response, session);
    if (method === 'POST' && url.pathname === '/api/admin/login') return sendJson(response, session);
    if (method === 'POST' && url.pathname === '/api/admin/logout') return sendEmpty(response, 204);
    if (method === 'GET' && url.pathname === '/api/admin/transmissions') return sendJson(response, await repository.list());
    if (method === 'GET' && url.pathname.startsWith('/api/admin/publishing/')) {
      return sendJson(response, await publisher.publishingStatus(decodeURIComponent(url.pathname.slice('/api/admin/publishing/'.length))));
    }
    if (method === 'POST' && url.pathname === '/api/admin/media') {
      return serialMutation(async () => sendJson(response, await handleMediaUpload(request, repository), 201));
    }

    const transmissionMatch = url.pathname.match(/^\/api\/admin\/transmissions(?:\/([^/]+))?$/);
    if (transmissionMatch) {
      const id = transmissionMatch[1] ? decodeURIComponent(transmissionMatch[1]) : undefined;
      if (method === 'GET' && id) return sendJson(response, await repository.get(id));
      if (method === 'POST' && !id) {
        return serialMutation(async () => {
          const input = coerceTransmissionInput(await readJson(request));
          return sendJson(response, await saveAndMaybePublish(repository, publisher, input), 201);
        });
      }
      if (method === 'PUT' && id) {
        return serialMutation(async () => {
          const previous = await repository.get(id);
          const input = coerceTransmissionInput(await readJson(request));
          return sendJson(response, await saveAndMaybePublish(repository, publisher, input, previous));
        });
      }
      if (method === 'DELETE' && id) {
        return serialMutation(async () => {
          const previous = await repository.get(id);
          if (!previous.draft) await publisher.prepare();
          const removed = await repository.remove(id);
          if (!previous.draft) await publisher.publish(removed.paths, `Remove transmission: ${previous.title}`);
          return sendEmpty(response, 204);
        });
      }
    }
    throw new LocalAdminError('Local admin endpoint not found.', 404, 'ENDPOINT_NOT_FOUND');
  }

  function serialMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = mutationTail.then(operation, operation);
    mutationTail = next.then(() => undefined, () => undefined);
    return next;
  }

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    apiBase: `http://127.0.0.1:${actualPort}`,
    server,
    close: () => new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
      server.closeAllConnections();
    }),
  };
}

async function saveAndMaybePublish(
  repository: LocalTransmissionRepository,
  publisher: LocalGitPublisher,
  input: AdminTransmissionInput,
  previous?: AdminTransmission,
): Promise<AdminMutationResult> {
  const shouldPublish = !input.draft || previous?.draft === false;
  if (shouldPublish) await publisher.prepare();
  const saved = await repository.save(input, previous?.id);
  if (!shouldPublish) {
    return { transmission: saved.transmission, publishing: localSavedStatus('Draft saved directly to the local repository checkout.') };
  }
  const action = previous?.draft === false && input.draft
    ? 'Unpublish'
    : previous
      ? 'Update transmission'
      : 'Publish transmission';
  const published = await publisher.publish(saved.paths, `${action}: ${input.title}`);
  return { transmission: saved.transmission, publishing: published.status };
}

async function handleMediaUpload(request: IncomingMessage, repository: LocalTransmissionRepository): Promise<AdminMediaUpload> {
  const contentLength = Number(request.headers['content-length']);
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_IMAGE_BYTES + MEDIA_REQUEST_OVERHEAD) {
    throw new LocalAdminError('The media request is missing a safe content length or is too large.', 413, 'MEDIA_TOO_LARGE');
  }
  const webRequest = new Request('http://127.0.0.1/api/admin/media', {
    method: 'POST',
    headers: request.headers as HeadersInit,
    body: Readable.toWeb(request) as BodyInit,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  const data = await webRequest.formData();
  const file = data.get('file');
  const slug = String(data.get('slug') ?? '');
  const purpose = String(data.get('purpose') ?? '') as AdminMediaPurpose;
  if (!(file instanceof File)) throw new LocalAdminError('Choose an image to upload.', 400, 'MEDIA_REQUIRED');
  if (!['cover', 'body', 'gallery'].includes(purpose)) throw new LocalAdminError('Choose a supported media purpose.', 400, 'INVALID_MEDIA_PURPOSE');
  return repository.storeMedia(file.name, file.type, Buffer.from(await file.arrayBuffer()), slug);
}

export function parseTransmissionMarkdown(id: string, source: string, createdAt?: string): AdminTransmission {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new LocalAdminError(`Transmission ${id} does not contain valid frontmatter.`, 500, 'INVALID_SOURCE');
  const parsed = parseYaml(match[1]);
  if (!isRecord(parsed)) throw new LocalAdminError(`Transmission ${id} has invalid frontmatter.`, 500, 'INVALID_SOURCE');
  const data = parsed as ParsedFrontmatter;
  const galleryImages = Array.isArray(data.galleryImages)
    ? data.galleryImages.filter(isRecord).map((image) => cleanGalleryImage(image))
    : [];
  const type = stringValue(data.type) as TransmissionType;
  if (!(TRANSMISSION_TYPES as readonly string[]).includes(type)) {
    throw new LocalAdminError(`Transmission ${id} uses an unsupported type.`, 500, 'INVALID_SOURCE');
  }
  return {
    id,
    slug: id,
    title: stringValue(data.title),
    description: stringValue(data.description),
    publishedAt: dateValue(data.publishedAt),
    ...(data.updatedAt ? { updatedAt: dateValue(data.updatedAt) } : {}),
    type,
    author: stringValue(data.author),
    tags: Array.isArray(data.tags) ? data.tags.map(stringValue).filter(Boolean) : [],
    ...(data.coverImage ? { coverImage: stringValue(data.coverImage) } : {}),
    featured: data.featured === true,
    draft: data.draft === true,
    ...(data.version ? { version: stringValue(data.version) } : {}),
    ...(data.relatedRoadmapItem ? { relatedRoadmapItem: stringValue(data.relatedRoadmapItem) } : {}),
    galleryImages,
    bodyMarkdown: match[2].trim(),
    revision: createHash('sha256').update(source).digest('hex').slice(0, 12),
    ...(createdAt ? { createdAt } : {}),
  };
}

export function coerceTransmissionInput(payload: unknown): AdminTransmissionInput {
  const data = isRecord(payload) ? payload : {};
  return cleanTransmissionInput({
    slug: stringValue(data.slug),
    title: stringValue(data.title),
    description: stringValue(data.description),
    publishedAt: stringValue(data.publishedAt),
    ...(data.updatedAt ? { updatedAt: stringValue(data.updatedAt) } : {}),
    type: stringValue(data.type) as TransmissionType,
    author: stringValue(data.author),
    tags: Array.isArray(data.tags) ? data.tags.map(stringValue) : [],
    ...(data.coverImage ? { coverImage: stringValue(data.coverImage) } : {}),
    featured: data.featured === true,
    draft: data.draft === true,
    ...(data.version ? { version: stringValue(data.version) } : {}),
    ...(data.relatedRoadmapItem ? { relatedRoadmapItem: stringValue(data.relatedRoadmapItem) } : {}),
    galleryImages: Array.isArray(data.galleryImages) ? data.galleryImages.filter(isRecord).map(cleanGalleryImage) : [],
    bodyMarkdown: stringValue(data.bodyMarkdown),
  });
}

function cleanTransmissionInput(input: AdminTransmissionInput): AdminTransmissionInput {
  return {
    slug: input.slug.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    publishedAt: input.publishedAt,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    type: input.type,
    author: input.author.trim(),
    tags: normalizeTags(input.tags),
    ...(input.coverImage ? { coverImage: input.coverImage.trim() } : {}),
    featured: input.featured,
    draft: input.draft,
    ...(input.version?.trim() ? { version: input.version.trim() } : {}),
    ...(input.relatedRoadmapItem?.trim() ? { relatedRoadmapItem: input.relatedRoadmapItem.trim() } : {}),
    galleryImages: input.galleryImages.map((image) => ({
      src: image.src.trim(),
      alt: image.alt.trim(),
      ...(image.caption?.trim() ? { caption: image.caption.trim() } : {}),
    })),
    bodyMarkdown: input.bodyMarkdown.trim(),
  };
}

function cleanGalleryImage(image: Record<string, unknown>): AdminGalleryImage {
  return {
    src: stringValue(image.src),
    alt: stringValue(image.alt),
    ...(image.caption ? { caption: stringValue(image.caption) } : {}),
  };
}

export function detectImageType(bytes: Buffer): { extension: string; mimeType: string } | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: 'jpg', mimeType: 'image/jpeg' };
  const header = bytes.subarray(0, 12).toString('ascii');
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return { extension: 'gif', mimeType: 'image/gif' };
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return { extension: 'webp', mimeType: 'image/webp' };
  if (bytes.length >= 12 && bytes.subarray(4, 12).toString('ascii').match(/^ftyp(?:avif|avis)$/)) return { extension: 'avif', mimeType: 'image/avif' };
  return undefined;
}

function extractMarkdownImagePaths(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\((\/images\/[^\s)]+)(?:\s+[^)]*)?\)/g)].map((match) => decodeURI(match[1]));
}

function containedPath(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw new LocalAdminError('The requested path is outside the Wilderness Odyssey repository.', 400, 'PATH_REJECTED');
  }
  return resolvedCandidate;
}

function assertSlug(value: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new LocalAdminError('Invalid transmission slug.', 400, 'INVALID_SLUG');
}

function parseGitHubRepository(remote: string): string {
  const match = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (!match) throw new LocalAdminError('The origin remote is not a supported GitHub repository.', 409, 'INVALID_REMOTE');
  return match[1];
}

function dateValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return stringValue(value).slice(0, 10);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isExecError(error: unknown): error is Error & { stderr?: string; stdout?: string } {
  return error instanceof Error && 'stderr' in error;
}

function lastUsefulLine(output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? output;
}

function isMutation(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

function localSavedStatus(message: string): PublishingStatus {
  return { state: 'local-saved', message };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BYTES) throw new LocalAdminError('The transmission request is too large.', 413, 'REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new LocalAdminError('The request body is not valid JSON.', 400, 'INVALID_JSON');
  }
}

function setCorsHeaders(response: ServerResponse, origin: string) {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response: ServerResponse, payload: unknown, status = 200) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}

function sendEmpty(response: ServerResponse, status: number) {
  response.writeHead(status);
  response.end();
}

function sendError(response: ServerResponse, error: unknown) {
  const status = error instanceof LocalAdminError ? error.status : 500;
  const code = error instanceof LocalAdminError ? error.code : 'LOCAL_ADMIN_ERROR';
  const message = error instanceof LocalAdminError ? error.message : 'The local repository operation failed unexpectedly.';
  if (!response.headersSent) sendJson(response, { code, message }, status);
  else response.end();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

class LocalAdminError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = 'LOCAL_ADMIN_ERROR',
  ) {
    super(message);
    this.name = 'LocalAdminError';
  }
}

type GitHubWorkflowRun = {
  conclusion: string | null;
  head_branch: string;
  name: string;
  status: string;
};
