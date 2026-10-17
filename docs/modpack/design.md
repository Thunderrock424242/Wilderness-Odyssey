# Git-managed modpack and disposable QA foundation

The current installed CurseForge profile is the migration source. The historical
README, published release, and `mods/list` are references, never sources of exact
installed file identities. Import is read-only against the profile. Existing pack
assets and the website deployment workflow stay owned by their current systems.

## Ownership and data flow

`tools/modpack` is a Python 3.11+ standard-library CLI (Windows and Linux). A scan
records actual JAR SHA-256, embedded mod IDs/versions/dependencies and verified
CurseForge file hashes. `modpack/lock.json` is the import-owned inventory; generated
packwiz `pack.toml`, `index.toml`, and `mods/*.pw.toml` are the interoperable install
view. Generation is deterministic; validation rejects drift between the views.
`modpack/review.json` holds deliberate hash-bound side/source/essential decisions.
Mod versions come from the reviewed profile, with no automatic latest-mod selection.
The explicit `loader --latest` command can check stable **21.1.x** builds from
official Maven metadata; `--apply` records an exact NeoForge/FML/installer pin.
Later imports preserve that deliberate target while recording the profile's actual
loader separately. CI never floats versions. No filename-only match is accepted.
Unresolved identities and sides remain explicit and block unattended readiness.
Required builtin ranges use the verified FML matrix for known versions, shared
by validation and isolation rather than bypassed in one code path.

Only tracked allowlisted custom asset roots are indexed. Import does not replace
existing custom files. It reports config differences and can copy explicitly
selected missing files, never overwrite or export saves, accounts, or logs.
JARs, local archives, credentials, caches, and QA worlds never enter Git.

The installer verifies every indexed byte and every mod hash, respects restricted
provider downloads, accepts a private local JAR directory, and writes only a new
empty destination outside the repository. Each QA trial gets its own installation
and world. Cache keys are content hashes. Release ZIP generation is deterministic
and references CurseForge IDs; unsupported redistribution blocks export. A local
`--include-owned-api --local-mods ...` export can include only the exact pinned
owner-supplied Wilderness Odyssey API; its JAR stays outside Git, and hosted
export still requires a verified exact distribution source.

## Diagnostics and isolation interfaces

`diagnostics.classify(logs: str, exit_code: int | None, timed_out: bool = False,
started: bool = False, harness_error: str | None = None) -> dict` returns
`category`, `message`, `signature`, `confidence`, `evidence`, `suspects`,
`next_step`, `crashed`, and `isolation_eligible`. Evidence is contextual and a name
in a trace is not attribution. `diagnostics.analyze_memory(samples: list[dict])`
uses sampled heap/post-GC/CPU/thread metrics and labels growth as suspicion only.
`diagnostics.render_report(result: dict) -> str` renders a bounded Markdown report.

`isolation.isolate(mods: list[dict], run_trial: Callable[[set[str]], dict],
max_tests=20, repeats=2, budget_seconds=1800, cancelled=lambda: False) -> dict`
uses records `{id, requires: list[str], essential: bool}`. It confirms repeated
full-pack failures before narrowing, includes transitive dependencies, compares
the original signature, rejects dependency/harness/timeout mismatches, caches
stable results, checks cancellation/budgets, and tests interacting complements.
It reports tested candidate groups, remaining suspects, and limits on confidence.
Only the implemented startup/soak scenario is enabled for live isolation.

The runner uses Java 21, a verified pinned NeoForge installer, loopback binding,
explicit EULA acceptance, bounded startup/soak/shutdown, JFR/GC logs/jcmd where
available, and process cleanup. It records failures by stage and never treats
installer success as Minecraft readiness. Expensive heap dumps are opt-in and
private. No complete gameplay/MSPT/client/GPU coverage is claimed.

## Execution boundaries

Public PR CI is read-only, hosted, secretless, and static. Actual Minecraft QA is
manual on trusted branch commits with an opt-in protected environment. Scheduling
is disabled until deliberately enabled after a successful real run. There is no
public-repository self-hosted runner job. Heavy Windows QA runs locally or in a
separate private, disposable runner with no public PR execution or personal data.
Artifacts are bounded, expire quickly, and exclude worlds, credentials and dumps.

## Acceptance and deliberate gaps

Tests use realistic temporary CurseForge metadata/JAR fixtures, provider hash
mismatches, path escapes, manual download failures, dependency closures, multiple
crash categories, interaction/nondeterministic isolation, and deterministic ZIPs.
Real profile access and any actual server launch are recorded separately.
Workloads requiring a player/instrumentation mod, retained-object analysis,
automatic baseline promotion, client rendering and production deployment remain
explicit follow-up work until implemented and tested. Publishing is manual.

The proposed expansion for performance, memory and general issue diagnosis is
specified in [the troubleshooting design](../superpowers/specs/2026-10-17-modpack-troubleshooting-design.md).
That document records the next delivery and its acceptance criteria; its status
is separate from the implemented foundation described above.
