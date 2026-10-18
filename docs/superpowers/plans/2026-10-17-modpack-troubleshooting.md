# Modpack Troubleshooting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add actionable performance, memory, hang, crash and configuration diagnostics to existing disposable server QA and provide offline analysis of saved evidence.

**Architecture:** Extend the current Python runner with a pure progress monitor, an owned-process resource sampler, and bounded evidence readers/parsers. The runner retains process creation, console commands, deadlines and cleanup. Live and offline analysis share structured findings and rendering; the existing workflow exports only bounded sanitized text evidence.

**Tech Stack:** Python 3.11+ standard library, Java 21 `jcmd`/optional JFR, Windows process APIs, Linux procfs, unittest, existing pinned GitHub Actions.

**Spec:** [Approved troubleshooting design](../specs/2026-10-17-modpack-troubleshooting-design.md).

**Status:** Approved for inline execution in this chat. Tasks 1-8 implemented;
whole-branch review and fresh disposable runtime acceptance are in progress.

## Global Constraints

* Minecraft 1.21.1, exact reviewed NeoForge/JAR pins, Java 21; no dependency floats.
* Python 3.11+ on Windows/Linux; standard-library implementation, no external API keys.
* Live profiles and saves stay read-only; scenarios use owned external disposable installations.
* Runner alone owns process creation, stdin, deadlines and cleanup; preserve Windows Job/POSIX group behavior.
* No watchdog disabling, forced GC, automatic mod removal, publication or baseline promotion.
* `Done` is a log milestone; only a response to the owned console probe completes startup.
* Heartbeats every 10 seconds, one pending operation; incident snapshots at 10/20/40 seconds without a response.
* Process samples every 5 seconds, at most 1,500 rows; basic heap samples every 30 seconds.
* At most six thread dumps of 2 MiB each; one attach subprocess at a time, at most five seconds and within the trial deadline.
* Timeline at most 20,000 events/2 MiB; controlled save at most 120 seconds within the trial deadline.
* JFR remains explicit, configured at 64 MiB; oversized local recordings are omitted with a reason.
* Hosted text export at most 32 MiB; no binary JFR, dumps, worlds, accounts or raw directory upload.
* Report missing/unsupported measurements explicitly; evidence is not automatic mod attribution or a confirmed leak.
* Existing website, import, release and inventory ownership stays intact. Hosted pack-input/source gaps are separate.

## Review Focus

1. `Done` followed by a startup-listener hang, plus old/quoted response lines: no false readiness (Tasks 1, 4).
2. Exited/reused PID, denied OS counters, or hanging attach: no unrelated-process sampling, extended deadline or false zero (Tasks 2, 4).
3. Rotated/truncated GC files and young collections: no double-counted pauses or claimed retained live set (Task 3).
4. Existing logs containing credentials, links, hostile text or changing files: no execution, output escape or unsafe export (Tasks 3, 6).
5. Old report readiness semantics, different CPU/JVM settings, and same-version/different-byte JARs: honest comparisons (Task 7).

## File Structure

| File | Responsibility |
| --- | --- |
| New `tools/modpack/monitor.py` | Pure readiness/operation/incident state and bounded timeline writer |
| New `tools/modpack/resources.py` | Owned-JVM identity, CPU/RSS/I/O/thread/disk sampling and availability reasons |
| New `tools/modpack/evidence.py` | Bounded input readers, GC/thread/data-error interpretation, offline analysis |
| New `tools/modpack/export.py` | Sanitized allowlisted text export, artifact integrity/omission manifest |
| Existing `runner.py` | Integrate monitor/sampler; retain all process ownership; add controlled save |
| Existing `diagnostics.py` | Finding schema, classification reuse, report rendering |
| Existing `regression.py` | Report/context compatibility and exact content-change summary |
| Existing `__main__.py` | Scenario selection and offline `analyze` entry point |
| Existing QA workflow/docs | Expose supported options and export only the intended directory |

Use existing `common.py` path/link/atomic-output helpers throughout. Test new units in matching `tests/modpack/test_*.py` files and extend existing lifecycle/regression/CLI fixtures.

---

### Task 1: Pure progress monitor and bounded timeline

**Files:** Create `tools/modpack/monitor.py`, `tests/modpack/test_monitor.py`.

