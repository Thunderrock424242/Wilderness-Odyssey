# Minecraft Modpack Website Template

A clean, configurable static website for Minecraft modpacks with:

- polished landing page
- gallery with lightbox
- wiki hub (categories + featured pages)
- blog section for news, patch notes, and updates
- GitHub Pages deployment workflow

## Quick Start

1. Edit `config.json` with your modpack details and links.
2. Add screenshots to `images/` and reference them in `config.json`.
3. Push to GitHub and enable Pages (workflow included).

## Configuration

Everything is controlled through `config.json`.

### Important fields

- `modpack`: website title, tagline, description, versions
- `links.curseforge`: download link
- `links.discord`: optional community invite
- `links.github`: either `owner/repo` or full GitHub URL
- `blog.posts`: list of blog cards (title, summary, date, author, url)
- `wiki.categories`: category chips shown in the wiki hub
- `wiki.pages`: featured wiki cards with title, summary, and markdown file
- `theme`: color overrides

### Wiki file links

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
