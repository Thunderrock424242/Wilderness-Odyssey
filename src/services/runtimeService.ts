import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { closeDb } from '../db';
import { logger } from '../utils/logger';

let discordClient: Client | null = null;
let supportApiServer: Server | null = null;
let shutdownStarted = false;

export function registerRuntime(options: {
  client: Client;
  verificationApiServer: Server | null;
}): void {
  discordClient = options.client;
  supportApiServer = options.verificationApiServer;
}

export function scheduleShutdown(exitCode = 0, delayMs = 750): void {
  const timer = setTimeout(() => shutdown(exitCode), delayMs);
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
