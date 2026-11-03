import type { SandboxInput } from '../../../contracts/v1/aether-playground';
export type SandboxTurn = { user: string; answer: string };
export function conversationMessages(turns: readonly SandboxTurn[], system: string, prompt: string, limits: { maxMessages: number; maxInputCharacters: number }) {
  const maxMessages = Math.min(12, limits.maxMessages), maxCharacters = Math.min(16000, limits.maxInputCharacters);
  const current = prompt.trim(), context = system.trim();
  if (!current || current.length > 4000 || context.length > 4000) throw new Error('Use a prompt and system context of at most 4,000 characters each.');
  const fixed: SandboxInput['messages'] = [...(context ? [{ role: 'system' as const, content: context }] : []), { role: 'user', content: current }];
  if (fixed.length > maxMessages || current.length + context.length > maxCharacters) throw new Error('The current prompt and system context exceed this server’s conversation limits. Shorten them before generating.');
  const retained = [...turns]; let droppedPairs = 0;
  const build = (): SandboxInput['messages'] => [...(context ? [{ role: 'system' as const, content: context }] : []), ...retained.flatMap(turn => [{ role: 'user' as const, content: turn.user }, { role: 'assistant' as const, content: turn.answer.slice(0, 4000) }]), { role: 'user', content: current }];
  let messages = build();
  while (messages.length > maxMessages || messages.reduce((total, message) => total + message.content.length, 0) > maxCharacters) { retained.shift(); droppedPairs++; messages = build(); }
  return { messages, droppedPairs, truncatedAnswers: retained.filter(turn => turn.answer.length > 4000).length };
}
