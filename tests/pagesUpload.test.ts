import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/stage-pages-upload.mjs');
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wo-pages-upload-'));
  mkdirSync(join(directory, 'dist/_worker.js'), { recursive: true });
  writeFileSync(join(directory, 'dist/_worker.js/index.js'), 'export default { fetch() { return new Response("tested worker"); } };\n');
  writeFileSync(join(directory, 'dist/_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
  writeFileSync(join(directory, 'dist/revision.json'), JSON.stringify({ commit: 'a'.repeat(40), siteOrigin: 'https://site.example.com' }));
  writeFileSync(join(directory, 'dist/index.html'), '<!doctype html><title>Tested site</title>');
  writeFileSync(join(directory, 'wrangler.jsonc'), JSON.stringify({ name: 'test-site', pages_build_output_dir: './dist', env: { production: { vars: { STAFF_AUTH_MODE: 'disabled' } } } }));
  mkdirSync(join(directory, 'functions'));
  writeFileSync(join(directory, 'functions/_middleware.ts'), 'import { z } from "zod";');
  writeFileSync(join(directory, 'tsconfig.json'), '{"extends":"astro/tsconfigs/strict"}');
  writeFileSync(join(directory, '.env'), 'PRIVATE_TEST_TOKEN=do-not-copy');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function stage(destination = join(directory, 'upload')) {
  return spawnSync(process.execPath, [script, destination], { cwd: directory, encoding: 'utf8' });
}

describe('tested Pages upload staging', () => {
  it('copies the tested artifact and prepared configuration without application source or local secrets', () => {
    const result = stage();
    expect(result.status, result.stderr).toBe(0);
    const upload = join(directory, 'upload');
    expect(readdirSync(upload).sort()).toEqual(['dist', 'wrangler.jsonc']);
    for (const file of ['_worker.js/index.js', '_routes.json', 'revision.json', 'index.html']) {
      expect(readFileSync(join(upload, 'dist', file))).toEqual(readFileSync(join(directory, 'dist', file)));
    }
    expect(readFileSync(join(upload, 'wrangler.jsonc'))).toEqual(readFileSync(join(directory, 'wrangler.jsonc')));
    expect(existsSync(join(upload, 'functions'))).toBe(false);
    expect(existsSync(join(upload, 'tsconfig.json'))).toBe(false);
    expect(existsSync(join(upload, '.env'))).toBe(false);
  });

  it.each(['dist/_worker.js/index.js', 'dist/_routes.json', 'dist/revision.json', 'wrangler.jsonc'])(
    'fails before creating an upload when %s is missing', file => {
      rmSync(join(directory, file));
      const result = stage();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(file);
      expect(existsSync(join(directory, 'upload'))).toBe(false);
    },
  );

  it('refuses to overwrite an existing staging directory', () => {
    mkdirSync(join(directory, 'upload'));
    writeFileSync(join(directory, 'upload/existing.txt'), 'keep');
    const result = stage();
    expect(result.status).toBe(1);
    expect(readFileSync(join(directory, 'upload/existing.txt'), 'utf8')).toBe('keep');
  });

  it('refuses to stage inside the artifact it would copy', () => {
    const result = stage(join(directory, 'dist/upload'));
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/inside|outside/i);
    expect(existsSync(join(directory, 'dist/upload'))).toBe(false);
  });
});
