import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { closeDb } from '../db';
import { logger } from '../utils/logger';
import { postStaffLog } from './staffLogService';

let discordClient: Client | null = null;
let supportApiServer: Server | null = null;
let shutdownStarted = false;

interface ShutdownAudit {
  source: string;
  requestedBy?: string;
  requestedByTag?: string;
  channelId?: string;
  reason?: string | null;
}

export function registerRuntime(options: {
  client: Client;
  verificationApiServer: Server | null;
}): void {
  discordClient = options.client;
  supportApiServer = options.verificationApiServer;
}

export function scheduleShutdown(exitCode = 0, delayMs = 750, audit?: ShutdownAudit): void {
  const timer = setTimeout(() => {
    void (async () => {
      if (audit && discordClient) {
        await postStaffLog(discordClient, {
          title: 'Bot Shutting Down',
          description: 'The bot process is shutting down now.',
          fields: shutdownAuditFields(audit, exitCode)
        });
      }

      shutdown(exitCode);
    })();
  }, delayMs);
  timer.unref();
}

export function shutdown(exitCode = 0): void {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  logger.info({ exitCode }, 'Shutting down Wilderness Oddesy systems.');
  supportApiServer?.close();
  closeDb();
  discordClient?.destroy();
  process.exit(exitCode);
}

function shutdownAuditFields(audit: ShutdownAudit, exitCode: number) {
  return [
    { name: 'Source', value: audit.source, inline: true },
    { name: 'Exit code', value: exitCode.toString(), inline: true },
    ...(audit.requestedBy
      ? [{ name: 'Requested by', value: `<@${audit.requestedBy}> (${audit.requestedByTag ?? audit.requestedBy})`, inline: true }]
      : []),
    ...(audit.channelId ? [{ name: 'Channel', value: `<#${audit.channelId}>`, inline: true }] : []),
    { name: 'Reason', value: audit.reason ?? 'No reason provided.' }
  ];
}
