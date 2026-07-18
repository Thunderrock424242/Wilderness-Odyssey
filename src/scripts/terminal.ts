import { isTerminalCommand, parseTerminalCommand, suggestTerminalCommand } from '../lib/terminalEngine';

type TerminalPayload = {
  site: {
    name: string;
    status: string;
    version: string;
    minecraftVersion: string;
    neoForgeVersion: string;
    downloadStatus: string;
    discord: string;
  };
  routes: Record<'roadmap' | 'logs' | 'patches' | 'lore' | 'gallery', string>;
  latest: Array<{ title: string; type: string; date: string; url: string }>;
  roadmap: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    status: string;
    progressLabel: string;
    url: string;
  }>;
  logCount: number;
};

type OutputLine = { text: string; tone?: 'safe' | 'warn' | 'danger' | 'signal' | 'muted'; href?: string; external?: boolean };

document.querySelectorAll<HTMLElement>('[data-terminal]').forEach((terminal) => {
  const form = terminal.querySelector<HTMLFormElement>('[data-terminal-form]');
  const input = terminal.querySelector<HTMLInputElement>('[data-terminal-input]');
  const output = terminal.querySelector<HTMLElement>('[data-terminal-output]');
  const data = terminal.querySelector<HTMLScriptElement>('[data-terminal-data]');
  if (!form || !input || !output || !data?.textContent) return;

  const payload = JSON.parse(data.textContent) as TerminalPayload;
  const history: string[] = [];
  let historyIndex = 0;
  const phraseSuggestions = [
    'help', 'status', 'latest', 'roadmap', 'roadmap water', 'roadmap aether', 'logs', 'patches', 'lore',
    'lore reservoir-9', 'gallery', 'version', 'discord', 'download', 'clear',
  ];

  const append = (line: OutputLine) => {
    const row = document.createElement('p');
    row.dataset.tone = line.tone ?? 'muted';
    if (line.href) {
      const link = document.createElement('a');
      link.href = line.href;
      link.textContent = line.text;
      if (line.external) {
        link.target = '_blank';
        link.rel = 'noreferrer';
      }
      row.appendChild(link);
    } else {
      row.textContent = line.text;
    }
    output.appendChild(row);
    output.scrollTop = output.scrollHeight;
  };

  const help = (): OutputLine[] => [
    { text: 'AVAILABLE COMMANDS', tone: 'safe' },
    { text: 'help · status · latest · roadmap [topic] · logs · patches', tone: 'muted' },
    { text: 'lore [record] · gallery · version · discord · download · clear', tone: 'muted' },
    { text: 'Try: roadmap water, roadmap aether, or lore reservoir-9', tone: 'signal' },
  ];

  const resolve = (raw: string): OutputLine[] => {
    const command = parseTerminalCommand(raw);
    if (!command.name) return [];
    if (!isTerminalCommand(command.name)) {
      const suggestion = suggestTerminalCommand(command.name);
      return [
        { text: `UNKNOWN COMMAND: ${command.name}`, tone: 'danger' },
        ...(suggestion ? [{ text: `Did you mean “${suggestion}”?`, tone: 'signal' as const }] : []),
      ];
    }

    switch (command.name) {
      case 'help':
        return help();
      case 'status':
        return [
          { text: 'WORLD STATUS // POST-EXODUS RECORD', tone: 'safe' },
          { text: `Project state ........ ${payload.site.status}`, tone: 'signal' },
          { text: 'Atmosphere ........... BREATHABLE', tone: 'safe' },
          { text: 'Anomalous energy ..... ACTIVE', tone: 'warn' },
          { text: 'Anomaly saturation ... CRITICAL', tone: 'danger' },
        ];
      case 'latest':
        return [
          { text: 'LATEST VERIFIED TRANSMISSIONS', tone: 'safe' },
          ...payload.latest.map((entry) => ({
            text: `${entry.date} // ${entry.type.toUpperCase()} // ${entry.title}`,
            tone: 'signal' as const,
            href: entry.url,
          })),
        ];
      case 'roadmap': {
        const query = command.args.join(' ').toLowerCase();
        const matches = payload.roadmap.filter((item) =>
          !query || [item.title, item.description, item.category, item.id].join(' ').toLowerCase().includes(query),
        );
        if (matches.length === 0) {
          return [
            { text: `NO ROADMAP TRACK MATCHES “${query}”`, tone: 'warn' },
            { text: 'Open the complete roadmap', tone: 'signal', href: payload.routes.roadmap },
          ];
        }
        return [
          { text: query ? `ROADMAP QUERY // ${query.toUpperCase()}` : 'ACTIVE ROADMAP', tone: 'safe' },
          ...matches.slice(0, 5).map((item) => ({
            text: `${item.status.toUpperCase()} // ${item.progressLabel} // ${item.title}`,
            tone: item.status === 'In Development' ? ('signal' as const) : ('muted' as const),
            href: item.url,
          })),
        ];
      }
      case 'logs':
        return [
          { text: `${payload.logCount} recovered survivor logs indexed.`, tone: 'safe' },
          { text: 'Open survivor log archive', tone: 'signal', href: payload.routes.logs },
        ];
      case 'patches':
        return [{ text: 'Open versioned patch records', tone: 'signal', href: payload.routes.patches }];
      case 'lore': {
        const record = command.args.join(' ');
        if (record === 'reservoir-9') {
          return [
            { text: 'RESERVOIR-9 // QUERY RECEIVED', tone: 'warn' },
            { text: 'No verified Reservoir-9 record exists in the recovered canon.', tone: 'danger' },
            { text: 'Record withheld rather than reconstructed from speculation.', tone: 'muted' },
          ];
        }
        return [
          { text: 'PROJECT THRESHOLD // BLACKOUT ARCHIVE FRAGMENT', tone: 'safe' },
          { text: 'The accelerator did not create the doorway. It activated the material beneath the site.', tone: 'muted' },
          { text: 'The doorway led to Earth — the same world, remembered incorrectly. Echo Earth.', tone: 'warn' },
          { text: 'Open recovered records', tone: 'signal', href: payload.routes.lore },
        ];
      }
      case 'gallery':
        return [{ text: 'Open the visual archive', tone: 'signal', href: payload.routes.gallery }];
      case 'version':
        return [
          { text: 'VERSION INFORMATION', tone: 'safe' },
          { text: `Pack ................. ${payload.site.version}`, tone: 'signal' },
          { text: `Minecraft ............ ${payload.site.minecraftVersion}`, tone: 'muted' },
          { text: `NeoForge ............. ${payload.site.neoForgeVersion}`, tone: 'muted' },
        ];
      case 'discord':
        return [{ text: 'Open the Wilderness Odyssey Discord', tone: 'signal', href: payload.site.discord, external: true }];
      case 'download':
        return [
          { text: payload.site.downloadStatus, tone: 'warn' },
          { text: 'Follow the first-alpha roadmap', tone: 'signal', href: payload.routes.roadmap },
        ];
      case 'clear':
        return [];
    }
  };

  const run = (raw: string) => {
    const normalized = raw.trim();
    if (!normalized) return;
    history.push(normalized);
    historyIndex = history.length;
    if (parseTerminalCommand(normalized).name === 'clear') {
      output.replaceChildren();
      return;
    }
    append({ text: `survivor@bunker:~$ ${normalized}`, tone: 'muted' });
    resolve(normalized).forEach(append);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(input.value);
    input.value = '';
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? input.value;
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? '';
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const value = input.value.trim().toLowerCase();
      const match = phraseSuggestions.find((suggestion) => suggestion.startsWith(value));
      if (match) input.value = match;
    }
  });

  terminal.querySelectorAll<HTMLButtonElement>('[data-terminal-command]').forEach((button) => {
    button.addEventListener('click', () => run(button.dataset.terminalCommand ?? ''));
  });
});
