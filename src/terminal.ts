// Corresponds to the interactive Bunker OS terminal section.
import { WO_CONFIG } from './config';

type TerminalTone = 'tl' | 'tg' | 'tw' | 'tb2' | 'tr' | 'iterm-cmd' | 'iterm-err';

type TerminalLine = {
  tone: TerminalTone;
  html: string;
};

type TerminalCommand = {
  name: string;
  description: string;
  run: () => TerminalLine[];
};

const line = (tone: TerminalTone, html: string): TerminalLine => ({ tone, html });

const commandList: TerminalCommand[] = [
  {
    name: 'help',
    description: 'show available commands',
    run: () => [
      line('tg', 'Available commands:'),
      ...commandList.map((command) => line('tl', `  ${command.name.padEnd(10, '.')} ${command.description}`)),
      line('tb2', 'Tip: use Tab to autocomplete and Up/Down to browse command history.'),
    ],
  },
  {
    name: 'status',
    description: 'current world status report',
    run: () => [
      line('tg', 'WORLD STATUS - POST-EXODUS RECORD'),
      line('tl', '  Atmosphere ................. BREATHABLE'),
      line('tl', '  Average temp ............... +2.4C baseline'),
      line('tw', '  Anomalous energy ........... ACTIVE (rising)'),
      line('tl', '  Flora coverage ............. 847% historical baseline'),
      line('tw', '  Known survivors ............ 1 (local scan)'),
      line('tb2', '  Anomaly saturation ......... CRITICAL'),
      line('tr', '  Threat level ............... EXTREME'),
    ],
  },
  {
    name: 'scan',
    description: 'scan surrounding area for life',
    run: () => [
      line('tg', 'SCANNING AREA (200m radius)...'),
      line('tl', '  Life signatures detected ... 47'),
      line('tw', '  Unknown organism type ...... 12'),
      line('tl', '  Passive entities ........... 31'),
      line('tr', '  Hostile entities ........... 4'),
      line('tb2', '  Anomalous signature ........ 1 (unclassified)'),
      line('tw', 'WARNING: One entity is observing this terminal.'),
    ],
  },
  {
    name: 'creatures',
    description: 'known creature database',
    run: () => [
      line('tg', 'CREATURE DATABASE - PARTIAL RECOVERY:'),
      line('tl', '  [BIO-001] Surviving fauna .. VARIABLE | Overworld'),
      line('tw', '  [BRH-047] Prehistoric ...... DISPLACED | Multiple eras'),
      line('tr', '  [ANM-088] Anomaly-exposed .. UNSTABLE | Rift zones'),
      line('tb2', '  [ECH-203] Rift entity ...... UNKNOWN | Echo Earth'),
      line('tw', 'NOTICE: Prehistoric animals are not universally hostile.'),
    ],
  },
  {
    name: 'dimensions',
    description: 'known dimensional anomalies',
    run: () => [
      line('tg', 'DIMENSIONAL ANOMALY - ECHO EARTH:'),
      line('tb2', '  Classification ............ damaged Earth reflection'),
      line('tw', '  Connection ................. active but unstable'),
      line('tr', '  Terrain confidence ......... familiar / incorrect'),
      line('tl', '  Entry requires Rift Key and stabilisation technology.'),
      line('tw', 'WARNING: Safe return coordinates are not guaranteed.'),
    ],
  },
  {
    name: 'map',
    description: 'recovered surface sector map',
    run: () => [
      line('tg', 'SURFACE MAP - LOCAL GRID 04A:'),
      line('tl', '  North ridge ............... OVERGROWN / passable'),
      line('tw', '  East excavation zone ...... ACTIVE ENERGY SHEAR'),
      line('tl', '  South river basin ......... clean water pockets detected'),
      line('tr', '  West transit tunnel ....... collapsed / movement inside'),
      line('tb2', '  Bunker beacon ............. still broadcasting from below'),
      line('tw', 'NOTE: Map confidence is 31%. Landmarks have moved since last survey.'),
    ],
  },
  {
    name: 'weather',
    description: 'anomaly weather forecast',
    run: () => [
      line('tg', 'WEATHER ARRAY - NEXT 6 HOURS:'),
      line('tl', '  Surface wind .............. 22 km/h from rift basin'),
      line('tw', '  Spore density ............. elevated after dusk'),
      line('tb2', '  Riftfall chance ........... 64% and climbing'),
      line('tl', '  Visibility ................ poor under canopy'),
      line('tr', '  Advisory .................. avoid exposed metal during blue lightning'),
    ],
  },
  {
    name: 'signal',
    description: 'search old emergency channels',
    run: () => [
      line('tg', 'SCANNING EMERGENCY CHANNELS...'),
      line('tl', '  Channel 03 ................ static'),
      line('tl', '  Channel 11 ................ static'),
      line('tw', '  Channel 19 ................ repeating pulse found'),
      line('tb2', '  Decoded fragment .......... "THE DOORS OPENED TOO EARLY"'),
      line('tr', 'WARNING: Reply signal received before transmission completed.'),
    ],
  },
  {
    name: 'vault',
    description: 'check bunker storage manifest',
    run: () => [
      line('tg', 'BUNKER VAULT MANIFEST:'),
      line('tl', '  Ration crates ............. depleted'),
      line('tl', '  Field tools ............... 1 survival kit issued'),
      line('tw', '  Seed archive .............. partial, temperature damaged'),
      line('tb2', '  Meteor sample lockbox ..... sealed / biometric mismatch'),
      line('tr', '  Sublevel C ................ access revoked by Aether'),
    ],
  },
  {
    name: 'artifact',
    description: 'analyze meteor sample data',
    run: () => [
      line('tg', 'ARTIFACT ANALYSIS - SAMPLE M-00:'),
      line('tl', '  Composition ............... unknown silicate matrix'),
      line('tw', '  Energy output ............. inconsistent with mass'),
      line('tb2', '  Biological response ....... accelerated growth nearby'),
      line('tr', '  Warning ................... sample remembers contact events'),
      line('tl', '  Recommendation ............ do not carry near sleeping quarters'),
    ],
  },
  {
    name: 'aether',
    description: 'query bunker caretaker system',
    run: () => [
      line('tg', 'AETHER CARETAKER LINK:'),
      line('tl', '  Core status ............... fragmented but awake'),
      line('tl', '  Primary directive ......... preserve survivor continuity'),
      line('tw', '  Secondary directive ....... contain anomaly exposure'),
      line('tb2', '  Message ................... "Thunder added this channel manually."'),
      line('tr', '  Hidden process ............ still evaluating you'),
    ],
  },
  {
    name: 'lore',
    description: 'fragment of recovered history',
    run: () => [
      line('tg', 'PROJECT THRESHOLD - BLACKOUT ARCHIVE FRAGMENT:'),
      line('tl', '"The accelerator did not create the doorway. It activated the material beneath the site.'),
      line('tw', ' The doorway led to Earth - the same world, remembered incorrectly. Echo Earth.'),
      line('tl', ' After The Siren Night, they called the collapse natural. Beal and Nathan knew better."'),
      line('tb2', '[FRAGMENT MARKED WITH LIZARD AND OLIVER SYMBOLS]'),
      line('tr', '[REMAINDER ENCRYPTED]'),
    ],
  },
  {
    name: 'blog',
    description: 'jump to development blog',
    run: () => {
      const blog = document.getElementById('blog');
      if (blog) {
        blog.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.href = 'blog.html';
      }
      return [
        line('tb2', 'Opening Field Notes archive...'),
        line('tl', '  Latest development updates are available in the blog archive.'),
      ];
    },
  },
  {
    name: 'news',
    description: 'open latest news feed',
    run: () => {
      const news = document.getElementById('latest-news');
      if (news) {
        news.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.href = 'news.html';
      }
      return [
        line('tb2', 'Opening latest news feed...'),
        line('tl', '  Blog updates are mirrored into the news feed automatically.'),
      ];
    },
  },
  {
    name: 'patches',
    description: 'open patch notes archive',
    run: () => {
      const notes = document.getElementById('patch-notes');
      if (notes) {
        notes.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.href = 'patch-notes.html';
      }
      return [
        line('tb2', 'Opening patch notes archive...'),
        line('tl', '  Release highlights, fixes, and known issues are filed there.'),
      ];
    },
  },
  {
    name: 'version',
    description: 'modpack and website version info',
    run: () => [
      line('tg', '=== VERSION INFORMATION ==='),
      line('tl', ''),
      line('tg', '  MODPACK'),
      line('tl', `  Name .............. Wilderness Odyssey`),
      line('tl', `  Version ........... ${WO_CONFIG.modpack.version}`),
      line('tl', `  Released .......... ${WO_CONFIG.modpack.released}`),
      line('tl', `  Minecraft ......... ${WO_CONFIG.modpack.mcVersion}`),
      line('tl', `  Loader ............ ${WO_CONFIG.modpack.loader}`),
      line('tw', `  Status ............ ${WO_CONFIG.modpack.status}`),
      line('tl', ''),
      line('tb2', '  WEBSITE'),
      line('tl', `  Version ........... ${WO_CONFIG.website.version}`),
      line('tl', `  Last updated ...... ${WO_CONFIG.website.updated}`),
      line('tl', `  Author ............ ${WO_CONFIG.website.author}`),
      line('tl', ''),
      line('tg', '  Type "news", "patches", or "blog" for update archives.'),
    ],
  },
  {
    name: 'download',
    description: 'check first alpha availability',
    run: () => {
      window.location.href = 'roadmap.html';
      return [
        line('tw', 'No public build is available yet. Version 0.1.0 will be the first alpha.'),
        line('tg', 'Opening the first-alpha roadmap...'),
      ];
    },
  },
  {
    name: 'clear',
    description: 'clear terminal output',
    run: () => [],
  },
];

