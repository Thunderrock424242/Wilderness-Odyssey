# SDD ledger — plan: docs/superpowers/plans/2026-11-02-site-control-center.md

Execution: inline, existing non-main `bot` checkout. The user approved the written scope in chat. Preserve pre-existing untracked Astro/test screenshots. Website source is read from its existing worktree/branch without editing it.

Pre-flight: Task 1 shares invitation schemas with the existing website form; no schema change is required. Task 2 adds content capabilities and route schemas; Tasks 3 and 4 reuse its authenticated actor, private store and revisions.

Ruling: Keep current work in the existing bot checkout; the unrelated website checkout is read-only for this change. The approved first delivery is invitations and editor backend; remaining staff UI/control additions are inventoried as the next increment, as specified in Task 5.

Ruling: The platform has PowerShell and no Bash; record the execution ledger directly instead of invoking the skill's Bash bookkeeping scripts. No commits, merges or deployments have been requested.

Baseline: initial dependencies were incomplete (`discord.js` missing). `npm ci` restored locked dependencies; the unmodified suite passed 149/149. Sandbox loopback restrictions made subsequent HTTP fixtures fail with EACCES; local tests run with escalation to permit their own temporary loopback servers.

Task 1: outsider invitation RED (membership rejection), GREEN. Raw-ID slash invitation RED, GREEN. Account binding, blocked/stalled delivery, malformed IDs and authorization loss are covered.

Task 2: real staff HTTP editor test RED (`content:read` missing), GREEN after adding actual draft routes and capabilities. Import, reference validation, Markdown rejection and revision/idempotency tests pass. Existing public content was exported using the website's own snapshot exporter for import verification.

Task 3: private-image HTTP test RED (415), GREEN with bounded uploads and byte validation. Private reads, unauthorized access and forged SVG-as-PNG tests pass.

Task 4: publication and repository regression tests written before their modules. Private frozen jobs, current authorization, reviewed content-only GitHub branches/PRs, source conflict checks and matching workflow/deployment observation implemented. Synthetic transport tests pass; no real repository writes or deployments.

Ruling: Only supported content capabilities are added. Configuration capabilities and richer website `/playtests` contracts are not advertised because their backend implementations are separate work; the singular existing `/playtest` diagnostics API is preserved. Do not turn their current errors into fake successful controls.

Validation in progress. First full post-change run exposed one obsolete runtime test requiring guild membership; updated that test's Discord boundary to user lookup while retaining blocked/stalled-delivery assertions. No unrelated implementation failure was found.

Independent review: four important findings reproduced with failing regressions and fixed: fair ordering for queued publication work, read-only recovery after an ambiguous PR response and revoked authority, malformed PNG rejection, and bounded idempotency response storage. PNG CRC checks also identified a corrupt IDAT CRC in the original test fixture; repaired the fixture checksum after independently comparing expected and actual CRC values. Publication requests are capped at 32 pending jobs and completed jobs discard frozen source payloads.

Task 1: complete — outsider and raw-ID command regressions pass; existing stalled-delivery test updated for the new account boundary.
Task 2: complete — real staff HTTP draft flow, source import and unsafe-content/revision tests pass. Existing website exporter snapshot imports all 9 transmissions and 3 structured pages.
Task 3: complete — private-image HTTP flow and malformed PNG regression pass.
Task 4: complete — synthetic GitHub transport, reviewed publication, fair queue and ambiguous-response recovery regressions pass. No live publication performed.
Task 5: complete — docs/website-control-center.md records setup, rollout and the remaining control-center inventory. Broader staff UI, managed connection settings and plural playtest facade remain the explicitly separate next increment.

Verification: `npm run check`, `npm run build` and final `npm test` passed (166/166). Node.js 22.13.1 full suite also passed 166/166 after the four review fixes. `git diff --check` passed. Changes remain local, uncommitted and undeployed.