**Interfaces:**
* `TrialMonitor(started_at: float, startup_deadline: float, profiling: str)`.
* `observe_line(line: str, sequence: int, now: float) -> None` consumes complete sequenced output lines.
* `command_sent(kind: str, sequence: int, now: float) -> None` establishes the request boundary.
* `tick(now: float, alive: bool) -> list[dict]` emits bounded actions; `begin_soak(now: float, deadline: float)` and `begin_save(now: float, deadline: float)` select the operation.
* `snapshot() -> dict` returns readiness, pending operation, timings, incidents and availability, without creating processes.
* `EventTimeline(path: Path, max_events=20_000, max_bytes=2*1024**2)` provides `append(event: dict)` and `close()`, recording omitted-event counts.

`snapshot()['readiness']` contains `protocol=2`, `verified`, `log_observed_seconds` and `verified_seconds`. Actions use `kind=send_command|sample_resources|sample_heap|capture_threads|dump_jfr|phase_complete`, with `operation` and fixed `text` for console actions. Before `Done`, take up to three startup checkpoint dumps at 60/120/240 seconds, leaving three dump slots for an unresponsive command. Checkpoints are observations, not a declared hang or a log-silence detector.

- [x] **Step 1:** Write `test_done_without_reply_never_completes_startup`, `test_old_or_quoted_list_reply_is_ignored`, `test_quiet_responsive_server_has_no_incident`, and `test_capture_offsets_and_caps`. Assert only a response after a sent `list` request completes startup; capture offsets are exactly 10/20/40 seconds, at most six per trial, and one operation is pending. Use an injected clock and explicit line sequences.

```python
m = TrialMonitor(started_at=0, startup_deadline=600, profiling='basic')
m.observe_line(READY, sequence=1, now=1)
self.assertFalse(m.snapshot()['readiness']['verified'])
self.assertIsNone(m.snapshot()['readiness']['verified_seconds'])
```

`READY` uses the existing exact Minecraft log fixture. Also assert a pre-`Done` stall receives checkpoint evidence without a false verified/soak result.
- [x] **Step 2:** Run `py -3.13 -m unittest discover -s tests/modpack -p test_monitor.py -v`; expect missing-module/interface failures before implementation.
- [x] **Step 3:** Implement the interfaces above with monotonic timestamps and complete-line matching. Confirm vanilla `list`/save response formats against pinned Minecraft bytes; unsupported formats stay inconclusive. Add timeline boundary tests for 20,000 events, 2 MiB, a long hostile line and an output link.
- [x] **Step 4:** Repeat the same command; expect all monitor/timeline tests to pass without sleeping or starting Java.
- [x] **Step 5:** Commit only the new module/tests: `feat(modpack): add bounded progress and incident monitor`.

### Task 2: Cross-platform owned-process resource sampler

**Files:** Create `tools/modpack/resources.py`, `tests/modpack/test_resources.py`.

**Interfaces:** `ResourceSampler(owned_process: subprocess.Popen, disk_path: Path)`, `sample(elapsed_seconds: float) -> dict`, and `context() -> dict`. Rows contain identity, elapsed time, CPU seconds/percent, RSS bytes, read/write I/O bytes, thread count, free disk bytes and field-level availability reasons. CPU 100% means one logical CPU. Context separately records OS CPU availability/limits and JVM processor guidance when supplied by the runner.

- [x] **Step 1:** Write counter-driven tests. Assert a 2-second CPU delta over a 1-second interval is 200%; a counter reset or zero time interval is unavailable, not zero. Assert PID reuse/exited child prevents further reads; denied I/O leaves successful RSS/CPU measurements usable. Include Linux proc names containing spaces/parentheses and Windows 64-bit counter values.

```python
self.assertEqual(200.0, second_row['cpu_percent'])
self.assertIsNone(reset_row['cpu_percent'])
self.assertEqual('process_identity_changed', reused_row['unavailable']['process'])
```

Generate these rows from fake owned-process readers with known counters and a temporary disk path; `unavailable` maps each missing field to its reason.
- [x] **Step 2:** Run `py -3.13 -m unittest discover -s tests/modpack -p test_resources.py -v`; observe the missing sampler failure.
- [x] **Step 3:** Implement OS-specific reads through small injectable readers using Windows process APIs or bounded Linux procfs. Tie identity to the owned process; never enumerate/attach to unrelated processes. Use `shutil.disk_usage` for the destination filesystem. Unsupported limits/counters have explicit reasons.
- [x] **Step 4:** Repeat the focused command. Add a harmless real child-process smoke check where supported; assert valid nonnegative counters or a stated unavailable reason, without fragile speed assertions.
- [x] **Step 5:** Commit `feat(modpack): sample owned JVM resources on Windows and Linux`.

