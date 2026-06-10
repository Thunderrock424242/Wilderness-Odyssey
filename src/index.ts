import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { closeDb, getDb } from './db';
import { commands } from './commands';
import type { SlashCommand } from './types';
import { handleInteraction } from './events/interactionCreate';
import { handleReady } from './events/ready';

getDb();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commandMap = new Collection<string, SlashCommand>();
for (const command of commands) {
  commandMap.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => handleReady(readyClient));
client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction, commandMap);
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
  closeDb();
  client.destroy();
  process.exit(0);
}
