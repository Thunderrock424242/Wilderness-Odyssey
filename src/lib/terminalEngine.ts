export const TERMINAL_COMMANDS = [
  'help',
  'status',
  'latest',
  'roadmap',
  'logs',
  'patches',
  'lore',
  'gallery',
  'version',
  'discord',
  'download',
  'clear',
] as const;

export type TerminalCommandName = (typeof TERMINAL_COMMANDS)[number];

export type ParsedTerminalCommand = {
  name: string;
  args: string[];
  normalized: string;
};

export function parseTerminalCommand(input: string): ParsedTerminalCommand {
  const normalized = input.trim().replace(/\s+/g, ' ').toLowerCase();
  const [name = '', ...args] = normalized.split(' ');
  return { name, args, normalized };
}

export function suggestTerminalCommand(input: string): string | undefined {
  const { name } = parseTerminalCommand(input);
  if (!name) return TERMINAL_COMMANDS[0];
  return TERMINAL_COMMANDS.find((command) => command.startsWith(name)) ?? TERMINAL_COMMANDS.find((command) => command.includes(name));
}

export function isTerminalCommand(name: string): name is TerminalCommandName {
  return TERMINAL_COMMANDS.includes(name as TerminalCommandName);
}
