import fs from 'node:fs';
import path from 'node:path';

export type QaAnswerCategory = 'crash' | 'bug' | 'performance' | 'general';

export interface DefaultQaAnswer {
  key: string;
  category: QaAnswerCategory;
  title: string;
  triggerTerms: string[];
  body: string;
}

const responseRoot = path.resolve(process.cwd(), 'qa-responses');
const categories: QaAnswerCategory[] = ['crash', 'bug', 'performance', 'general'];

export function loadDefaultQaAnswers(): DefaultQaAnswer[] {
  const answers = [
    ...loadAnswersFromDirectory(responseRoot, 'general'),
    ...categories.flatMap((category) => loadAnswersFromDirectory(path.join(responseRoot, category), category))
  ];

  return answers.sort((left, right) =>
    right.title.length - left.title.length || left.title.localeCompare(right.title)
  );
}

function loadAnswersFromDirectory(directory: string, category: QaAnswerCategory): DefaultQaAnswer[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => fileAnswer(directory, entry.name, category))
    .filter((answer): answer is DefaultQaAnswer => Boolean(answer));
}

function fileAnswer(directory: string, fileName: string, category: QaAnswerCategory): DefaultQaAnswer | null {
  const filePath = path.join(directory, fileName);
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const title = path.basename(fileName, path.extname(fileName)).trim();
  if (!title) {
    return null;
  }

  const parsed = parseAnswerFile(content);
  const body = parsed.response.trim();
  if (!body) {
    return null;
  }

  return {
    key: path.relative(responseRoot, filePath).replace(/\\/g, '/'),
    category,
    title,
    triggerTerms: uniqueTerms([title, ...parsed.phrases]),
    body
  };
}

function parseAnswerFile(content: string): { phrases: string[]; response: string } {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const phrases: string[] = [];
  const responseLines: string[] = [];
  let section: 'phrases' | 'response' | null = null;
  let sawResponseHeader = false;

  for (const line of lines) {
    const phraseHeader = line.match(/^\s*phrases?\s*:\s*(.*)$/i);
    if (phraseHeader) {
      section = 'phrases';
      addPhraseLine(phrases, phraseHeader[1]);
      continue;
    }

    const responseHeader = line.match(/^\s*response\s*:\s*(.*)$/i);
    if (responseHeader) {
      section = 'response';
      sawResponseHeader = true;
      if (responseHeader[1].trim()) {
        responseLines.push(responseHeader[1].trim());
      }
      continue;
    }

    if (section === 'phrases') {
      addPhraseLine(phrases, line);
      continue;
    }

    if (section === 'response' || !sawResponseHeader) {
      responseLines.push(line);
    }
  }

  return {
    phrases,
    response: responseLines.join('\n')
  };
}

function addPhraseLine(phrases: string[], line: string): void {
  const trimmed = line
    .trim()
    .replace(/^[-*]\s*/, '')
    .trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return;
  }

  for (const phrase of trimmed.split(',')) {
    const clean = phrase.trim();
    if (clean) {
      phrases.push(clean);
    }
  }
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
