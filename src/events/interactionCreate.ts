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
import { handleReportIntakeComponent } from '../services/reportIntakeService';
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
import {
  handleSupportTicketButton,
  handleSupportTicketModal
} from '../services/supportTicketService';
import { captureException } from '../services/errorTracking';
import { interactionCounter } from '../services/metricsService';

export async function handleInteraction(
  interaction: Interaction,
  commands: Collection<string, SlashCommand>
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      interactionCounter.inc({ kind: 'command', name: interaction.commandName });
      const command = commands.get(interaction.commandName);
      if (!command) {
        await interaction.reply({
          content: 'I do not have that command loaded right now. Staff may need to redeploy the bot commands.',
          flags: 'Ephemeral'
        });
        return;
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      interactionCounter.inc({ kind: 'modal', name: interaction.customId.split(':')[0] });
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

      if (await handleSupportTicketModal(interaction)) {
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
      interactionCounter.inc({
        kind: interaction.isButton() ? 'button' : 'select',
        name: interaction.customId.split(':')[0]
      });
      if (interaction.isButton()) {
        if (await handleReportIntakeComponent(interaction)) {
          return;
        }

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

        if (await handleSupportTicketButton(interaction)) {
          return;
        }

        if (await handleSupportPanelComponent(interaction)) {
          return;
        }
      }

      if (interaction.isStringSelectMenu() && await handleReportIntakeComponent(interaction)) {
        return;
      }

      if (interaction.isStringSelectMenu() && await handleSupportPanelComponent(interaction)) {
        return;
      }

      if (await handleHelpComponent(interaction)) {
        return;
      }
    }
  } catch (error) {
    captureException(error, {
      source: 'interaction',
      id: interaction.id,
      type: interaction.type
    });

    if (interaction.isRepliable()) {
      const message = {
        content: 'Sorry, I hit an error while handling that. Please try once more, and if it keeps happening, let staff know.',
        flags: 'Ephemeral'
      } as const;

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(message).catch(() => undefined);
      } else {
        await interaction.reply(message).catch(() => undefined);
      }
    }
  }
}
