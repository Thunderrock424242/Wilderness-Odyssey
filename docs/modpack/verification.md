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
| Follow-up full suite on Windows, Python 3.13 | 123 discovered: 122 passed, one host symlink-creation skip |
| Follow-up full suite on Windows, bundled Python 3.12.14 | 123 discovered: 122 passed, same skip |
| Runtime-fix full suites on Windows Python 3.13 and 3.12.14 | 125 discovered: 124 passed, one host symlink-creation skip, each |
| Independent focused follow-up review | 68 focused tests passed, one skip; zero client/server static validation errors; no remaining important finding in reviewed code |
| Windows process lifecycle fixtures | Actual harmless Python subprocesses stood in for Java; startup/timeout/stop/child cleanup, suspended Job ownership, cancellation and fresh trials covered |
| Real local import followed by repeat import | 280 files scanned; repeat had zero mod changes; no profile metadata change |
| Current client and server manifest validation | Both pass with explicit runtime/schema warnings; the six original range errors were validator false positives, corrected below |
| Fresh snapshot materialized from the initial staged Git tree | **Zero manifest/hash drift**, including LF text portability; initial range errors were subsequently corrected |
| Tracked repository audit | Passed: no tracked JARs, oversized full-pack archives, flagged credentials or personal installation state |
| New workflow syntax/expression validation | actionlint 1.7.12 passed all three new workflows; binary verified against publisher checksum |
| Code/workflow/metadata whitespace check | Passed; imported upstream config whitespace was deliberately preserved |
| Website/asset preservation diff | Existing website workflow, shader/resource packs and historical mod list unchanged |
| Hosted CI on `3b1d99a` | [Run 39035566829](https://github.com/Thunderrock424242/Wilderness-Odyssey/actions/runs/39035566829) passed manifest readiness, Ubuntu/Python 3.11 and Windows/Python 3.11 tool/repository checks |

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

## Follow-up fixes and current readiness

The initial validator reported six installed JARs declaring Minecraft
`[1.21,1.21.1)`:

| Inventory ID | Installed filename |
| --- | --- |
| `alternate_current` | `alternate_current-mc1.21-1.9.0.jar` |
| `horsescanswim` | `horsescanswim-1.1.0.jar` |
| `iris` | `iris-neoforge-1.8.14-beta.1+mc1.21.1.jar` |
| `moreculling` | `moreculling-neoforge-1.21.1-1.0.10.jar` |
| `naturescompass` | `NaturesCompass-1.21.1-3.4.0-neoforge.jar` |
| `toofast` | `toofast-1.21.0-0.4.3.6.jar` |

Those errors were **validator false positives**, not incompatible mods. The
installed NeoForge 21.1.256 and target 21.1.262 both use FML **4.0.45**. Its
[immutable VersionSupportMatrix source](https://github.com/neoforged/FancyModLoader/blob/44982c69cddbb01b27318dfcac0b3c707b3e94a9/loader/src/main/java/net/neoforged/fml/loading/VersionSupportMatrix.java)
explicitly accepts Minecraft **1.21** and NeoForge **21.0.166** aliases when the
actual Minecraft version is 1.21.1. The source JAR and installed binary were also
inspected. This is separate from a user-configured dependency override table.
Validation and isolation now share that verified matrix, while unknown FML and
genuinely incompatible ranges still fail. No mod bytes were changed.

The new explicit `loader` command checked official Maven metadata and pinned
**NeoForge 21.1.262** for Minecraft 1.21.1. Its official installer SHA-256 is
`e86f5d78ed310465bd1ecf79823abcbc58782699b068ac776f4c5e226d994a8f`.
The live profile remains **21.1.256**, recorded separately in migration provenance.
Repeated imports preserve the deliberate Git target. CI never chooses "latest."

All **280** records now have hash-bound side reviews: **232** use exact-file
Modrinth SHA-1/SHA-512 matches and environment evidence; **47** use provider-proven
file identities plus author project declarations; the manual API uses its own
author's project declaration. These are installation-scope decisions, not runtime
compatibility results. Detailed evidence URLs and scope are in `review.json`.
The current split is **229 both / 49 client / 2 dedicated server**. BlueChunks
follows its required BlueMap dependency into the dedicated-server distribution;
leaving it in the client projection correctly failed dependency validation.

The actual enabled files were reconstructed offline into new external copies:
**278 client JARs** and **231 server JARs**, with exact SHA-256 checks. Neither
operation launched Minecraft or modified the source profile. The 279-entry
standalone packwiz index still omits the manual API, so it remains explicitly
incomplete; use the guarded installer with the exact private local API.

Local CurseForge export now supports explicit `--include-owned-api` authorization
with `--local-mods`. It includes only the exact pinned owned API JAR in overrides,
and **277** client CurseForge file references; other manual JARs remain blocked.
Two actual local ZIP builds had identical SHA-256:
`106472086311309c1f8ff5ab8a4a6401a5caaaa21f59474cf42cf6356866a25f`.
No artifact was published. Hosted packaging/full online reconstruction still need
an approved exact public API source; no version-only match or invented URL was used.

The first hosted validation exposed a Linux cancellation-fixture failure. Its
mock injected Ctrl+C on every later sleep, including POSIX subprocess cleanup.
It now injects once and allows cleanup to finish, matching a single cancellation.
The Windows native metadata fallback also disables curl config loading before
other arguments, retaining certificate/host verification and forbidding redirects.
A focused independent review found that config-loading gap; it was fixed and
the review found no remaining important issue in the changed code scope.

Strict TOML and ordinary JSON are checked where understood. Relaxed JSON configs
such as Lithostitched, JSON5/JSONC/HOCON/YAML/SNBT, complex Maven/Fabric constraints,
and multiple embedded-library selections produce explicit unverified warnings.
No complete mod-specific schema catalog or online availability sweep ran.

## Actual disposable server acceptance

After the user explicitly accepted the Minecraft EULA, actual Java 21 server QA
ran against the reconstructed 231-JAR server projection with **NeoForge 21.1.262**,
**Corretto 21.0.12.1**, **6144 MiB** heap and seed **424242**.

The first run installed NeoForge successfully but failed during mod construction.
Resourceful Lib `GlobalStorage.<clinit>` passed the missing Windows
`LOCALAPPDATA` variable to `Path.of`; exact installed-byte `javap` inspection
confirmed this. The harness had stripped that standard environment variable.
The fix supplies private trial-local home/app-data/XDG directories, plus explicit
Java `user.home` and `java.io.tmpdir`, rather than inheriting personal directories
or changing mod versions. A failed-before/fixed-after regression covers the path
and secret-isolation contract. The fixture's nested Python also now uses the
outer interpreter path so Store Python's private-profile rewriting cannot break
its child-process cleanup test.

The corrected run, `pr37-runtime-02`, **passed**:

| Phase | Actual result |
| --- | --- |
| Official installer | Succeeded, 22.78 seconds; downloaded installer matched pinned SHA-256 |
| Startup | Exact Minecraft readiness observed after 116.64 seconds from JVM launch |
| Idle soak | Completed 120.00 seconds |
| Graceful shutdown | Exit code zero, 7.50 seconds; no forced termination |
| Cleanup | Disposable `mods`, `qa-world`, private setup/runtime directories and owned Java process removed |

The API generated its starter area and modded dimensions during first-world
startup. That incidental work is not a controlled worldgen benchmark. Two raw
heap samples were approximately **4.50 GiB** and **5.74 GiB**; thread counts were
382 and 385. Heap was near the 6 GiB ceiling, but post-GC retention/GC trends and
CPU/MSPT are unmeasured by the summary; these samples do **not** establish a leak.
Raw GC logs and bounded thread stacks were retained privately.

Nonfatal diagnostics remain: missing optional biome/dimension IDs in Cold Sweat
configs, Integrated API data parsing messages, a malformed Natural Sizes language
asset, and repeated dummy-block-entity warnings during starter-area generation.
A passed lifecycle does not clear these warnings or justify replacing preserved
custom settings. No mod was silently removed to obtain this result.

The run records source `3b1d99a` plus **dirty=true** for the in-progress runtime
fixes; it is not a promoted clean baseline. No baseline was created. Full logs
and reports remain outside Git under the local modpack reports directory.
The parser now preserves fatal FML cause chains even when NeoForge returns code
zero, rather than presenting only the last launcher frames. Known loading
failures do not automatically enable binary isolation or assign mod blame.

## Proof boundaries and next work

**No Minecraft client or launcher ZIP import was tested.** One successful
dedicated-server startup/idle-soak/shutdown run does not establish long gameplay,
repeatable worldgen performance, retained-object leaks, multiplayer, rendering,
shader, GPU or live production compatibility. No CurseForge/provider integration
download was exercised with a real API key. The official NeoForge installer was
actually executed successfully in the disposable copy.

The implemented live runner is startup plus idle soak. Repeatable player-driven
chunk generation/unloading, teleports, entity workloads, warmup comparisons,
MSPT/mod-count instrumentation, subsystem workload coverage, object retention
paths and client scenarios remain future work. GC/JFR/thread/native evidence is
optional and retention/MSPT/CPU measurements remain unmeasured when unavailable.
Temporary heap growth is never labeled a confirmed leak. The process-budget
limits and active-processor setting are not an OS-level CPU percentage quota.

Fixture and actual local owner-authorized release ZIPs were built and compared.
Launcher import/runtime testing and hosted publication remain unperformed.
ZIP entry content/order/time/host metadata is deterministic in tested toolchains;
reproducible bytes across independent
Python/zlib builds remain to be established. The packwiz executable was not run.
No performance baseline was fabricated or promoted. No publishing, production
deployment, issue creation, merge, private runner registration or scheduled QA was
performed. The original website workflow was not executed.

Recommended order: review the 50 preserved custom-content differences and new
assets/licenses and nonfatal runtime diagnostics; give the manual API a supported
pinned distribution source; repeat acceptance from a clean committed checkout
before deliberately collecting a baseline, and add a
measured gameplay workload. Enable scheduled QA only after that real acceptance.

See [the setup and operations guide](README.md) for Windows commands, workflow
names, protected-environment settings, private Windows QA boundaries and manual
release steps. The architectural decisions and scoped plan are in
[design.md](design.md) and [implementation-plan.md](implementation-plan.md).
