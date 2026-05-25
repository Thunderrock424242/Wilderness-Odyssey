// Corresponds to the clickable command hints in the Interactive Terminal section.
export type TerminalHintTone = 'default' | 'gold' | 'ember' | 'blue';

export type TerminalHint = {
  command: string;
  tone?: TerminalHintTone;
};

export const TERMINAL_HINTS: TerminalHint[] = [
  { command: 'help' },
  { command: 'status' },
  { command: 'scan' },
  { command: 'creatures' },
  { command: 'dimensions' },
  { command: 'lore' },
  { command: 'blog', tone: 'blue' },
  { command: 'version', tone: 'gold' },
  { command: 'modlog', tone: 'ember' },
  { command: 'sitelog', tone: 'blue' },
  { command: 'download' },
];