### Task 3: Evidence readers and pure issue interpretation

**Files:** Create `tools/modpack/evidence.py`, `tests/modpack/test_evidence.py`; extend `diagnostics.py` and `test_diagnostics.py`.

**Interfaces:**
* `read_evidence(input_path: Path) -> dict`: bounded explicit file/allowlisted-directory snapshot, inventory optional.
* `parse_gc(text: str, source: str) -> dict`: complete event IDs/cycles, heap observations, pauses and limitations.
* `analyze_thread_dumps(dumps: list[dict]) -> list[dict]` and `group_log_findings(text: str) -> list[dict]`.
* `analyze_evidence(evidence: dict) -> dict`: reuse existing classification/signatures and memory interpretation; retain trustworthy existing lifecycle outcomes.
* Findings use `code`, `severity`, `category`, `phase`, `window`, `confidence`, `evidence`, `limitations`, `next_step`.

Evidence dictionaries use optional `report`, `logs`, `gc_logs` (`source`/`text` records), `thread_dumps` and `limitations`; missing arrays are empty. Analysis outputs `findings`, existing classification fields, measured memory summaries and input coverage.

- [x] **Step 1:** Write `test_gc_rotation_deduplicates_complete_events`, `test_young_gc_is_not_retained_live_set`, `test_truncated_gc_remains_partial`, `test_repeated_flush_wait_is_not_mod_blame`, and `test_data_errors_group_without_fatal_crash`. Include pressure, healthy sawtooth, negative/reset counters and missing duration; assert no fixture creates a confirmed leak verdict.

```python
result = analyze_evidence({'logs': 'java.lang.OutOfMemoryError: Java heap space'})
self.assertEqual('out_of_memory', result['category'])
self.assertNotIn('confirmed_memory_leak', [f['code'] for f in result['findings']])
```
- [x] **Step 2:** Run `py -3.13 -m unittest discover -s tests/modpack -p test_evidence.py -v`; observe missing-interface failures.
- [x] **Step 3:** Implement bounded readers/parsers. Accept at most the existing per-log limits (server/latest 8 MiB, crash 1 MiB, native 2 MiB, GC 8 MiB, thread 2 MiB) and a 64 MiB total input budget. Bound discovery to four crash/native/GC files and six thread dumps. Mark source changes, partial UTF-8/events, skipped binary files and unknown formats. Do not force GC or infer exit codes/readiness from absent evidence.
- [x] **Step 4:** Test hostile Markdown/HTML, token-bearing URLs, input links/junctions, oversized metadata/lines, concurrently changed files and unknown future report versions. Repeat the focused command and `py -3.13 -m unittest discover -s tests/modpack -p test_diagnostics.py -v`; expect pass.
- [x] **Step 5:** Commit `feat(modpack): interpret GC thread and configuration evidence`.

### Task 4: Integrate verified readiness and incident sampling

**Files:** Modify `runner.py`, `tests/modpack/test_runner.py`; consume Tasks 1–3 interfaces.

**Interfaces:** `_Process` exposes sequenced complete-line observations and bounded fixed-command writes. `_run_trial` integrates `TrialMonitor`/`ResourceSampler`; process creation and all attach/cleanup stay in `runner.py`. Schema-2 reports add `readiness`, `findings`, `timeline`, `resources`, artifact availability and separate log-marker/verified-startup timings.

- [x] **Step 1:** Add real harmless subprocess fixtures: emits `Done` then blocks; replies to `list`; replies after an obsolete line; exits during attach; ignores stop; and stalls during startup listener work. Update successful fixtures to respond to `list` until `stop`, rather than exiting on the first stdin line. Assert `Done` alone leaves startup unsuccessful and soak `not_run`.

```python
self.server_mode = 'done_blocked'
result = self.run_qa()
self.assertNotEqual('succeeded', result['phases']['startup']['status'])
self.assertEqual('not_run', result['phases']['soak']['status'])
```
- [x] **Step 2:** Run `py -3.13 -m unittest discover -s tests/modpack -p test_runner.py -v`; confirm the current runner fails the new readiness assertion before changing its behavior.
- [x] **Step 3:** Integrate nonblocking monitor ticks while the existing drain thread continues reading. Schedule resource/heap/incident work using the approved budgets, including startup. One attach at a time, each bounded by five seconds and the remaining phase/trial budget. Record missed/unsupported captures. With profiling off, keep only readiness/lifecycle monitoring.
- [x] **Step 4:** Re-run runner and monitor tests. Assert cancellation and helper timeouts preserve shutdown and kill all owned descendants; quiet responsive fixtures do not trigger dumps; optional collection errors do not become mod crashes. Preserve private HOME/temp environment tests and source-profile byte checks.
- [x] **Step 5:** Commit `fix(modpack): verify console readiness and capture startup hangs`.

