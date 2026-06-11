import type { Collection, Interaction } from 'discord.js';
import type { SlashCommand } from '../types';
import {
  handleBugStatusButton,
  handleBugReportModal,
  handleFeedbackModal,
  handlePerformanceReportModal,
  handleReportActionButton,
  handleReportUpdateModal
} from '../services/reportService';
import { handleHelpComponent } from '../services/helpService';
import { handleStaffModal } from '../commands/staff';
import {
  handlePlaytestPanelModal,
  handlePlaytestReleaseButton
} from '../commands/playtest';
import { handleSupportPanelComponent } from '../commands/supportpanel';
import {
  handleSuggestionModal,
  handleSuggestionVoteButton
} from '../services/suggestionService';

export async function handleInteraction(
  interaction: Interaction,
  commands: Collection<string, SlashCommand>
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) {
        await interaction.reply({
          content: 'That command is not loaded in the local support console.',
          ephemeral: true
        });
        return;
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('bugreport:')) {
        await handleBugReportModal(interaction);
        return;
      }

      if (interaction.customId.startsWith('perfreport:')) {
        await handlePerformanceReportModal(interaction);
        return;
      }

      if (interaction.customId.startsWith('feedback:')) {
        await handleFeedbackModal(interaction);
        return;
      }

      if (interaction.customId.startsWith('suggest:')) {
        await handleSuggestionModal(interaction);
        return;
      }

      if (await handlePlaytestPanelModal(interaction)) {
        return;
      }

      if (await handleReportUpdateModal(interaction)) {
        return;
      }

      if (await handleStaffModal(interaction)) {
        return;
      }
    }

    if (interaction.isStringSelectMenu() || interaction.isButton()) {
      if (interaction.isButton()) {
        if (await handleBugStatusButton(interaction)) {
          return;
        }

        if (await handleSuggestionVoteButton(interaction)) {
          return;
        }

        if (await handleReportActionButton(interaction)) {
          return;
        }

        if (await handlePlaytestReleaseButton(interaction)) {
          return;
        }
      }

      if (interaction.isStringSelectMenu() && await handleSupportPanelComponent(interaction)) {
        return;
      }

      if (await handleHelpComponent(interaction)) {
        return;
      }
    }
  } catch (error) {
    console.error('Interaction handler error:', error);

    if (interaction.isRepliable()) {
      const message = {
        content: 'The support console hit an error while processing that. Please try again or contact staff.',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(message).catch(() => undefined);
      } else {
        await interaction.reply(message).catch(() => undefined);
      }
    }
  }
}
