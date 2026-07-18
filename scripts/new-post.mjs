import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const TYPES = ['news', 'blog', 'devlog', 'patch', 'lore', 'announcement'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentDirectory = join(root, 'src', 'content', 'transmissions');
const today = new Date().toISOString().slice(0, 10);
const terminal = createInterface({ input, output });

const ask = async (question, fallback = '') => {
  const answer = (await terminal.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return answer || fallback;
};

const yesNo = async (question, fallback = false) => {
  const answer = (await ask(`${question} (y/n)`, fallback ? 'y' : 'n')).toLowerCase();
  return answer === 'y' || answer === 'yes';
};

const slugify = (value) => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const yamlString = (value) => JSON.stringify(value);

try {
  let type = await ask(`Post type (${TYPES.join(', ')})`, 'devlog');
  while (!TYPES.includes(type)) type = await ask('Choose one of the listed post types', 'devlog');
  const title = await ask('Title');
  if (!title) throw new Error('A title is required.');
  const slug = slugify(await ask('Slug', slugify(title)));
  if (!slug) throw new Error('The slug must contain letters or numbers.');
  const description = await ask('Description');
  if (description.length < 10) throw new Error('The description must be at least 10 characters.');
  const author = await ask('Author', 'Thunder');
  const date = await ask('Publication date (YYYY-MM-DD)', today);
  const tags = (await ask('Tags (comma separated)', 'Development Update'))
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const version = await ask('Version (optional)');
  const featured = await yesNo('Featured', false);
  const draft = await yesNo('Draft', true);
  const target = join(contentDirectory, `${slug}.md`);

  try {
    await access(target);
    throw Object.assign(new Error(`A transmission already exists at ${target}`), { code: 'EEXIST' });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') throw error;
  }

  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    `publishedAt: ${date}`,
    `type: ${yamlString(type)}`,
    `author: ${yamlString(author)}`,
    'tags:',
    ...tags.map((tag) => `  - ${yamlString(tag)}`),
    'featured: ' + featured,
    'draft: ' + draft,
    ...(version ? [`version: ${yamlString(version)}`] : []),
    '---',
    '',
    'Write the verified transmission here.',
    '',
  ].join('\n');

  await mkdir(contentDirectory, { recursive: true });
  await writeFile(target, frontmatter, { encoding: 'utf8', flag: 'wx' });
  output.write(`\nCreated ${target}\nRun npm run check before publishing.\n`);
} finally {
  terminal.close();
}
