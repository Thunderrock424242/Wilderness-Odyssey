import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { closeDb, getDb } from './db';
import { commands } from './commands';
import type { SlashCommand } from './types';
import { handleInteraction } from './events/interactionCreate';
import { handleReady } from './events/ready';
import { captureException, initErrorTracking } from './services/errorTracking';
import { handleCrashIntakeMessage } from './services/crashIntakeService';
import { handleQuestionMessage } from './services/qaService';
import { startMinecraftVerificationApi } from './services/minecraftVerificationApi';
import { logger } from './utils/logger';

initErrorTracking();
getDb();
const verificationApiServer = startMinecraftVerificationApi();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const commandMap = new Collection<string, SlashCommand>();
for (const command of commands) {
  commandMap.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
  void handleReady(readyClient);
});
client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction, commandMap);
});
client.on(Events.MessageCreate, (message) => {
  void (async () => {
    if (await handleCrashIntakeMessage(message)) {
      return;
    }

    await handleQuestionMessage(message);
  })().catch((error) => {
    captureException(error, { source: 'messageCreate', channelId: message.channelId });
  });
});

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
process.on('unhandledRejection', (error) => {
  captureException(error, { source: 'unhandledRejection' });
});
process.on('uncaughtException', (error) => {
  captureException(error, { source: 'uncaughtException' });
  shutdown(1);
});

client.login(config.discordToken).catch((error) => {
  captureException(error, { source: 'clientLogin' });
  closeDb();
  process.exitCode = 1;
});

function shutdown(exitCode = 0): void {
  logger.info('Shutting down Wilderness Oddesy systems.');
  verificationApiServer?.close();
  closeDb();
  client.destroy();
  process.exit(exitCode);
}
