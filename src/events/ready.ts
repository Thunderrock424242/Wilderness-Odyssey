import type { Client } from 'discord.js';

export function handleReady(client: Client<true>): void {
  console.log(`Wilderness Oddesy systems online as ${client.user.tag}.`);
}
