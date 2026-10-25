# Maintaining the pinned modpack

The current local CurseForge profile supplies installed versions. Git stores the
inventory, hashes, packwiz metadata and reviewed custom files. Installed JARs,
profile exports, accounts, saves, logs, recordings and QA worlds stay outside Git.
The website branch and its deployment workflow remain separate.

The first real import scanned **280 enabled JARs** from the user-selected
`Wilderness Odyssey (1)` profile. **279** have CurseForge file identities verified
against provider hashes. The local Wilderness Odyssey API 5.0.0 JAR is **manual**.
Minecraft **1.21.1** and NeoForge **21.1.256** were read from that profile; the API
development project independently uses the same loader version. The Git target
is now **21.1.262**, the latest stable **21.1.x** build checked against official
NeoForge metadata on 2026-10-17. The live profile stays unchanged at 21.1.256.
Client/server files were reconstructed and local release ZIPs compared. An actual
disposable server passed startup, a 120-second idle soak and graceful shutdown
with the user's explicit EULA acceptance. Read [verification.md](verification.md)
for the harness fix, remaining warnings and proof limits.

For future mod/config/loader updates, start with the short
[update checklist](updating.md).

## Windows setup and everyday synchronization

Install Python 3.11 or newer and Git. A server QA run also requires a full Java 21
JDK, including `jcmd` for optional memory samples. The importer needs no Python
packages, packwiz executable, API key, Minecraft login or Java process.

Run these commands from the feature checkout, after closing launcher updates:

```powershell
py -3 -m tools.modpack sync --profile 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)' --reports "$env:TEMP\wo-sync"
```

That is a dry run. Review `sync.md` and `sync.json` in the report directory. They
list added/updated/removed/unresolved mods and custom-file differences. They do
not contain raw CurseForge account/profile metadata or JAR contents.

Apply the same scan when ready:

```powershell
py -3 -m tools.modpack sync --profile 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)' --reports "$env:TEMP\wo-sync" --apply --copy-new-configs
py -3 -m tools.modpack validate --reports "$env:TEMP\wo-validation"
py -3 -m unittest discover -s tests/modpack -v
git status --short
```

`--copy-new-configs` copies only safe **missing** files from `config`,
`defaultconfigs`, `kubejs`, `scripts` and `datapacks`. It skips credentials,
archives, JARs, large files and personal-state filenames. It never replaces an
existing file. Updated existing configs, new resource/shader packs and datapack
ZIPs appear in the report for deliberate content/distribution review. The initial
import copied 195 missing custom files; it preserved 50 existing differing paths.
No launcher profile, JAR, save or player file is written, disabled or deleted.

After a reviewed config change or deliberate inventory edit:

```powershell
py -3 -m tools.modpack reindex
py -3 -m tools.modpack validate --reports "$env:TEMP\wo-validation"
```

New imported files remain indexed across repeat scans before staging. Stage only
the reviewed config/metadata/tool paths. Index hashes use LF for text so Windows
and Linux checkouts agree; binary assets and JAR hashes remain byte-exact.
`mods/list` is preserved as historical reference, not an exact dependency lock.

## What is authoritative

| Files/module | Responsibility |
| --- | --- |
| `modpack/lock.json` | Import-owned exact installed inventory: SHA-256, sizes, mod IDs, versions, dependencies and identity evidence |
| `modpack/review.json` | Deliberate side/source/essential decisions bound to the exact JAR SHA-256 |
| `pack.toml`, `index.toml`, `mods/*.pw.toml` | Deterministically generated standard packwiz projection, exact file IDs and hashes, pinned against automatic update |
| `modpack/assets.json`, `generated-files.json` | Reviewed custom-content list and ownership of generated files |
| `metadata.py`, `sync.py` | Read embedded NeoForge/Forge/Fabric and nested-library metadata; compare current installed files |
| `pack.py`, `repository.py` | Validate integrity, numeric ranges, side/dependency evidence, tracked binaries/private files and simple config syntax |
| `providers.py`, `install.py` | Restricted-provider handling, content cache, exact-byte reconstruction into a fresh directory |
| `loader.py`, `qa/tool-lock.json` | Explicit stable Minecraft 1.21.1 loader selection, official FML dependency and installer checksum |
| `diagnostics.py`, `runner.py` | Crash classification, bounded actual server lifecycle, optional JVM evidence and reports |
| `isolation.py` | Dependency-aware repeated delta debugging via the same disposable scenario |
| `regression.py`, `release.py` | Explicit comparable baselines and deterministic CurseForge reference ZIPs |

