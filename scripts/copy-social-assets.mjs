import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const sourceLogo = join(rootDir, 'logo.png');
const distDir = join(rootDir, 'dist');
const distLogo = join(distDir, 'logo.png');
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(sourceLogo)) {
  throw new Error(`Missing social logo asset: ${sourceLogo}`);
}

if (!dryRun) {
  mkdirSync(distDir, { recursive: true });
  copyFileSync(sourceLogo, distLogo);
}

console.log(`${dryRun ? 'Prepared' : 'Copied'} ${sourceLogo} -> ${distLogo}`);
