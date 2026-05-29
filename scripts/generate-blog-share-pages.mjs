import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SITE_BASE = 'https://thunderrock424242.github.io/Wilderness-Odyssey';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const sourcePath = join(rootDir, 'src', 'content', 'blogPosts.ts');
const publicDir = join(rootDir, 'public');
const outputDir = join(rootDir, 'public', 'blog');
const sourceLogo = join(rootDir, 'logo.png');
const publicLogo = join(publicDir, 'logo.png');
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(sourcePath)) {
  throw new Error(`Missing blog source: ${sourcePath}`);
}

if (!existsSync(sourceLogo)) {
  throw new Error(`Missing social logo asset: ${sourceLogo}`);
}

const blogPosts = await loadBlogPosts();
const pages = blogPosts.map((post) => {
  const slug = slugify(post.title);
  const shareUrl = `${SITE_BASE}/blog/${slug}/`;
  const targetUrl = `${SITE_BASE}/blog.html#post-${slug}`;
  const localTarget = `../../blog.html#post-${slug}`;
  const description = cleanDescription([post.excerpt, post.body[0]].filter(Boolean).join(' '));

  return {
    slug,
    html: renderSharePage({
      title: `${post.title} // Wilderness Odyssey`,
      description,
      shareUrl,
      targetUrl,
      localTarget,
      date: post.date,
      tags: post.tags,
    }),
  };
});

if (!dryRun) {
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(sourceLogo, publicLogo);
  rmSync(outputDir, { recursive: true, force: true });
  for (const page of pages) {
    const pageDir = join(outputDir, page.slug);
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'index.html'), page.html);
  }
}

console.log(`${dryRun ? 'Prepared' : 'Generated'} ${pages.length} blog share page${pages.length === 1 ? '' : 's'} and logo`);

async function loadBlogPosts() {
  const source = readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  const module = await import(dataUrl);
  return module.BLOG_POSTS ?? [];
}

function renderSharePage({ title, description, shareUrl, targetUrl, localTarget, date, tags }) {
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const escapedShareUrl = escapeHtml(shareUrl);
  const escapedTargetUrl = escapeHtml(targetUrl);
  const escapedLocalTarget = escapeHtml(localTarget);
  const articleTags = tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapedTitle}</title>
<meta name="description" content="${escapedDescription}">
<meta name="theme-color" content="#e8a020">
<meta http-equiv="refresh" content="0; url=${escapedLocalTarget}">
<link rel="canonical" href="${escapedShareUrl}">
<link rel="icon" type="image/png" href="/Wilderness-Odyssey/logo.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="BUNKER_OS // Wilderness Odyssey">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="${escapedShareUrl}">
<meta property="og:title" content="${escapedTitle}">
<meta property="og:description" content="${escapedDescription}">
<meta property="og:image" content="${SITE_BASE}/logo.png">
<meta property="og:image:secure_url" content="${SITE_BASE}/logo.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="256">
<meta property="og:image:height" content="256">
<meta property="og:image:alt" content="Wilderness Odyssey logo.">
<meta property="article:published_time" content="${escapeHtml(date)}">
${articleTags}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapedTitle}">
<meta name="twitter:description" content="${escapedDescription}">
<meta name="twitter:image" content="${SITE_BASE}/logo.png">
<meta name="twitter:image:alt" content="Wilderness Odyssey logo.">
</head>
<body>
<p>Opening <a href="${escapedTargetUrl}">${escapedTitle}</a>.</p>
</body>
</html>
`;
}

function cleanDescription(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 280);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