Do not edit generated packwiz files by hand or run `packwiz update` as the version
authority; it will cause drift against the scanned inventory. The generator uses
the [packwiz pack format](https://packwiz.infra.link/reference/pack-format/pack-toml/)
and [CurseForge metadata downloads](https://github.com/packwiz/packwiz/blob/master/curseforge/curseforge.go).
This keeps a standard interchange view without downloading a separate tool for a
read-only scan. The packwiz executable itself has not been exercised here.

**The current standalone packwiz projection is incomplete:** manual files such as
the Wilderness Odyssey API are absent from its index. Its header and validation
report disclose that fact. Use the guarded `tools.modpack install` command with
private local files for full reconstruction.
Do not advertise a generic packwiz installation as the complete current pack.

## Review sides and manual sources

NeoForge dependency-side metadata does not establish whether its containing mod
can run on a dedicated server. Unknown entries remain `side: unknown`; their
generated packwiz scope is conservatively `client`, meaning client-profile
candidate with server support unreviewed, **not** a proven client-only mod.
Server validation fails until sides are explicitly reviewed from author evidence.
Runtime testing is a separate requirement. Fabric's explicit environment can
supply a side when available. All 280 current records have hash-bound side reviews:
232 use exact-file Modrinth evidence, 47 use provider-identified author projects,
and the manual API uses its author's project declaration. The current split is
229 both, 49 client, 2 dedicated server. BlueMap and its required BlueChunks add-on
are excluded from the client reconstruction. No installed JAR was removed.

An example review entry (replace both the key and hash with actual inventory data):

```json
{
  "some_mod": {
    "sha256": "EXACT_64_CHARACTER_HASH_FROM_LOCK",
    "side": "both",
    "essential": true
  }
}
```

Then rerun `sync --apply`. Updated bytes invalidate the review. `essential` protects
that mod and its transitive dependencies during isolation. Required libraries
also remain through dependency closure. For ambiguous metadata or an unknown
dependency graph, live isolation stops instead of guessing.

Manual/unresolved files require the **exact pinned bytes** in `--local-mods`.
Neither filenames nor a fuzzy launcher match prove a CurseForge project/file ID.
For direct/Modrinth sources, a hash-bound review may provide a source with `kind`,
`url`, `permission: "author-approved"`, and pinned Modrinth `project_id` and
`version_id` when applicable. This records a deliberate download authorization;
it does not enable arbitrary non-CurseForge redistribution in the release exporter.
Your own manual API has a separate explicit local export option described below.

## Reconstruct without touching your installed pack

```powershell
py -3 -m tools.modpack install --destination "$env:TEMP\wo-client-copy" --local-mods 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)\mods' --offline
```

The destination must be new/empty and outside the repository and source profile.
The installer never modifies an existing installation. It validates before
copying and rehashes cached/local/downloaded files. Partial staging copies are
cleaned up if reconstruction fails. This reconstructs files; it does not launch a
client or install a client launcher/loader.

No API key is needed when supplying the exact installed files with `--local-mods`
and `--offline`, as in the local commands above. The Wilderness Odyssey API mod
does not require a CurseForge key. For optional online CurseForge downloads,
`CURSEFORGE_API_KEY` belongs only in your process or protected CI environment,
never in Git. The installer asks the official API for
the exact file and honors current author distribution restrictions. Restricted,
unavailable or unsupported files fail with `--local-mods` instructions. It never
constructs a CDN URL to bypass a restriction or substitutes a newer file.
An optional `--cache` must also be outside the repository and the source profile.

`--offline` prevents harness mod/installer downloads. NeoForge's official
`--installServer` bootstrap can still resolve runtime libraries; fully offline
bootstrap requires a separately prepared library cache/network boundary.

## Actual server QA and conditional isolation

Client and server static validation now pass, with runtime/schema warnings.
Review the pinned installer in `qa/tool-lock.json` when deliberately updating the
Git target with `loader --latest --apply` or `loader --version ... --apply`.
Then, using a full Java 21 JDK and an adequately sized disposable directory:

```powershell
py -3 -m tools.modpack validate --side server --reports "$env:TEMP\wo-server-validation"
py -3 -m tools.modpack qa --destination "$env:TEMP\wo-server-copy" --reports "$env:TEMP\wo-server-report" --local-mods 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)\mods' --java 'C:\Path\To\jdk-21\bin\java.exe' --memory-mb 6144 --startup-seconds 600 --soak-seconds 120 --profiling basic --accept-eula
```

`--accept-eula` is your explicit acceptance of the
[Minecraft EULA](https://www.minecraft.net/eula). No workflow assumes acceptance
from a successful download. `--profiling off` reduces overhead; `jfr` adds a bounded
recording; `native` enables native-memory tracking. Post-GC retention, GC history,
threads and native/CPU information are reported only when actually collected.
No forced GC or heap dumps run by default. Treat recordings/logs as potentially
sensitive when sharing them.

Java home, temporary files, Windows app data and XDG locations are redirected
into private per-trial directories, which are cleaned after the owned processes
stop. `ActiveProcessorCount=4` guides JVM thread-pool sizing; it is not an OS CPU
percentage quota or a cap on arbitrary mod-created threads.

The successful local run used 6144 MiB and approached that heap ceiling. The
hosted workflow's conservative 4096 MiB default is not proven sufficient for this
pack; it also offers 6144 MiB for a runner with enough remaining host memory.
Hosted Minecraft execution itself remains untested and gated on API availability.

The default live scenario is fixed-seed startup plus an **idle soak**,
followed by a stop command and bounded shutdown. Readiness requires the exact
Minecraft `Done (...)! For help, type "help"` server message followed by a fresh
reply to the owned console probe. Installer success or asset-loading progress
cannot count as startup. Each run owns and cleans its
disposable world; only bounded diagnostic artifacts remain. Ctrl+C cancels the
current process/trial, preserves available evidence and stops further isolation.

Add `--isolate --max-tests 12` only when investigating a reliable startup/soak
failure. It activates only for an uncertain trace-backed crash, confirms repeated
full-pack signatures, preserves dependency closures, and compares repeated
subsets/complements against the original signature. Known dependency failures,
OOM/JVM faults, timeouts, warnings, success and changed signatures do not establish
an isolated culprit. Rankings are observations, not automatic blame or removal.
Each trial uses the same seed and scenario in a fresh external copy. Budgets limit
tests, JVM memory, startup/soak time, wall-clock isolation and active processors.

Gameplay/worldgen/teleport/entity/chunk-unloading workloads, warmup cycles, MSPT,
loaded-mod counts and detailed executor attribution are not implemented yet.
JFR and bounded stacks can support later investigation of weather, anomalies,
worldgen, asynchronous tasks and Aether when present; the harness does not claim
to exercise those systems. Client rendering, shaders, GPU, multiplayer and
client-only memory problems require separate client tests.

## GitHub workflows and execution security

* **Validate pinned modpack** runs secretless static/tool checks on hosted Windows
  and Linux. Pack-readiness failures are separate from tool-test failures. Current
  client manifest readiness currently passes with explicit unverified warnings.
  A feature PR triggers one validation run; pushes to the target branch validate
  merged changes without duplicating the PR's run.
* **Disposable Minecraft server QA** is hosted-only and accepts trusted manual
  runs on `1.21-neoforge`. Configure a `modpack-qa` environment with required
  reviewers and deployment branches restricted to that branch. Its current
  reconstruction step uses online provider downloads; it has no uploaded-pack
  input yet. For the requested operation without API keys, use the local
  `--local-mods --offline` path until a private pack-input path is implemented.
  Optional CurseForge credentials, if deliberately used, belong only in that
  protected environment. There is no PR-triggered server job and no public
  self-hosted runner job.
* The weekly schedule remains inert until a successful real QA run and deliberate
  repository variables `ENABLE_MODPACK_QA_SCHEDULE=true`,
  `MODPACK_QA_BASELINE_VALIDATED=true`, and `MODPACK_QA_ACCEPT_EULA=true`. Keep them
  unset during initial migration. Reviewers may still need to approve scheduled
  environment deployments. Cache keys include lock/tool hashes and every hit is
  rehashed. There are no broad stale-cache restore keys.
* **Build pinned CurseForge ZIP (no publishing)** only creates a CI artifact. It
  never publishes to CurseForge or replaces a release. Manual/non-CurseForge files
  block the default hosted export until an exact approved download path exists.
  Local owner-authorized API packaging is available below. Existing resource and
  shader assets retain their existing ownership; review any new asset's license
  before adding it to the tracked content list.

Actions are pinned to verified commit SHAs, use `contents: read`, persist no Git
credentials, and retain diagnostics for seven days. Server QA uploads a separate
sanitized text export capped at 32 MiB, including its manifest. Raw JFR recordings,
heap binaries, worlds, installations and account files are excluded. No workflow files duplicate
issues or automatically change a baseline. Automatic cancellation can terminate a
hosted VM without graceful Minecraft shutdown; no production world is involved.

For heavy Windows QA, run the CLI manually on a disposable copy. If automation is
needed, use a **separate private QA repository and ephemeral Windows VM** with no
personal data. Restrict runner access to that private repository/runner group,
disable fork/PR execution, require environment approval for an exact reviewed pack
commit, and destroy the VM after the run. Keep that runner unavailable to the
public modpack repository. No personal-machine runner is configured by this PR.

## Troubleshooting performance, hangs and saves

Run from the reviewed tooling checkout with new external output directories.
Use your exact installed mod files read-only, Java 21 and the verified installer
cache; this local path requires no provider API key. For example:

```powershell
$woTrial = Get-Date -Format 'yyyyMMdd-HHmmss'
py -3 -m tools.modpack qa --scenario save-flush --destination "$env:TEMP/wo-run-$woTrial" --reports "$env:TEMP/wo-report-$woTrial" --local-mods 'C:/Users/mason/curseforge/minecraft/Instances/Wilderness Odyssey (1)/mods' --cache C:/Users/mason/.codex/modpack-cache --offline --accept-eula --java C:/Users/mason/.jdks/corretto-21.0.12.1-1/bin/java.exe --memory-mb 6144 --startup-seconds 600 --soak-seconds 120 --profiling basic
py -3 -m tools.modpack analyze --input "$env:TEMP/wo-report-$woTrial" --reports "$env:TEMP/wo-analysis-$woTrial"
py -3 -m tools.modpack export --input "$env:TEMP/wo-report-$woTrial" --destination "$env:TEMP/wo-share-$woTrial"
```

`--accept-eula` records your acceptance of the Minecraft EULA for the disposable
server. The default `startup-soak` scenario verifies a fresh console `list` reply
after the `Done` log marker before beginning the soak. `save-flush` then measures
one acknowledged `save-all flush` operation, with a separate workload phase and a
120-second limit. This is save acknowledgement timing; persistence after reopening
the world has not been tested. Shutdown retains its own result.

Basic profiling samples owned-process CPU, working set/RSS, I/O and free disk
every five seconds and heap every thirty seconds. CPU 100% means one logical CPU;
the JVM's four active processors are guidance, not an OS quota. I/O counters are
transferred bytes, not storage latency. RSS includes memory outside the heap.
Unsupported fields are null with availability reasons. Java thread counts have a
separate series; native process thread counts stay in resource samples, including
when reanalyzing earlier schema-2 reports. Each attach command has a
five-second limit inside the active phase deadline. Startup checkpoints and
unanswered console requests can collect up to six thread snapshots per trial.
Quiet logs alone are not hang evidence. Profiling adds overhead; use matching
settings for comparisons. `off` keeps readiness checks but disables collectors;
`jfr` and `native` explicitly enable additional JVM diagnostics.

Offline `analyze` accepts an explicit log file or a report directory and needs
neither inventory nor Java/network access. Bounded findings cover supported G1 GC
pauses, suspected post-full-GC growth, repeated chunk-flush waits, JVM crash
markers, and grouped registry/config/data errors. Missing, partial and unsupported
evidence remains visible. Young-GC heap values, an OOM, repeated frames or a mod
name in a stack establish neither a retained-object leak nor a culprit. MSPT,
internal chunk queues and loaded mod count stay unmeasured without verified
telemetry. Repeatable gameplay, client/GPU checks and retained-object investigation
remain later scopes.

Private local reports retain originals. Share only the new export directory;
it redacts credential lines, URL credentials/query values and personal paths,
and records partial files and omissions in `manifest.json`. JSON evidence is
exported with a `.txt` suffix because sanitization may remove entire lines.
Hosted QA uses this same export path. A source reconstruction failure still means
Minecraft never launched; diagnostic expansion does not supply the missing private
pack-input path or a permanent download source for the exact API bytes.

Schema-2 comparisons require matching readiness protocol, scenario, Java build,
OS/CPU context, heap and monitor/profiling settings. Exact inventory/config/mod
fingerprints are shown separately, allowing an updated pack to be compared while
retaining the changed bytes. Legacy `Done` timings remain readable through
analysis but cannot become verified-readiness baselines. Promotion also requires
a known clean source commit and all required phases, including save workload.

## Baselines, release ZIPs and the large-file push error

Baseline creation is a deliberate local command after a successful actual run
from a committed, reviewed source. It stores only whitelisted summary metrics:

```powershell
py -3 -m tools.modpack baseline --candidate "$env:TEMP\wo-server-report\report.json" --name startup-soak-reviewed
py -3 -m tools.modpack compare --current "$env:TEMP\wo-next-report\report.json" --baseline qa/baselines/startup-soak-reviewed.json --reports "$env:TEMP\wo-comparison"
py -3 -m tools.modpack package --output "$env:TEMP\Wilderness-Odyssey-0.1.0.zip"
```

Review and commit a baseline deliberately; CI never promotes one. Different
workloads, seeds, heap settings, profiling modes or runtimes are inconclusive.
Single-run threshold changes are warning indicators, not proven regressions or
leaks. Full retained-object attribution requires additional retention evidence.

The default release contains exact CurseForge references, reviewed overrides
and SHA-256 checksums, with no bundled mod JARs. It correctly blocks the manual
API because the exact installed 5.0.0 artifact has no verified public file ID.
For a local export of **your own API**, explicitly authorize its inclusion:

```powershell
py -3 -m tools.modpack package --output "$env:TEMP\Wilderness-Odyssey-local.zip" --local-mods 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)\mods' --include-owned-api
```

This bundles only the exact pinned `wildernessodysseyapi` bytes in
`overrides/mods`; every other mod remains a provider reference. Other manual mods
still block export. The API JAR/ZIP stays outside Git and nothing is published.
The actual client export contains 277 CurseForge references plus the owned API;
two local builds were byte-identical. Launcher ZIP import and Minecraft runtime
acceptance remain untested. Hosted packaging still needs an approved exact API
download source, rather than substituting a different published API version.

The rejected `modpack/Wilderness Odyssey-0.1.0.zip` is over GitHub's regular file
limit. Deleting it in a later commit does not remove earlier blobs. This feature
branch starts at the remote `1.21-neoforge` before the rejected local ZIP commits;
push this branch and review its PR. Do not merge/cherry-pick the large-ZIP commits
into it. `.gitignore` and the tracked-file guard prevent future archive additions.
Keep full exports outside Git; no Git LFS or history rewrite is needed for this
feature branch. The original local branch/commits are preserved for recovery.
