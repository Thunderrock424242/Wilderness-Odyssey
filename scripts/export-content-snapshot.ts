import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { SITE } from '../src/data/site';
import { ROADMAP_ITEMS } from '../src/data/roadmap';
import { GALLERY_ITEMS } from '../src/data/gallery';
import { imagePath, siteDataSchema, roadmapDataSchema, galleryDataSchema, transmissionInputSchema } from '../contracts/v1/content';
const pages = { site: siteDataSchema.parse(SITE), roadmap: roadmapDataSchema.parse(ROADMAP_ITEMS), gallery: galleryDataSchema.parse(GALLERY_ITEMS) };
if (process.argv.includes('--migrate')) { mkdirSync('src/data/editable', { recursive: true }); for (const [kind, data] of Object.entries(pages)) writeFileSync('src/data/editable/' + kind + '.json', JSON.stringify(data, null, 2) + '\n'); }
const output = process.argv[process.argv.indexOf('--output') + 1];
if (process.argv.includes('--output') && output) {
  const transmissions = readdirSync('src/content/transmissions').filter(name => name.endsWith('.md')).map(name => {
    const source = readFileSync(join('src/content/transmissions', name), 'utf8'), match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source); if (!match) throw new Error('Invalid source ' + name);
    return transmissionInputSchema.parse({ ...parse(match[1]), slug: name.slice(0, -3), featured: parse(match[1]).featured ?? false, draft: parse(match[1]).draft ?? false, galleryImages: parse(match[1]).galleryImages ?? [], bodyMarkdown: match[2].trim() });
  });
  function assets(directory: string): string[] { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? assets(join(directory, entry.name)) : [join(directory, entry.name).replaceAll('\\', '/').replace(/^public/, '')]).filter(path => imagePath.safeParse(path).success); }
  writeFileSync(output, JSON.stringify({ sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), transmissions, ...pages, assets: assets('public/images') }, null, 2) + '\n');
  console.log('Exported public source snapshot. No private backend drafts are included.');
}