### Task 5: Measured save-flush scenario

**Files:** Modify `runner.py`, `__main__.py`, `test_runner.py`, `tests/modpack/test_sync_cli.py`; consume Task 1 operation state.

**Interfaces:** CLI `qa --scenario startup-soak|save-flush`, default `startup-soak`. Add a `workload` phase (`not_run` by default) and `save_flush_seconds` only when measured. `save-flush` follows successful startup/soak with one fixed `save-all flush` command, then normal shutdown.

- [x] **Step 1:** Add subprocess cases for acknowledged save, a save that blocks, early exit, unsupported acknowledgement, and startup failure before workload. Assert the workload's elapsed time/phase is separate from shutdown, and an unacknowledged save has no fabricated duration of success.

```python
self.args.scenario = 'save-flush'
self.server_mode = 'save_blocked'
result = self.run_qa()
self.assertNotEqual('succeeded', result['phases']['workload']['status'])
self.assertIsNone(result['metrics'].get('save_flush_seconds'))
```
- [x] **Step 2:** Run runner/CLI focused suites; observe rejection/missing-phase failures before implementation.
- [x] **Step 3:** Add scenario validation and the controlled operation, with a 120-second maximum inside the total trial deadline. Suspend additional heartbeat commands while save is pending, but capture its unresponsiveness at 10/20/40 seconds. Never operate on an existing installation/world; inherit current install/disjoint-path checks. Mark save-workload failures ineligible for startup/soak-only subset isolation.
- [x] **Step 4:** Repeat the focused suites and `test_isolation.py`. Assert default behavior remains startup/soak/stop and graph isolation cannot silently change scenario semantics.
- [x] **Step 5:** Commit `feat(modpack): measure disposable save and flush acknowledgement`.

### Task 6: Offline analysis, readable findings and sanitized export

**Files:** Create `tools/modpack/export.py`, `tests/modpack/test_export.py`; modify `__main__.py`, `diagnostics.py`, `test_diagnostics.py`, `test_sync_cli.py`, `test_runner.py`.

**Interfaces:** `export_reports(reports: Path, destination: Path, max_bytes=32*1024**2) -> dict` creates a new disjoint allowlisted text export and manifest. CLI `analyze --input PATH --reports NEW_DIRECTORY` consumes Task 3 readers and writes schema-2 summaries without requiring a lock or invoking Java. Both live/offline rendering use the same finding contract.

The export result uses `files` (relative names), `bytes`, `omitted` and `manifest`; artifact metadata identifies truncation/sanitization. Avoid including absolute original paths in hosted metadata.
Count actual written bytes, including a bounded manifest, inside the export cap;
the manifest does not claim its own hash. Reserve space for it before accepting
additional evidence, and record when limited space also requires a shorter list
of omitted entries.

- [x] **Step 1:** Write tests asserting offline analysis never spawns/fetches, can analyze without inventory, refuses overlapping/link outputs, and summarizes malformed/partial evidence. Assert report headline retains the actual lifecycle failure even when findings/export have errors.

```python
exported = export_reports(self.reports, self.new_export, max_bytes=1024)
self.assertLessEqual(exported['bytes'], 1024)
self.assertFalse(any(name.endswith(('.jfr', '.hprof')) for name in exported['files']))
self.assertNotIn('private-provider-key', self.exported_text())
```

The fixture directory contains one report, a token-bearing log and binary exclusions; `exported_text()` reads only exported text files in that temporary directory.
- [x] **Step 2:** Run `test_export.py`, `test_sync_cli.py` and `test_diagnostics.py` via unittest discovery; observe missing-command/export failures.
- [x] **Step 3:** Implement schema-2 rendering and artifact manifest (bytes/hash/truncation/omission), with bounded escaped findings before detailed evidence. Create a separate 32 MiB export, prioritizing summaries, incident index, thread excerpts and timeline/log evidence. Redact credential assignments, authorization headers, credential/token URL fields and personal paths. Reject links and binary JFR/heap/world/account inputs from export; retain private local originals.
- [x] **Step 4:** Repeat focused tests. Include credentials split across read boundaries, Windows/POSIX personal paths, hostile filenames, a saturated export budget and read/write failures. Assert no silent claim of complete evidence after omission.
- [x] **Step 5:** Commit `feat(modpack): analyze saved evidence and export bounded diagnostics`.

