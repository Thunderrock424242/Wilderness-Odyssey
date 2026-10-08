import type { ChatInputCommandInteraction } from 'discord.js';
import { z } from 'zod';
import { getConnected, type ConnectedRuntime } from '../../connected/runtime';
import { authorize, ServiceError } from '../../connected/store';
import type { Capability } from '../../contracts/v1/admin';
export const noMentions = { parse: [] as never[] };
export function connected(enabled = true): ConnectedRuntime {
  const runtime = getConnected();
  if (!runtime || (enabled && !runtime.config.enabled)) throw new ServiceError(503, 'UNAVAILABLE', 'Connected services are unavailable. Try again later.');
  return runtime;
}
export async function staff(runtime: ConnectedRuntime, interaction: ChatInputCommandInteraction, capability: Capability) {
  const actor = interaction.guildId && interaction.guildId === runtime.config.guildId
    ? runtime.store.staff('discord', interaction.user.id) : null;
  if (!actor) {
    runtime.store.audit('discord|' + interaction.user.id, 'discord.command', capability, 'denied');
    throw new ServiceError(403, 'FORBIDDEN', 'This command requires an explicit staff assignment in the official Discord server.');
  }
  try { authorize(actor, capability); return await runtime.authorizeStaff(actor, capability); }
  catch (error) { runtime.store.audit(actor.id, 'discord.command', capability, 'denied'); throw error; }
}
export function safeError(error: unknown): string {
  return error instanceof ServiceError ? error.message : error instanceof z.ZodError
    ? 'Check the supplied values and try again.' : 'This request could not be completed. Try again later.';
}
export async function privateAction(interaction: ChatInputCommandInteraction, work: () => Promise<string> | string): Promise<void> {
  await interaction.deferReply({ flags: 'Ephemeral' });
  try { await interaction.editReply({ content: (await work()).slice(0, 1950), allowedMentions: noMentions }); }
  catch (error) { await interaction.editReply({ content: safeError(error), allowedMentions: noMentions }); }
}
