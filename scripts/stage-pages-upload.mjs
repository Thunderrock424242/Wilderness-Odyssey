import { cpSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/stage-pages-upload.mjs <new staging directory>');
  for (const file of ['dist/_worker.js/index.js', 'dist/_routes.json', 'dist/revision.json', 'wrangler.jsonc']) {
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error('Missing required tested Pages output: ' + file);
  }
  const requested = resolve(process.argv[2]);
  const destination = join(realpathSync(dirname(requested)), basename(requested));
  const artifact = realpathSync('dist');
  const offset = relative(artifact, destination);
  if (!offset || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith('..' + sep))) {
    throw new Error('Stage the Pages upload outside the dist artifact directory.');
  }
  if (existsSync(destination)) throw new Error('The Pages upload staging directory already exists; choose a new directory.');
  mkdirSync(destination);
  cpSync(artifact, join(destination, 'dist'), { recursive: true });
  cpSync('wrangler.jsonc', join(destination, 'wrangler.jsonc'));
  console.log('Staged the tested Pages artifact and prepared configuration without application source or dependencies.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