### Task 7: Context fingerprints and honest comparisons

**Files:** Modify `runner.py`, `regression.py`, `tests/modpack/test_regression.py`, `test_runner.py`; reuse `common.digest` and canonical indexed asset bytes.

**Interfaces:** Report context adds `report_schema`, `readiness_protocol`, full Java build, OS/CPU limits, monitor/profiling/scenario settings and seed. `content` records inventory/asset fingerprints plus relative mod/config hashes. `compare(report, baseline) -> dict` separates measured indicators from exact content changes. `baseline_from(report, commit)` remains the only promotion function.

- [x] **Step 1:** Add tests for old `Done` timing versus verified-console timing, changed JVM/CPU settings, absent sensors, and same version/different JAR hash. Assert incompatible semantics return inconclusive; content updates are displayed rather than silently making all update comparisons impossible.

```python
baseline = baseline_from(self.good_report(), 'a' * 40)
baseline['context'].pop('readiness_protocol')
self.assertEqual('inconclusive', compare(self.good_report(), baseline)['status'])
```

Upgrade the existing successful-report fixture as `good_report()` with all schema-2 context fields and completed required phases; keep an explicit legacy fixture for compatibility tests.
- [x] **Step 2:** Run `py -3.13 -m unittest discover -s tests/modpack -p test_regression.py -v`; observe new context/content assertions fail.
- [x] **Step 3:** Implement explicit report/readiness versions, exact fingerprints and compatible metric comparisons. Old reports remain readable for analysis but cannot become new verified-readiness baselines. Require clean known commit, complete successful required phases and supported context for new promotion. Metrics absent on either side stay unavailable.
- [x] **Step 4:** Repeat regression/runner tests. Assert failed, dirty, source-unknown and incomplete save-flush runs cannot promote baselines; a single timing difference remains an indicator, not confirmed causation.
- [x] **Step 5:** Commit `feat(modpack): fingerprint diagnostic context and content changes`.

### Task 8: Existing workflow and operations guide

**Files:** Modify `.github/workflows/modpack-qa.yml`, `docs/modpack/README.md`, `docs/modpack/verification.md`, `tests/modpack/test_repository.py`.

**Interfaces:** Add the supported scenario choice to the existing trusted QA job; consume Task 6 export directory for step summary/artifact upload. No additional workflow, provider secret or public/self-hosted runtime path.

- [x] **Step 1:** Add repository/workflow assertions that runtime inputs are passed through environment variables, scenario is validated, upload points only to sanitized export, binary/raw installation paths are excluded, and trusted-branch/EULA/environment gates remain.

```python
self.assertIn('pack-qa-export', workflow)
self.assertNotIn('path: ${{ runner.temp }}/pack-qa-reports/', workflow)
self.assertIn("github.ref == 'refs/heads/1.21-neoforge'", workflow)
```
- [x] **Step 2:** Run `py -3.13 -m unittest discover -s tests/modpack -p test_repository.py -v`; observe export/scenario expectations fail on the old workflow.
- [x] **Step 3:** Wire supported options and sanitized summary/export, including a useful fallback when setup fails before reporting. Keep seven-day retention, action pins and inert schedule gates. Document local QA/analyze/save commands, metric meanings, optional profiling overhead, unavailable-data behavior and hosted source/input limits.
- [x] **Step 4:** Repeat repository tests and run `C:/Users/mason/.codex/modpack-tools/actionlint-1.7.12/actionlint.exe '-shellcheck=' .github/workflows/modpack-validation.yml .github/workflows/modpack-qa.yml .github/workflows/modpack-release.yml`; expect no findings.
- [x] **Step 5:** Commit `feat(modpack): expose expanded diagnostics in trusted QA workflow`.

### Task 9: Whole-branch verification and actual acceptance

**Files:** Update `docs/modpack/verification.md`; fixes remain in the owning modules/tests from Tasks 1–8.

