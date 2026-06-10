import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { beginBugReport } from '../services/reportService';

export const bugReportCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('bugreport')
    .setDescription('Start an interactive Wilderness Oddesy bug report.')
    .addStringOption((option) =>
      option
        .setName('play_mode')
        .setDescription('Singleplayer or multiplayer?')
        .setRequired(true)
        .addChoices(
          { name: 'Singleplayer', value: 'Singleplayer' },
          { name: 'Multiplayer server', value: 'Multiplayer server' },
          { name: 'LAN', value: 'LAN' },
          { name: 'Not sure', value: 'Not sure' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('minecraft_version')
        .setDescription('Minecraft version, if known.')
        .setMaxLength(80)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('loader_version')
        .setDescription('NeoForge/Forge version, if known.')
        .setMaxLength(120)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('location')
        .setDescription('Optional dimension, coordinates, biome, or nearby place.')
        .setMaxLength(300)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('nearby_feature')
        .setDescription('Was it near special Wilderness Oddesy content?')
        .setRequired(false)
        .addChoices(
          { name: 'Rift', value: 'Rift' },
          { name: 'Anomaly', value: 'Anomaly' },
          { name: 'Cryo facility', value: 'Cryo facility' },
          { name: 'Structure', value: 'Structure' },
          { name: 'Mob', value: 'Mob' },
          { name: 'Custom item', value: 'Custom item' },
          { name: 'Particle accelerator', value: 'Particle accelerator' },
          { name: 'Multiple or unknown', value: 'Multiple or unknown' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('repeatable')
        .setDescription('Can you repeat the issue?')
        .setRequired(false)
        .addChoices(
          { name: 'Yes', value: 'Yes' },
          { name: 'No', value: 'No' },
          { name: 'Sometimes', value: 'Sometimes' },
          { name: 'Not sure', value: 'Not sure' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('spark_link')
        .setDescription('Optional Spark profiler link if this involved lag or freezing.')
        .setMaxLength(300)
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option
        .setName('screenshot')
        .setDescription('Optional screenshot.')
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option
        .setName('log_attachment')
        .setDescription('Optional latest.log or crash report .txt/.log; redacted before storage.')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('playtest_session')
        .setDescription('Optional playtest session ID, like WO-TEST-0001.')
        .setMaxLength(40)
        .setRequired(false)
    ),
  async execute(interaction) {
    await beginBugReport(interaction);
  }
};
