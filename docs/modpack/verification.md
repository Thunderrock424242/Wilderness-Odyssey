# Verification record — 2026-10-17

## Actual source and preservation

The user explicitly selected the accessible Windows CurseForge profile
`Wilderness Odyssey (1)`. The tool read its `minecraftinstance.json` and actual
enabled JAR bytes; it did not use the published release, old README/mod list, or
the oversized ZIP as migration input.

* 280 enabled JARs were hashed with SHA-256 and inspected for embedded metadata.
* 279 matched CurseForge project/file identities against the launcher's provider
  hashes. `wildernessodysseyapi-5.0.0.jar` remains manual with its exact hash.
* The profile identifies Minecraft 1.21.1 and NeoForge 21.1.256. The related API
  checkout's `gradle.properties` independently specifies 21.1.256. Java 21 is the
  QA target; the installed client's actual Java runtime has not been tested here.
* 195 missing safe custom files were copied into the feature checkout: 190 config
  files, one defaultconfig and four KubeJS files. Existing values were preserved;
  49 existing differing configs and one shader config remain for deliberate review.
  Additional unreviewed resource/shader/datapack assets were reported, not copied.
* A repeat real import reported **0 added, 0 updated, 0 removed**. Profile metadata
  SHA-256 was identical before/after that scan. Fixtures also compare all source
  bytes before/after repeated sync. Neither tool operation writes the source pack.
* The existing website deployment workflow, resourcepacks, shaderpacks and
  `mods/list` have no diff against `origin/1.21-neoforge`.
* The feature branch starts before the rejected local large-ZIP commits. The
  original checkout, its untracked website/environment files, and the user's
  local branch/commits were left alone, including a deletion the user staged there.
* A tracked web-config password file and a generated API conflict log were removed
  from **tracking** and excluded from distribution. Their existing local files
  remain. Removing tracking does not erase historical Git copies; replace any
  active credential that was already shared. No secret value is included here.

## Checks actually run

| Check | Result |
| --- | --- |
| Full unittest suite on Windows, Python 3.13 | 112 discovered: 111 passed, one host symlink-creation skip |
| Full unittest suite on Windows, bundled Python 3.12.14 | 112 discovered: 111 passed, same skip |
| Windows process lifecycle fixtures | Actual harmless Python subprocesses stood in for Java; startup/timeout/stop/child cleanup, suspended Job ownership, cancellation and fresh trials covered |
| Real local import followed by repeat import | 280 files scanned; repeat had zero mod changes; no profile metadata change |
| Current client manifest validation | Correctly BLOCKED by six declared Minecraft version conflicts below |
| Fresh snapshot materialized from the staged Git tree | Same six conflicts; **zero manifest/hash drift**, including LF text portability |
| Tracked repository audit | Passed: no tracked JARs, oversized full-pack archives, flagged credentials or personal installation state |
| New workflow syntax/expression validation | actionlint 1.7.12 passed all three new workflows; binary verified against publisher checksum |
| Code/workflow/metadata whitespace check | Passed; imported upstream config whitespace was deliberately preserved |
| Website/asset preservation diff | Existing website workflow, shader/resource packs and historical mod list unchanged |

The suite covers stale/ambiguous provider identities, nested libraries and work
budgets, malformed manifests, concurrent launcher metadata changes, repeat sync,
manual download instructions, hash rejection, private-profile cache overlap,
Windows path/reparse defenses, linked report outputs, dependency closure and
side variants, multiple crash categories, nondeterminism, interacting mod groups,
signature changes, cancellation/budgets, baseline indicators and fixture ZIPs.
Cross-platform ZIP header metadata is fixed and tested with simulated platforms;
independent Linux execution and Python 3.11 are assigned to hosted CI.

Fresh review reproduced and fixed output-link writes, cache/profile overlap,
minified JSON credential detection, repeat-import asset retention, dependency
selection ambiguity, changed isolation signatures, and report/temp/cache mixing.
Each substantive fix has a regression that failed before the fix. No known
important review finding is being deferred.

## Current readiness blockers

These installed JARs declare Minecraft `[1.21,1.21.1)`, which excludes 1.21.1:

| Inventory ID | Installed filename |
| --- | --- |
| `alternate_current` | `alternate_current-mc1.21-1.9.0.jar` |
| `horsescanswim` | `horsescanswim-1.1.0.jar` |
| `iris` | `iris-neoforge-1.8.14-beta.1+mc1.21.1.jar` |
| `moreculling` | `moreculling-neoforge-1.21.1-1.0.10.jar` |
| `naturescompass` | `NaturesCompass-1.21.1-3.4.0-neoforge.jar` |
| `toofast` | `toofast-1.21.0-0.4.3.6.jar` |

These are literal declared-range conflicts, **not observed runtime crashes or
proof that each mod is incompatible**. No mod was updated, disabled, removed or
patched to silence validation. The tracked/current profile FML dependency override
tables are empty. Confirm intended author-supported files or supported loader
behavior before making a reviewed change; do not blanket-disable constraints.

All 280 top-level records currently have unreviewed dedicated-server support.
Their generated scope is client-only as a conservative projection, not a claim
that every mod is intrinsically client-only. Server QA fails closed pending side
reviews. The 279-entry standalone packwiz index omits the manual API, so it is
explicitly incomplete. The guarded installer can supply exact private local bytes
once static blockers are resolved. CurseForge export blocks that manual API.

Strict TOML and ordinary JSON are checked where understood. Relaxed JSON configs
such as Lithostitched, JSON5/JSONC/HOCON/YAML/SNBT, complex Maven/Fabric constraints,
and multiple embedded-library selections produce explicit unverified warnings.
No complete mod-specific schema catalog or online availability sweep ran.

## Proof boundaries and next work

**No actual Minecraft client or server was launched.** No real modpack startup,
world-generation performance, memory leak, gameplay scenario, multiplayer,
rendering, shader, GPU or live production compatibility was established. No
CurseForge/provider integration download was exercised with a real API key. The
NeoForge installer is pinned from publisher SHA-256 metadata; execution/hash
failure behavior was tested with fixtures, not that real installer.

The implemented live runner is startup plus idle soak. Repeatable player-driven
chunk generation/unloading, teleports, entity workloads, warmup comparisons,
MSPT/mod-count instrumentation, subsystem workload coverage, object retention
paths and client scenarios remain future work. GC/JFR/thread/native evidence is
optional and retention/MSPT/CPU measurements remain unmeasured when unavailable.
Temporary heap growth is never labeled a confirmed leak. The process-budget
limits and active-processor setting are not an OS-level CPU percentage quota.

Fixture release ZIPs were built and compared; the current actual pack cannot be
released through this exporter yet. ZIP entry content/order/time/host metadata is
deterministic in tested toolchains; reproducible bytes across independent
Python/zlib builds remain to be established. The packwiz executable was not run.
No performance baseline was fabricated or promoted. No publishing, production
deployment, issue creation, merge, private runner registration or scheduled QA was
performed. The original website workflow was not executed.

Recommended order: resolve the six metadata conflicts with evidence; review the
50 preserved custom-content differences and new assets/licenses; review server
sides/essential libraries; give the manual API a supported pinned distribution
source; then run a disposable actual pack, collect a clean baseline, and add a
measured gameplay workload. Enable scheduled QA only after that real acceptance.

See [the setup and operations guide](README.md) for Windows commands, workflow
names, protected-environment settings, private Windows QA boundaries and manual
release steps. The architectural decisions and scoped plan are in
[design.md](design.md) and [implementation-plan.md](implementation-plan.md).
