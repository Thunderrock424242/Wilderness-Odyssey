import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { closeDb, getDb } from './db';
import { commands } from './commands';
import type { SlashCommand } from './types';
import { handleInteraction } from './events/interactionCreate';
import { handleReady } from './events/ready';
import { handleQuestionMessage } from './services/qaService';
import { startMinecraftVerificationApi } from './services/minecraftVerificationApi';

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
  void handleQuestionMessage(message);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.discordToken).catch((error) => {
  console.error('Failed to log in:', error);
  closeDb();
  process.exitCode = 1;
});

function shutdown(): void {
  console.log('Shutting down Wilderness Oddesy systems.');
  verificationApiServer?.close();
  closeDb();
  client.destroy();
  process.exit(0);
}
