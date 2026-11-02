# Website lore v1.0 alignment report

Reviewed 2026-11-02 against [Core Lore v1.0](WILDERNESS_ODYSSEY_CORE_LORE.md) and [Expanded Lore v1.0](WILDERNESS_ODYSSEY_EXPANDED_LORE.md).

## Website alignment applied — 2026-11-02

Following approval to align the public site, the homepage, feature cards, terminal, lore article and metadata, gallery captions, login label, survivor-log presentation, and planned roadmap now follow Core Lore v1.0. The previous lore article keeps its permanent URL; gallery IDs and roadmap IDs remain stable. The Site 0.6 patch notes carry a dated clarification while retaining the historical release account.

Survivor fragments are explicitly illustrative, not additional canon. Extra-rift claims, mirror-world origins, unsupported symbol trails, and invented progression-item names were removed from current public copy. No gameplay, backend contracts, authentication, or travel mechanics changed. Both shared reference files remain unmodified. Open mysteries and future integration work remain undecided.

The original audit below is retained as historical evidence. Its conflict descriptions and line numbers describe the pre-alignment sources, not unresolved current claims. The implementation claims in the integration table remain bounded to this website checkout.

### Current validation and URL compatibility

- Full verification passed: no TypeScript diagnostics, 245 unit tests, production build, and generated-site link checks.
- All 89 browser tests passed, including a new Pages runtime check covering retired lore tag URLs with slash, no-slash, and HTML variants.
- Inspected nine affected routes at 1440px and 390px widths: no horizontal overflow or unexpected browser errors; confirmed the Reservoir-9 terminal response. Desktop/mobile screenshots are local test artifacts.
- Public-path change: retired tag archives for Project Threshold, Blackout Archive, The Siren Night, and Echo Earth now redirect through `public/_redirects` to current archives. Existing Cloudflare root routes and legacy GitHub Pages redirects remain supported. The original transmission permalink is unchanged.
- Both shared reference hashes remain identical to the supplied originals. No backend or modpack implementation was changed or deployed.

## Original audit: scope and file changes

This checkout is the Astro website and Cloudflare Pages gateway, not the API or main modpack implementation. The audit covers relevant website content, documentation, browser interactions, and gateway contract sources. Backend and modpack behavior cannot be verified here. Existing untracked `data/` is outside this audit and was left untouched.

- Added both complete supplied references under `docs/lore/`, copied without editing their contents.
- Linked both references and this report from `README.md` and added a short reference under Content Management in `AGENTS.md`.
- Added this repository-specific report separately from the shared references. No public content, routes, contracts, dependencies, gameplay, or service behavior changed.

The supplied `WILDERNESS_ODYSSEY_CODEX_MESSAGE.md` repeats the task; it is not a third lore authority and was not installed as canon.

Source SHA-256 values, for checking copies in other repositories:

| Reference | SHA-256 |
| --- | --- |
| `WILDERNESS_ODYSSEY_CORE_LORE.md` | `A10D5844A42D8AE61ABEF4AB2883A31F847FE6215C88640E15AE909A50F19845` |
| `WILDERNESS_ODYSSEY_EXPANDED_LORE.md` | `D577B3F920E53B724A8FE5EB948C295A7AF8907269353B7DC5E3467A0E08A11D` |

Only this checkout was updated. Cross-repository equality requires comparing the other checkouts with these supplied files; it has not been verified here.

## Conflicts and proposed corrections for review

These findings remain in the existing sources. Proposed corrections below are review recommendations, not changes to canon or authorization to implement new features. Paths are relative to the repository root; line numbers refer to the audited source.

