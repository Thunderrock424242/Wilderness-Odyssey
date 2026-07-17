import path from 'node:path';
import type { Attachment } from 'discord.js';
import { redactLog } from '../../services/logParser';
import type { AetherAttachment } from '../types';

const TRUSTED_DISCORD_ATTACHMENT_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net'
]);

export interface DiagnosticAttachmentPolicy {
  maximumBytes: number;
  allowedFileTypes: string[];
}

export function validateDiagnosticAttachment(
  attachment: Pick<Attachment, 'name' | 'size' | 'contentType' | 'url'>,
  policy: DiagnosticAttachmentPolicy
): { ok: true; extension: string } | { ok: false; reason: string } {
  const extension = path.extname(attachment.name).slice(1).toLowerCase();
  if (!extension || !policy.allowedFileTypes.includes(extension)) {
    return {
      ok: false,
      reason: `Unsupported attachment type. Allowed types: ${policy.allowedFileTypes.map((type) => `.${type}`).join(', ')}.`
    };
  }

  if (attachment.size <= 0 || attachment.size > policy.maximumBytes) {
    return {
      ok: false,
      reason: `The attachment must be no larger than ${formatBytes(policy.maximumBytes)}.`
    };
  }

  if (
    attachment.contentType
    && !attachment.contentType.startsWith('text/')
    && attachment.contentType !== 'application/json'
    && attachment.contentType !== 'application/octet-stream'
  ) {
    return { ok: false, reason: 'The attachment does not have a supported text content type.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(attachment.url);
  } catch {
    return { ok: false, reason: 'The attachment URL is invalid.' };
  }

  if (parsedUrl.protocol !== 'https:' || !TRUSTED_DISCORD_ATTACHMENT_HOSTS.has(parsedUrl.hostname)) {
    return { ok: false, reason: 'Only Discord-hosted HTTPS attachments are accepted.' };
  }

  return { ok: true, extension };
}

export async function readDiagnosticAttachment(
  attachment: Pick<Attachment, 'name' | 'size' | 'contentType' | 'url'>,
  policy: DiagnosticAttachmentPolicy
): Promise<AetherAttachment> {
  const validation = validateDiagnosticAttachment(attachment, policy);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const response = await fetch(attachment.url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'text/plain, application/json;q=0.9' }
  });
  if (!response.ok) {
    throw new Error('Discord did not return the attachment successfully.');
  }

  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > policy.maximumBytes) {
    throw new Error(`The attachment exceeds the ${formatBytes(policy.maximumBytes)} limit.`);
  }

  const buffer = await readLimitedBody(response, policy.maximumBytes);

  if (buffer.includes(0)) {
    throw new Error('Binary or executable attachments are not accepted.');
  }

  return {
    name: attachment.name,
    size: buffer.byteLength,
    mediaType: attachment.contentType ?? 'text/plain',
    content: redactLog(buffer.toString('utf8')),
    reference: attachment.name
  };
}

async function readLimitedBody(response: Response, maximumBytes: number): Promise<Buffer> {
  if (!response.body) {
    throw new Error('Discord returned an empty attachment response.');
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    const chunk = Buffer.from(result.value);
    totalBytes += chunk.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`The attachment exceeds the ${formatBytes(maximumBytes)} limit.`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks, totalBytes);
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${Math.round(value / (1024 * 1024) * 10) / 10} MiB`;
  }
  return `${Math.round(value / 1024)} KiB`;
}
