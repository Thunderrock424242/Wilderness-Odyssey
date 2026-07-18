import { describe, expect, it } from 'vitest';
import { isTerminalCommand, parseTerminalCommand, suggestTerminalCommand } from '../src/lib/terminalEngine';

describe('BUNKER_OS command parsing', () => {
  it('normalizes whitespace and preserves arguments', () => {
    expect(parseTerminalCommand('  ROADMAP   water  ')).toEqual({ name: 'roadmap', args: ['water'], normalized: 'roadmap water' });
  });

  it('supports hidden lore record queries without treating the argument as the command', () => {
    expect(parseTerminalCommand('lore reservoir-9')).toMatchObject({ name: 'lore', args: ['reservoir-9'] });
    expect(isTerminalCommand('lore')).toBe(true);
  });

  it('offers a useful autocomplete suggestion', () => {
    expect(suggestTerminalCommand('road')).toBe('roadmap');
  });
});