| Source | Finding | Proposed correction for review |
| --- | --- | --- |
| `src/pages/index.astro:50`; `src/content/transmissions/project-threshold-blackout-archive.md:17`; `src/scripts/terminal.ts:139` | An accelerator activates buried meteor material to open a doorway. Core §1 instead establishes clean-energy/dimensional research, instability, the meteor's passage creating the unique rift, then impact. | Revise the public origin account to the established sequence; do not silently repurpose Reservoir-9 as the experiment site. |
| `src/content/transmissions/project-threshold-blackout-archive.md:19`; `src/data/features.ts:62` | Prehistoric life and broken pieces of reality arrive through the opening, presented as established history. This mechanism is absent from v1.0; Core §2 establishes meteor-derived ecological effects. | Remove or qualify the unsupported explanation in a reviewed content change. This does not require removing creatures or gameplay systems. |
| `src/data/features.ts:94`; `src/data/editable/gallery.json:48`; `src/data/survivorLogs.ts:44` | Plural stabilized rifts, energy leaking from multiple rifts, and a spontaneously appearing shard-associated opening imply additional lore-level passages or uncontrolled present-day access. Core §§1, 5, 7 preserve one original, initially dormant passage. | Clarify the relationship to the single original rift and distinguish residual observations from traversable gateways. Leave vanilla portals and unrelated gameplay travel intact. |
| `src/content/transmissions/project-threshold-blackout-archive.md:25`; `src/scripts/terminal.ts:140`; `src/data/features.ts:94`; `src/data/editable/gallery.json:25`; `src/data/editable/roadmap.json:182`; `src/pages/index.astro:83` | Echo Earth is described as the same Earth remembered incorrectly or a damaged mirror world, with travel-oriented copy. Core §5 establishes an accidental human refuge with varied settlements and environments; §7 makes communication/science precede broader travel. | Review the mirror-world claims and present the established refuge context at an appropriate spoiler level. Do not promise routine travel or invent settlement politics. |
| `src/scripts/terminal.ts:133` | The terminal denies any verified Reservoir-9 record in canon. Core §3 establishes its water/research role and connection to Eden. | Distinguish unavailable in-world records from the project's established lore; preserve the unresolved exposure route. |
| `src/pages/lore/index.astro:11`; `src/pages/lore/index.astro:12` | Metadata calls the older story established and the archive canon-reviewed despite these conflicts. | Re-review the archive and its metadata together before continuing to describe it as aligned with current canon. |

Additional alignment gaps and unapproved details:

- `src/pages/index.astro:52` and `src/content/transmissions/project-threshold-blackout-archive.md:27` frame survival as the goal but omit the three-world communication/research milestone. Survival remains compatible; a future reviewed synopsis should include the milestone without implying a hard ending or automatic permission for physical travel.
- `src/data/features.ts:52`, `src/data/features.ts:86`, `src/data/editable/site.json:4`, `src/data/editable/roadmap.json:79`, `src/data/editable/roadmap.json:163`, `src/data/editable/roadmap.json:201`, `src/data/editable/gallery.json:15`, `src/pages/index.astro:82`, and `src/pages/login/index.astro:26` carry Project Threshold or related older framing. Core does not approve Project Threshold, The Siren Night, Exodus Protocol, the Blackout Archive, Stabilizer Core, or Rift Key as canonical names. Their retention or mapping needs a separate decision, not an assumption that all names are inherently contradictory.
- `src/data/survivorLogs.ts:60` repeats the accelerator/material explanation in a redacted record. `src/data/survivorLogs.ts:29` labels exposure as "INFECTED"; that label alone does not prove a replicating pathogen, but future copy must not treat all meteor effects as infection. `src/data/features.ts:102` and `src/data/editable/gallery.json:41` describe lizard/Oliver symbol trails not established by v1.0. Review these details without inventing the journalists' later fates or revealing their boarding outcome in early records.
- `src/content/transmissions/site-0-6-lore-roadmap.md:17` and `src/content/transmissions/site-0-6-lore-roadmap.md:21` are historical patch notes claiming the meteor origin was replaced by current canon. Preserve the release history; consider a reviewed dated clarification pointing readers to v1.0 rather than silently rewriting what the release reported. `src/content/transmissions/version-0-1-0-takes-shape.md:23` mentions a separate internal lore bible; the installed references now provide a concrete documentation destination.
- `docs/dashboard-design-and-remembered-sign-in.md:3` uses Echo Earth / Blackout Archive as a visual direction. Styling terminology alone does not establish story facts or justify redesigning authentication screens.

No relevant source located in this audit assigns the Ancient City/Deep Dark as the rift origin, resolves the awakening signal, makes Beal/Nathan living present-day NPCs, or forces a story-completion reset. Absence from this website is not proof about either external repository.

