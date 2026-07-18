# Visual Parity Reference

The visual source of truth for the Astro site is commit `2625adb` on the `website` branch (`update lore and version 0.1.0 roadmap`). That commit is the last complete pre-Astro implementation and is also the design represented by the previously published GitHub Pages site.

## Design contract

- Palette: `#04030a` void, `#e8a020` gold, `#ff5518` ember, `#3ab8ff` blue, and `#f0ece0` paper.
- Type: Bebas Neue for display titles, Cinzel for labels and record titles, Crimson Text for body copy, and Share Tech Mono for system UI.
- Home hero: full viewport, centered 256px logo, one-line `THE WORLD REBORN` display title, compact metadata, two clipped calls to action, scan/noise/particle atmosphere, and a bottom scroll cue.
- Page rhythm: numbered chapters, generous dark negative space, asymmetric two-column story/terminal sections, immersive biome cards, a five-card mission directory, compact roadmap timeline, and centered community callout.
- Shapes: thin borders, 1–4px radii, restrained shadows, clipped primary buttons, and no glassmorphism or generic gradient-dashboard framing.
- Media: reuse verified repository assets. Text records remain text-only when they do not have a real cover. Gallery placeholders are labeled archive records, not generated screenshots.

## Repeatable comparison

1. Extract the reference without changing the working tree:

   ```powershell
   git archive --format=zip --output original-site-2625adb.zip 2625adb
   ```

2. Build and preview the Astro site:

   ```powershell
   npm ci
   npm run verify
   npm run preview -- --port 4173
   ```

3. Compare the original and Astro routes at the same viewport and scroll position.

| Viewport | Original route | Astro route | Primary checks |
| --- | --- | --- | --- |
| 1440×900 | `/Wilderness-Odyssey/` | `/Wilderness-Odyssey/` | hero centering, logo scale, title line, nav density |
| 1440×900 | `/Wilderness-Odyssey/#origin` | `/Wilderness-Odyssey/#origin` | chapter number, copy width, terminal scale |
| 1440×900 | `/Wilderness-Odyssey/roadmap.html` | `/Wilderness-Odyssey/roadmap/` | page hero hierarchy, archive spacing, roadmap density |
| 768×1024 | same routes | same routes | one-column chapters, two-column gallery, mobile menu |
| 390×844 | same routes | same routes | hero fit, button stacking, menu, filters, horizontal overflow |
| 1920×1080 | same routes | same routes | maximum line lengths, card density, negative space |

For every viewport, verify keyboard focus, menu escape behavior, filters, roadmap details, terminal input/history, gallery dialog controls, and reduced-motion behavior. The Astro content collection, RSS, sitemap, redirects, draft exclusion, and GitHub Pages base path are functional requirements and must not be traded away for visual parity.