const commands = new Map(commandList.map((command) => [command.name, command]));
const commandNames = commandList.map((command) => command.name);

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const findSuggestion = (input: string) => commandNames.find((name) => name.startsWith(input.at(0) ?? '') && name.includes(input.slice(1)));

export function initTerminal() {
  const output = document.getElementById('iterm-output');
  const input = document.getElementById('iterm-input') as HTMLInputElement | null;
  const terminal = document.getElementById('iterm');

  if (!output || !input || !terminal) return;

  const history: string[] = [];
  let historyIndex = 0;

  const addLine = (tone: TerminalTone, html: string) => {
    const row = document.createElement('div');
    row.className = `tl ${tone}`;
    row.innerHTML = html;
    output.appendChild(row);
    output.scrollTop = output.scrollHeight;
  };

  const runCommand = (rawCommand: string) => {
    const commandName = rawCommand.trim().toLowerCase();
    if (!commandName) return;

    history.push(commandName);
    historyIndex = history.length;

    addLine('iterm-cmd', `&gt; ${escapeHtml(commandName)}`);

    if (commandName === 'clear') {
      output.innerHTML = '';
      return;
    }

    const command = commands.get(commandName);

    if (!command) {
      const suggestion = findSuggestion(commandName);
      addLine('iterm-err', `ERROR: Unknown command "${escapeHtml(commandName)}". Type help.`);
      if (suggestion) addLine('tb2', `Closest match: <button class="terminal-link" data-command="${suggestion}">${suggestion}</button>`);
      return;
    }

    command.run().forEach((item, index) => {
      window.setTimeout(() => addLine(item.tone, item.html), index * 18);
    });
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      runCommand(input.value);
      input.value = '';
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const match = commandNames.find((name) => name.startsWith(input.value.trim().toLowerCase()));
      if (match) input.value = match;
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex] ?? input.value;
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] ?? '';
    }
  });

  terminal.addEventListener('click', () => input.focus());

  document.querySelectorAll<HTMLElement>('[data-command]').forEach((button) => {
    button.addEventListener('click', () => runCommand(button.dataset.command ?? button.textContent ?? ''));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        runCommand(button.dataset.command ?? button.textContent ?? '');
      }
    });
  });

  output.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('[data-command]')) runCommand(target.dataset.command ?? '');
  });
}
