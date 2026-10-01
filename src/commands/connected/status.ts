import { SlashCommandBuilder } from 'discord.js';
import { getConnected } from '../../connected/runtime';
import type { SlashCommand } from '../../types';
import { baseEmbed } from '../../utils/embeds';
import { noMentions } from './common';

export function connectedStatusEmbed() {
  const runtime = getConnected();
  const state = runtime?.config.enabled ? runtime.monitor.publicStatus() : null;
  const mc = state?.minecraft, ai = state?.aether;
  const checked = (at: string | null | undefined) => at ? '<t:' + Math.floor(Date.parse(at) / 1000) + ':R>' : 'No recent observation';
  const availability = (value: boolean | null | undefined) => value == null ? 'Unknown' : value ? 'Available' : 'Unavailable';
  return baseEmbed('Wilderness Odyssey services', 'Status reflects recent service observations.')
    .addFields(
      { name: 'Minecraft', value: (mc?.status ?? 'unknown') + '\n' + checked(mc?.checked_at), inline: true },
      { name: 'Players', value: mc?.players_online != null && mc.players_max != null ? mc.players_online + ' / ' + mc.players_max : 'Unavailable', inline: true },
      { name: 'Performance', value: 'TPS: ' + (mc?.tps ?? 'Unavailable') + '\nMSPT: ' + (mc?.mspt ?? 'Unavailable'), inline: true },
      { name: 'Running versions', value: 'Minecraft: ' + (mc?.minecraft_version ?? 'Unknown') + '\nModpack: ' + (mc?.modpack_version ?? 'Unknown') },
      { name: 'Aether', value: (ai?.status ?? 'unknown') + '\n' + checked(ai?.checked_at), inline: true },
      { name: 'AI readiness', value: 'Ollama: ' + availability(ai?.ollama_reachable) + '\nInference: ' + availability(ai?.inference_available) + '\nNew requests: ' + (ai?.requests_paused == null ? 'Unknown' : ai.requests_paused ? 'Paused' : 'Allowed'), inline: true },
      { name: 'Latest inference latency', value: ai?.latency_ms == null ? 'Unavailable' : ai.latency_ms + ' ms', inline: true },
      { name: 'Maintenance', value: !state ? 'Unknown' : state.maintenance.active ? state.maintenance.message.slice(0, 1000) || 'Maintenance active' : 'No active maintenance' },
    );
}
export const playersCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('players').setDescription('Show current official Minecraft player counts.'),
  async execute(interaction) {
    const runtime = getConnected();
    const mc = runtime?.config.enabled ? runtime.monitor.publicStatus().minecraft : null;
    const content = mc?.players_online != null && mc.players_max != null
      ? 'Minecraft players: ' + mc.players_online + ' / ' + mc.players_max + '. Checked <t:' + Math.floor(Date.parse(mc.checked_at!) / 1000) + ':R>.'
      : 'Minecraft player counts are unavailable. Try again when monitoring has a fresh observation.';
    await interaction.reply({ content, allowedMentions: noMentions });
  },
};
