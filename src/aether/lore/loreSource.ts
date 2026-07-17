import fs from 'node:fs';
import path from 'node:path';

export interface LoreSearchResult {
  title: string;
  text: string;
  source: string;
}

export interface AetherLoreSource {
  isAvailable(): boolean;
  getSourceName(): string;
  search(query: string): LoreSearchResult[];
}

export class PlaceholderLoreSource implements AetherLoreSource {
  private readonly entries: LoreSearchResult[] = [
    {
      title: 'Aether archive status',
      text: 'The lore archive is running in placeholder mode. Configure AETHER_LORE_FILE to load approved project lore from a UTF-8 text or Markdown file.',
      source: 'placeholder'
    },
    {
      title: 'Wilderness Odyssey',
      text: 'Wilderness Odyssey is a survival-focused Minecraft project whose unstable systems include anomalies, rifts, structures, and other unfinished discoveries. Canon details should come from the configured lore archive.',
      source: 'placeholder'
    }
  ];

  isAvailable(): boolean {
    return true;
  }

  getSourceName(): string {
    return 'placeholder';
  }

  search(query: string): LoreSearchResult[] {
    return searchEntries(this.entries, query);
  }
}

export class FileLoreSource implements AetherLoreSource {
  private constructor(
    private readonly sourceName: string,
    private readonly entries: LoreSearchResult[]
  ) {}

  static load(filePath: string): FileLoreSource {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile() || stats.size > 256 * 1024) {
      throw new Error('The configured Aether lore file must be a UTF-8 file no larger than 256 KiB.');
    }

    const content = fs.readFileSync(resolvedPath, 'utf8').replace(/\0/g, '').trim();
    if (!content) {
      throw new Error('The configured Aether lore file is empty.');
    }

    const entries = content
      .split(/\r?\n\s*\r?\n/u)
      .map((section, index) => section.trim())
      .filter(Boolean)
      .slice(0, 200)
      .map((section, index) => {
        const lines = section.split(/\r?\n/u);
        const heading = lines[0].replace(/^#{1,6}\s*/, '').trim();
        return {
          title: heading || `Lore entry ${index + 1}`,
          text: section.slice(0, 3000),
          source: 'configured-file'
        };
      });

    return new FileLoreSource('configured-file', entries);
  }

  isAvailable(): boolean {
    return this.entries.length > 0;
  }

  getSourceName(): string {
    return this.sourceName;
  }

  search(query: string): LoreSearchResult[] {
    return searchEntries(this.entries, query);
  }
}

export function createLoreSource(filePath?: string): {
  source: AetherLoreSource;
  warning?: string;
} {
  if (!filePath) {
    return { source: new PlaceholderLoreSource() };
  }

  try {
    return { source: FileLoreSource.load(filePath) };
  } catch {
    return {
      source: new PlaceholderLoreSource(),
      warning: 'AETHER_LORE_FILE could not be loaded; the placeholder lore source is active.'
    };
  }
}

function searchEntries(entries: LoreSearchResult[], query: string): LoreSearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length >= 3);
  if (terms.length === 0) {
    return entries.slice(0, 3);
  }

  const scored = entries
    .map((entry) => {
      const haystack = `${entry.title} ${entry.text}`.toLowerCase();
      return {
        entry,
        score: terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);
  return scored.slice(0, 3).map(({ entry }) => entry);
}
