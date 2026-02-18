# Minecraft Modpack Website Template

A clean, configurable static website for Minecraft modpacks with:

- polished landing page
- configurable text or image logo
- gallery with lightbox
- file-based blog system (with local post images)
- wiki hub (categories + featured pages)
- GitHub Pages deployment workflow

## Quick Start

1. Edit `config.json` with your modpack details and links.
2. Add screenshots to `images/` and reference them in `config.json`.
3. Add blog posts inside the `blogs/` folder.
4. Push to GitHub and enable Pages (workflow included).

## Configuration

Everything is controlled through `config.json`.

### Important fields

- `modpack`: website title, tagline, description, versions
- `branding.logo`: optional navbar logo image (path, alt text, width, height)
- `links.curseforge`: download link
- `links.discord`: optional community invite
- `links.github`: either `owner/repo` or full GitHub URL
- `blog.source`: set to `"folder"` to load posts from files
- `blog.indexFile`: index file listing blog JSON files (default `blogs/index.json`)
- `wiki.categories`: category chips shown in the wiki hub
- `wiki.pages`: featured wiki cards with title, summary, and markdown file
- `theme`: color overrides

## Blog folder format

The blog system loads files from `blogs/index.json`:

```json
{
  "posts": [
    { "file": "blogs/example-launch-update.json" }
  ]
}
```

Each blog JSON file can include:

```json
{
  "title": "Example Blog",
  "summary": "Short preview text",
  "date": "2026-02-10",
  "author": "Modpack Team",
  "coverImage": "blogs/images/example-cover.png",
  "content": [
    { "type": "paragraph", "text": "Intro paragraph" },
    { "type": "heading", "text": "Patch Highlights" },
    { "type": "list", "items": ["Added quests", "Balanced mobs"] },
    {
      "type": "image",
      "src": "blogs/images/patch-1-screenshot.png",
      "alt": "New biome",
      "caption": "Put blog images in blogs/images"
    }
  ]
}
```

> You can copy `blogs/example-launch-update.json` as a template for new posts.

## Wiki file links

Wiki links are generated as:

`https://github.com/<repo>/blob/<branch>/wiki/<file>.md`

So if you add:

```json
{
  "title": "Progression Path",
  "file": "progression-guide.md"
}
```

create the file at:

`wiki/progression-guide.md` in your wiki repo.

## Deploying to GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`.

1. Push to the `main` branch.
2. In GitHub, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. The workflow deploys this static site automatically.

## Local Preview

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
