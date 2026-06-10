import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commands } from './commands';

async function main(): Promise<void> {
  const body = commands.map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  console.log(`Deploying ${body.length} slash commands ${config.guildId ? `to guild ${config.guildId}` : 'globally'}...`);
  await rest.put(route, { body });
  console.log('Slash command deployment complete.');
}

main().catch((error) => {
  console.error('Failed to deploy slash commands:', error);
  process.exitCode = 1;
});
