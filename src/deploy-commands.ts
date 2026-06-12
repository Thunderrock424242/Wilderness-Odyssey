import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commands } from './commands';
import { captureException, initErrorTracking } from './services/errorTracking';
import { logger } from './utils/logger';

initErrorTracking();

async function main(): Promise<void> {
  const body = commands.map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  logger.info({
    commandCount: body.length,
    guildId: config.guildId ?? null
  }, 'Deploying slash commands.');
  await rest.put(route, { body });
  logger.info('Slash command deployment complete.');
}

main().catch((error) => {
  captureException(error, { source: 'deployCommands' });
  process.exitCode = 1;
});
