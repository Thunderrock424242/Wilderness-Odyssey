# Connected services execution ledger

Approved assessment: `docs/superpowers/specs/2026-09-23-connected-services-administration.md`. Implementation was authorized by the owner's subsequent approvals and repeated continuation requests. The later identity ruling supersedes anonymous standalone access: every Aether request requires verified identity, global restrictions span access methods, and official-server restrictions require trusted official traffic.

## Bot restoration on 2026-09-30

The Discord bot/backend implementation was recovered from archived Codex snapshot `d872994fb875f94ad97be8a4ed427de9b109b121` into `C:/Users/mason/IdeaProjects/Wilderness-Odyssey` on the `bot` branch. The restored changes are uncommitted for review. The newer repository instructions and existing committed files were preserved. Website and companion releases remain separate.

Fresh restoration validation on Node 22.13.1 passed: `npm ci`, `npm run check`, complete `npm test` (**54 passing**), and `npm run build`. The compiled command registry, connected runtime, and verification API modules load from `dist/`, and the compiled registry includes the restored commands. This did not log in to Discord or exercise live services. Apart from this updated ledger, all 57 restored files match the saved snapshot exactly.

Current bot build output: `C:/Users/mason/IdeaProjects/Wilderness-Odyssey/dist/index.js` and its compiled modules.

## Original implementation locations

The implementation was originally completed as uncommitted changes in these isolated worktrees. The paths and verification evidence below describe that original implementation; the bot's current location is recorded above.

| Project | Worktree | Source base |
| --- | --- | --- |
| Discord bot/backend | C:/Users/mason/.codex/worktrees/connected-services/Wilderness-Odyssey | 6567770 |
| Website | C:/Users/mason/.codex/worktrees/connected-status-site/Wilderness-Odyssey | 35e9e676c656aea618b97af91d0eac249981a709 |
| Minecraft mod and standalone gateway | C:/Users/mason/.codex/worktrees/connected-services-companion/Wilderness-Odyssey-API | User-updated 0a13ffb179d73e6b73c2134518ed4a5359776b99 |

The bot adds persistent SQLite identities, account tokens, separate moderation scopes, private selected reports and appeals, explicit staff assignments, dual Access assertions, bounded protected APIs, durable operations/outbox, monitoring/freshness, backup/operator tooling, and authenticated legacy account linking. Discord commands extend the existing registry. Tokens are issued through the website only; no credential is sent to Discord.

The website adds independent public v2 status evidence, verified ordinary-user accounts and one-time tokens, optional Minecraft linking, and global moderation alongside official-server moderation. Account and staff Access audiences remain separate. Matching administration contracts are synchronized with the bot; v1 public compatibility remains available.

The companion enforces verified identity before admission and again before queued generation. Official requests capture the authenticated player's UUID/profile on the server thread; private single-player may use a personal token. Fixed authenticated transports send anonymous Minecraft telemetry and attest linking. Standalone service operations use approved installed model aliases, bounded inference settings, durable IDs/state, pause/drain safeguards, and actual inference evidence. Public generation cannot issue in-game commands.

Review fixes include current staff checks after remote waits, actor/session subject alignment, private maintenance history, legacy-context ownership, link revocation, bounded Minecraft HTTP responses/cancellation, source-based health timestamps, probe replay/retention, installed-model readiness, and component replay protection across unknown observations and restarts. Missing measurements produce staff monitoring warnings without an unproven public outage.

## Verification evidence

- Bot: Node 22.13.1; `npm run check`, complete `npm test` (**54 passing**), and `npm run build` passed after final contract synchronization.
- Website: `npm run verify` passed with **80 unit tests**, Astro/gateway/content checks, production build, compiled Pages worker, and built-link/draft checks.
- Website browser/runtime: `npm run test:e2e -- --workers=2` passed **14 tests**. Synthetic routes exercise token issuance/revocation/session clearing, no automatic token retry, global moderation without Minecraft membership, role restrictions, freshness, keyboard/mobile layouts, accessibility and compiled-runtime denial of account/staff paths without configuration.
- Contract exports: all three generated JSON files reproduce exactly; bot/website administration schema, routes and exported JSON match.
- Companion: Java 21; `aiTest :aether-server:test :aether-server:verifyStandalone jar "-PcodexBuildDir=.codex-build" --no-parallel` passed. **70 focused AI tests** and **37 standalone gateway tests**, zero failures. Production sources compiled and packages were generated. This was focused verification plus packaging, not an unrestricted full repository test run.
- Bot and website production dependency audits reported **zero vulnerabilities** at verification time.
- Changed tracked-file whitespace checks passed. Generated dependency/build/cache directories remain excluded.
- Account mobile and staff global-moderation screenshots were inspected locally. These use synthetic data, not live accounts.

Artifacts:
- Bot: `C:/Users/mason/.codex/worktrees/connected-services/Wilderness-Odyssey/dist/index.js` plus its built modules; the existing hosting entry/launcher is preserved.
- Mod: `C:/Users/mason/.codex/worktrees/connected-services-companion/Wilderness-Odyssey-API/.codex-build/libs/wildernessodysseyapi-5.0.0.jar`.
- Standalone gateway: `C:/Users/mason/.codex/worktrees/connected-services-companion/Wilderness-Odyssey-API/aether-server/.codex-build/libs/Aether-Gateway.jar`.
- Website: built Pages output in its worktree's `dist/`.

## Remaining staging and activation work

Local implementation and verification do not establish production readiness. The owner confirmed Node 22 and that reinstall preservation must be explicitly selected; HTTPS reverse proxy support is believed available but is not proven on the allocation.

Before activation, staging must prove the exact host runtime/TLS/direct-origin restrictions, Access ordinary-user/staff login and audience isolation, bot/main state-file preservation and restore, actual Discord command registration/delivery, online-mode Minecraft ownership/linking, both restriction scopes and queued revocation, real Ollama inference and hardware limits, pause/drain/model changes, stale/crashed dependency handling, and outage/recovery delivery.

Inference readiness becomes unknown when actual generation/probe evidence expires. Synthetic probes are explicitly requested through the approved operation; this implementation does not periodically warm an idle model. A stopped Minecraft process loses telemetry and yields unknown availability plus a private monitoring warning. A public confirmed-offline claim requires actual trustworthy offline evidence; missing snapshots alone are not sufficient.

Production deployments, DNS/Access provisioning, live staff grants, slash-command registration and service restarts remain separately approval-gated. None were performed. No real credentials, private reports, worlds or live moderation records were used in validation. Preserve the bot database and gateway control state through every reinstall; never initialize unrestricted replacement state to work around lost data.

Setup and rollback instructions: bot `docs/connected-services.md`, website `docs/cloudflare-deployment.md`, companion `docs/ai/connected-services.md`. The historical assessment's original unchecked acceptance list is retained; this ledger records implementation evidence and live checks still outstanding.
