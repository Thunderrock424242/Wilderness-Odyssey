import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(root, 'src', 'content', 'transmissions');
const allowedTypes = new Set(['news', 'blog', 'devlog', 'patch', 'lore', 'announcement']);
const files = walk(contentRoot).filter((file) => file.endsWith('.md'));
const ids = new Set();
const examples = new Set();
const errors = [];
const roadmapSource = readFileSync(join(root, 'src', 'data', 'roadmap.ts'), 'utf8');
const roadmapIds = new Set([...roadmapSource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]));

for (const file of files) {
  const id = relative(contentRoot, file).replaceAll('\\', '/').replace(/\.md$/, '');
  const slug = basename(file, '.md');
  const source = readFileSync(file, 'utf8');
  const frontmatter = source.split(/^---\s*$/m)[1] ?? '';
  const type = scalar(frontmatter, 'type');
  const draft = scalar(frontmatter, 'draft');
  const coverImage = scalar(frontmatter, 'coverImage');
  const roadmap = scalar(frontmatter, 'relatedRoadmapItem');

  if (ids.has(id)) errors.push(`Duplicate transmission id: ${id}`);
  ids.add(id);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`Invalid slug: ${id}`);
  if (!allowedTypes.has(type)) errors.push(`Invalid type in ${id}: ${type}`);
  if (id.startsWith('_examples/') && draft !== 'true') errors.push(`Example must remain a draft: ${id}`);
  if (id.startsWith('_examples/')) examples.add(type);
  if (roadmap && !roadmapIds.has(roadmap)) errors.push(`Unknown roadmap id in ${id}: ${roadmap}`);
  if (coverImage) {
    const asset = join(root, 'public', coverImage.replace(/^\//, ''));
    if (!existsSync(asset)) errors.push(`Missing cover image in ${id}: ${coverImage}`);
  }
}

for (const type of allowedTypes) {
  if (!examples.has(type)) errors.push(`Missing draft example for transmission type: ${type}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} transmission files, ${roadmapIds.size} roadmap references, and all six draft examples.`);
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
  return (match?.[1] ?? '').replace(/^['"]|['"]$/g, '');
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