- [ ] **Step 1:** Run `py -3.13 -m unittest discover -s tests/modpack -v` and the bundled Python 3.12 executable with the same arguments. Then run `validate` for client/server and `audit-repository`, each writing a new external report directory. Run actionlint and `git diff --check`. Expect successful tool/static checks; explicit runtime/schema warnings are not gameplay proof.

Use this PowerShell setup and these exact additional commands; retain the generated tag for all reports from this acceptance batch:

```powershell
$woDiagnosticTag = Get-Date -Format 'yyyyMMdd-HHmmss'
$woDiagnosticReports = "C:/Users/mason/.codex/modpack-reports/troubleshooting-$woDiagnosticTag"
$woDiagnosticRun = "C:/Users/mason/.codex/modpack-runs/troubleshooting-$woDiagnosticTag"
& C:/Users/mason/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe -m unittest discover -s tests/modpack -v
py -3.13 -m tools.modpack validate --side client --reports "${woDiagnosticReports}-client"
py -3.13 -m tools.modpack validate --side server --reports "${woDiagnosticReports}-server"
py -3.13 -m tools.modpack audit-repository --reports "${woDiagnosticReports}-audit"
git diff --check
```
- [ ] **Step 2:** Obtain a fresh whole-branch code review, focusing on the five Review Focus classes and ownership/deadline/export guarantees. Fix substantive findings with a failing regression first; repeat only affected checks, then the required final suite.
- [ ] **Step 3:** From a committed reviewed checkout, run one fresh external save-flush trial against the original pinned local files using existing EULA consent, Java `C:/Users/mason/.jdks/corretto-21.0.12.1-1/bin/java.exe`, 6144 MiB heap, four JVM active processors, startup 600 seconds, soak 120 seconds and basic profiling. Use new destination/report directories and the existing verified installer cache. Never require a provider key.

```powershell
py -3.13 -m tools.modpack qa --scenario save-flush --destination "${woDiagnosticRun}-original" --reports "${woDiagnosticReports}-original" --local-mods 'C:/Users/mason/curseforge/minecraft/Instances/Wilderness Odyssey (1)/mods' --cache C:/Users/mason/.codex/modpack-cache --offline --accept-eula --java C:/Users/mason/.jdks/corretto-21.0.12.1-1/bin/java.exe --memory-mb 6144 --startup-seconds 600 --soak-seconds 120 --profiling basic
```
- [ ] **Step 4:** Run the external published-API candidate in a separate new startup-soak trial, with the same execution settings and explicit candidate provenance. Check that an early callback stall stays in startup and captures bounded evidence. A nonreproducing run is reported as such; do not fabricate the previous failure, blame a mod, change pins or disable the watchdog.

```powershell
py -3.13 -m tools.modpack --root C:/Users/mason/.codex/modpack-candidates/github-package-2538361-api5 qa --scenario startup-soak --destination "${woDiagnosticRun}-candidate" --reports "${woDiagnosticReports}-candidate" --local-mods 'C:/Users/mason/curseforge/minecraft/Instances/Wilderness Odyssey (1)/mods' --cache C:/Users/mason/.codex/modpack-cache --offline --accept-eula --java C:/Users/mason/.jdks/corretto-21.0.12.1-1/bin/java.exe --memory-mb 6144 --startup-seconds 600 --soak-seconds 120 --profiling basic
```
- [ ] **Step 5:** Record actual commands, source/byte fingerprints, every phase, sample/capture availability, limits, cleanup and remaining warnings. Verify source files stayed unchanged. Do not promote a baseline or publish the local candidate. Hosted CI must separately verify Python 3.11 Windows/Linux checks; local acceptance does not establish hosted Minecraft or client behavior.
- [ ] **Step 6:** Update PR #37 around the implemented scope and evidence, push the focused commits, and report remaining source/workload/client/retention gaps explicitly. No merge or publication is part of this plan.

## Self-review and handoff

Coverage: Tasks 1/4 implement readiness and incident collection; Task 2 host resources;
Task 3 memory/crash/config interpretation; Task 5 save timing; Task 6 offline reports
and export; Task 7 context/comparison; Task 8 workflow/docs; Task 9 actual proof.
Later workload repetition, retained-object analysis and client testing remain the
separate scopes approved in the design roadmap, not hidden first-delivery claims.

Review every interface name and report field across tasks before execution. The
plan is ready for the user to review and select an execution method. Recommend
native execution in this chat because the tasks share the runner/monitor/report
interfaces closely; use one fresh whole-branch review before acceptance. If the
user chooses per-task subagents instead, follow the subagent-driven workflow.