## Existing interfaces and future integration opportunities

"Existing" below means code or content present in this checkout, not proof of a deployed backend or completed modpack feature. Future opportunities require separate design and implementation work.

| Area | Existing here | Future opportunity, not implemented here |
| --- | --- | --- |
| Aether | `contracts/v1/status.ts`, `contracts/v1/admin.ts`, `contracts/v1/routes.ts`, `server/gateway.ts`, and `src/scripts/staff.ts` provide availability, inference controls, restrictions, submitted report excerpts, and approved model administration through trusted services. | Canon-aware records or companion presentation would need an approved backend interface. Operational model controls do not implement Eden's AI, its memories, or its preservation decision. |
| Narrative Engine | No Narrative Engine interface was found in the inspected gateway sources. `src/scripts/terminal.ts` is a local presentation interaction. | A separately designed trusted narrative service could supply reviewed, spoiler-appropriate records; the website must not fabricate authoritative narrative state. |
| World events | `contracts/v1/status.ts` and `contracts/v1/routes.ts` expose operational incidents and maintenance. These are not story events. | Any story-event feed needs a separately agreed contract and authoritative backend producer. Do not reinterpret infrastructure incidents as narrative triggers. |
| Persistent discoveries | `src/content/` and `src/data/survivorLogs.ts` hold published records, not per-player discovery persistence. | If approved, present discoveries from authoritative game/API progression; public publication status must not be treated as player knowledge or progress. |
| Quests | `src/data/editable/roadmap.json` describes future discovery tasks; no gameplay quest state/interface was found in the inspected sources. | Quest summaries/progression would require separate modpack/API work. Website roadmap completion is not quest completion. |
| Eden and Reservoir-9 | The site has generic awakening/bunker content and a Reservoir-9 terminal query, but no verified facility implementation in this checkout. | Reviewed public copy and records could reflect the canonical opening, optional Eden restoration, and Reservoir-9's separate water/research role. Physical layouts, exposure mechanics, and quest triggers remain external design work. |
| Environmental storytelling | `src/content/transmissions/`, `src/data/features.ts`, `src/data/survivorLogs.ts`, and editable roadmap/gallery records are existing presentation channels. `contracts/v1/authoring-routes.ts` supports reviewed content publication; it does not generate game structures. | Use these channels to document approved discoveries and distinguish plans from implemented modpack content. Do not turn Expanded concepts into promised structures, biomes, NPCs, or quests. |
| Later reconnection | `src/data/editable/roadmap.json` has a planned Echo Earth track, not evidence of working interworld communication or transit. | A reviewed roadmap could describe communication and regulated scientific contact among Earth, Mars, and Echo Earth, with indefinite play afterward. Limited safe transit remains later research, subject to restrictions and the one-rift rule. |

Trusted backend authorization remains mandatory for privileged operations. No new endpoint, persistence format, world-generation change, quest, NPC, or dependency is introduced by this report. See [API integration](../api-integration.md) for current service boundaries.

## Decisions still open

The exposure route into the player's body/preservation process; Aether's prioritization and damaged memory; the awakening signal's sender/purpose; the meteor's ultimate origin; exact dates, coordinates, evacuation numbers, and facility layouts; the journalists' later lives, memorials, and companions' fates; and the equipment, safety evidence, and permissions for later transit remain unresolved. Atlas and Expanded placeholder settlement names remain noncanonical concepts. Additional factions, political details, and plot chapters require separate decisions.

Core takes precedence; only Established material is canon. The milestone is communication and regulated research across the three worlds, with continued gameplay. Preserve the unique lore-level rift without banning vanilla Minecraft portals or unrelated travel mechanics. Keep repository-specific findings here, and maintain the complete shared references identically in the API and modpack repositories.

## Validation

- Both installed references match the supplied Downloads files byte-for-byte and match the SHA-256 values above.
- All 17 local Markdown links in the changed documentation resolve; all 36 cited source locations exist. `git diff --check` passes.
- `npm run verify` passes: no TypeScript diagnostics, 244 unit tests, static/Pages build, and generated-site link checks.
- `npm run test:e2e` passes: 88 browser tests against production previews, including keyboard/mobile behavior and Pages runtime root/legacy URL checks.
