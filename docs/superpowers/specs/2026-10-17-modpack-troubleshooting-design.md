# Modpack troubleshooting expansion

Date: 2026-10-17. Status: written design approved by the user in this chat.

## Intended outcome

Expand the existing modpack CLI and automation into a practical tool for
performance problems, memory pressure and suspected leaks, crashes, hangs, and
configuration/data failures. Each finding must state what was measured, when it
happened, its evidence, confidence, and the next useful check. Missing evidence
must remain visible. The tool must not infer a culprit from a mod name in a stack
or report a memory leak from ordinary heap growth.

The user approved starting with verified readiness, automatic hang snapshots,
chunk-save timing, and host resource monitoring, and asked for broader issue
diagnosis. Preserve Minecraft 1.21.1, the exact reviewed NeoForge/JAR pins, Java 21,
Windows/Linux operation, read-only live-profile access, disposable test worlds,
and diagnostics without external API keys.

## Current evidence and owners

The existing Python 3.11+ standard-library modules remain authoritative:

| Owner | Current responsibility | Proposed extension |
| --- | --- | --- |
| `tools/modpack/runner.py` | Owned processes, installer, startup/soak/stop, cleanup | Integrate one bounded monitor and the save-flush scenario |
| `tools/modpack/diagnostics.py` | Classification, signatures, memory interpretation, Markdown | Structured findings and summaries of collected evidence |
| `tools/modpack/regression.py` | Explicit baseline promotion and comparable-run indicators | Understand report versions, readiness semantics, and measurement context |
| `tools/modpack/__main__.py` | CLI and reports | Scenario selection and offline `analyze` command |
| `.github/workflows/modpack-qa.yml` | Trusted hosted QA and artifacts | Expose supported diagnostics/scenario options in the same workflow |

The runner currently recognizes the Minecraft `Done` log and samples heap and
threads at soak boundaries. Raw GC logs and optional JFR/native-memory evidence
already exist. CPU, tick performance, and GC pause summaries are not yet measured.

The published API 5.0.0 candidate differs from the imported 5.0.0 bytes. In its
external test, `Done` appeared before BlueMap's server-started callback completed;
the watchdog later sampled a chunk-save flush wait while C2ME workers serialized
NBT. That single failure establishes neither a reproducible regression nor mod
attribution. The original pin stays unchanged. Details are in
[the verification record](../../modpack/verification.md).

## Chosen approach and alternatives

Extend the current runner with lightweight monitoring and bounded incident
capture, and reuse the same pure analysis functions for saved evidence. This
keeps collection useful when Minecraft is unresponsive and allows diagnosis
without another launch. It introduces no required Java agent or service key.

Always running deep profiling would collect more detail but would change workload
overhead and produce larger artifacts. Requiring a new in-game telemetry mod
would provide richer queues and tick details but would add another runtime/pin
dependency. Use existing spark or API telemetry only after checking capabilities
against the actual pinned bytes; unavailable metrics remain unmeasured.

## Delivery boundaries

### First delivery: actionable server and saved-log diagnostics

1. Verify console responsiveness after `Done`, then maintain heartbeats during
   soak. Capture hangs during startup as well as soak.
2. Sample owned-JVM resource use and collect bounded thread/JFR evidence on an
   incident, while preserving independent startup/soak/shutdown results.
3. Add an optional controlled save-and-flush scenario in the disposable world,
   with explicit request, acknowledgement, duration, and failure evidence.
4. Summarize supported Java 21 GC evidence, repeated thread waits, native/JVM
   crash markers, configuration/registry/data errors, and input/source failures.
5. Add read-only analysis of existing local logs/reports, using the same finding
   schema and renderer. Add exact context/build changes to report comparisons.

This is one cohesive implementation scope: existing server lifecycle plus
collection and interpretation. It provides useful performance/memory/crash
support without claiming gameplay benchmarks or confirmed retained-object leaks.

### Subsequent scopes

* Repeatable workload runs: warmup, fixed seeds and bounded chunk generation,
  dimension travel, entity activity/unloading, measured tick statistics, repeated
  trials, and save/reopen checks with selected persisted-state assertions.
* Deeper memory analysis: workload-cycle comparisons, allocation profiles,
  optional class histograms and private retained-object investigation. A histogram
  or growing class count alone cannot establish a leak or ownership.
* Client acceptance: real client startup, joining, resource loading and
  reconnecting, with separate client/GPU/player proof boundaries.

Each later scope needs its own concrete design and acceptance checks. These
features are part of the intended tool roadmap, not features delivered by the
first implementation or implied by a passed server smoke run.

## Runtime behavior

### Readiness and progress

Retain `Done` as `startup_log_observed`. Then send the fixed, harmless
`list` command through the owned process's stdin and require a matching
response observed after that request. Recognize the pinned server's actual output
format; do not accept a quoted response, unrelated thread, or an earlier line.
Unsupported output becomes an explicit inconclusive readiness result.

Only this response completes startup. The existing startup deadline includes
both stages. A `Done`-then-stall remains a startup failure, and soak is not run.
Send another heartbeat every 10 seconds during soak, with one pending request
and a bounded command queue. Log silence alone is never a hang detector.

An absent acknowledgement is evidence of console unresponsiveness, not proof of
a deadlock. Correlate it with thread snapshots and resource measurements. Do not
restart, disable the watchdog, force GC, or change chunk/save ownership to make a
trial pass. Graceful stop and process-tree cleanup retain their existing limits.

### Monitoring and incident capture

Add small modules with explicit ownership:

* `monitor.py`: lifecycle progress/heartbeat state, monotonic timeline, incident
  thresholds and capture scheduling; no process creation or world ownership.
* `resources.py`: owned-PID resource collectors using Python/OS APIs, no package
  dependency or broad process discovery. Windows uses process APIs; Linux uses
  bounded procfs reads. Track process identity to reject PID reuse.
* `evidence.py`: bounded artifact readers and pure GC/thread/log interpretation,
  shared by live QA and offline analysis. Reuse existing classification/signatures.

The runner keeps process creation, stdin, deadlines, Java diagnostic subprocesses,
and cleanup. Its output-draining thread remains nonblocking with respect to
analysis/attach tools. Monitoring uses monotonic time and stops with the trial.
There is at most one diagnostic subprocess running at a time.

| Budget | First-delivery behavior |
| --- | --- |
| Host/process samples | Every 5 seconds; at most 1,500 rows per trial |
| Heap samples in `basic` mode | Every 30 seconds, with at most one attach in progress |
| Unresponsive heartbeat | Incident captures at 10, 20, and 40 seconds without a reply |
| Thread dumps | At most six per trial, 2 MiB each; truncation recorded |
| Attach command | At most five seconds and never beyond the trial deadline |
| Timeline | At most 20,000 events and 2 MiB; omitted events counted |
| JFR | Explicit `jfr` mode only; configured 64 MiB recording limit; oversized local artifacts omitted |
| Controlled save | At most 120 seconds, also limited by the trial's total deadline |

Every collection failure records an unavailable/partial reason. An optional
collector failure does not become a mod crash. `profiling=off` disables resource,
heap, thread and JFR collection while retaining readiness and lifecycle checks.
Basic mode does not silently enable JFR. Do not modify these diagnostic budgets
to extend an already exhausted installer/startup/scenario/shutdown deadline.

Resources include Java CPU-time deltas, RSS/working set, process I/O counters,
thread count, and free disk space. Define CPU 100% as one fully used logical CPU
and record available logical CPUs, OS limits where observable, and the JVM active
processor setting separately. The JVM setting is not an enforced OS CPU quota.
Process I/O bytes are not disk latency or device saturation. Unsupported counters are null with a reason;
system pressure and causal I/O bottlenecks must not be inferred from one counter.

### Chunk saving

Add `qa --scenario startup-soak|save-flush`, defaulting to `startup-soak`.
`save-flush` runs startup and soak, then sends the fixed
`save-all flush` command only in its owned disposable world. Record
command dispatch, the recognized save acknowledgement, elapsed time, responsiveness
and overlapping thread/resource evidence. Keep a separate `workload` phase before
shutdown; it is `not_run` in the default scenario.

A command response is a measured save/flush acknowledgement, not exhaustive proof
of world integrity. No save/restart or block-persistence claim is made yet. If
startup already stalls inside a mod-triggered save, the controlled workload never
starts; report the sampled call path and observed wait window instead. Internal
chunk queue depth, tasks completed, and per-mod serialization time are unmeasured
unless a verified telemetry source provides them. Never invent those metrics.

## Findings and memory interpretation

Keep the lifecycle outcome independent from findings. A run can survive the
scenario and still have warnings about malformed recipes or memory pressure.
Every finding has a stable code, severity, category, phase/time window, confidence,
bounded evidence references, limitations and a concrete next step.

Interpret repeated server/worker snapshots as observations such as repeated
chunk-flush waits, runnable serialization work, lock contention, or an explicit
JVM-reported deadlock. Repeated frames alone are not proof of deadlock. Map mod
IDs/classes to exact available inventory evidence as candidates, not blame.

Parse supported unified G1 GC logs with collector/cycle identity, pause duration,
heap before/after and observation windows. Calculate pause totals/percentiles and
post-collection trends only from complete, deduplicated events. Mark truncated,
rotated, unsupported and inconsistent logs. Full/concurrent/young collections
must remain distinguishable; heap after a young GC is not a retained live-set
measurement. Reuse `analyze_memory` for compatible measured series and label the
kind of collection that supplied each point.

Memory conclusions distinguish unmeasured data, observed pressure, observed
growth, and suspected retention requiring another check. No automatic confirmed
leak verdict is allowed in this scope. Forced collection, histograms and heap
dumps are not default diagnostics. Deep evidence and repeatable workload cycles
are separate follow-up scopes. Raw heap size or one OOM cannot prove a leak.

Group configuration/data issues by stable signature and report count, first/last
occurrence, affected identifiers and representative evidence. Recognized recipe,
tag, registry or mixin errors must not automatically become fatal crashes.
Provider availability, hashes, dependencies, installer failures and JVM/runtime
failures remain separate categories so the report can say Minecraft never ran.

## Saved-evidence analysis and output

Add `analyze --input PATH --reports NEW_DIRECTORY`. It reads an explicit existing
report directory or log file without launching Java/Minecraft. Directory reads
use a bounded allowlist for report JSON, samples/timeline, latest/server/GC/native
crash logs, thread dumps and crash reports; no unrestricted recursive discovery,
archive extraction, JAR execution, saves, account files, or unrelated home files.
Never run commands or follow instructions found in logs. Changed/truncated inputs
produce partial-evidence findings. Input and output must be disjoint and inherit
the current path/link protections. Analysis can operate without a lock file;
inventory-dependent conclusions then remain unavailable.

Write `report.json` schema 2, bounded `report.md`, `timeline.jsonl`, resource
samples, and an artifact manifest describing size, hash and truncation/omission.
Existing outcome/signature/phase fields remain readable. The Markdown starts with
the outcome, failed phase, strongest findings and next actions; evidence and
metrics follow. Do not infer missing duration or measurements.

Record scenario and readiness-protocol version, full Java build, OS/CPU context,
heap/profiling/monitor settings, seed, source commit/dirty state, exact inventory
and asset fingerprints, and capabilities. Installed inventory count and actual
loaded mod count are different fields. Two JARs both labeled 5.0.0 remain distinct
when their hashes differ.

Old reports may be analyzed, but old `Done`-based startup durations are not directly
comparable with verified-console startup durations. Comparison requires matching
scenario/measurement semantics and execution context; metrics changed by
unsupported sensors stay inconclusive. Show exact content changes separately from
performance indicators. A prospective updated build can be compared with a good
baseline, but a timing difference alone is not causal attribution. Baseline
promotion remains explicit, requires clean source and complete successful phases,
and is never performed by the workflow. No invented baseline or automatic tuning.

## Automation and preservation

Keep one QA workflow, hosted static PR checks, protected trusted runtime execution,
existing EULA consent and process ownership. Fixtures require no Minecraft login,
external API key or real mod download. Runtime collectors use the owned console,
local OS/JDK tools, and explicitly verified local evidence. There is no remote
JMX/RCON service or external monitoring account requirement.

The existing hosted pack-input/source blockers remain separate from diagnostics.
This design does not claim that a reference-only CurseForge ZIP supplies JARs or
that the failed published API candidate is accepted. Do not add provider keys,
re-pin mods, publish archives or change the live profile as a diagnostic side
effect. Existing website/asset/release/import ownership stays intact.

Produce a separate bounded, sanitized artifact-export directory for hosted
upload. It contains summaries and allowlisted text evidence with credentials,
token-bearing URLs and personal paths removed. Record sanitization/omission.
Binary JFR and any later heap evidence remain private local outputs in this
delivery; hosted uploads exclude them. The workflow must upload the export
directory, not all raw inputs or the installation.

The text export has a 32 MiB total cap, prioritizing the summary, incident index,
thread snapshots, timeline and relevant log excerpts. Omitted evidence is listed;
the export never claims a complete log when only excerpts fit. Do not hide a
runtime failure behind an artifact-export failure.

## Acceptance and review

First-delivery completion requires:

* A fixture that emits `Done` then blocks does not pass startup or begin soak;
  a command-responsive fixture does. Decoy/old responses cannot satisfy readiness.
* Quiet healthy servers avoid incident capture; unresponsive ones generate bounded
  snapshots before timeout. Exit, PID reuse, attach failure, cancellation and
  diagnostics deadlines leave no owned processes or live-profile writes.
* Resource calculations use deterministic counter fixtures on Windows/Linux, with
  correct CPU units/reset handling and explicit unsupported data.
* Save-flush success, stalled flush, early process exit and unsupported response
  formats produce accurate separate workload/shutdown results on fresh worlds.
* GC fixtures cover healthy sawtooth behavior, pressure, growing post-collection
  data, young versus full cycles, rotation, truncation and missing measurements.
  None alone produces a confirmed leak verdict.
* Saved-log fixtures cover configuration noise, dependency errors, watchdog,
  native/JVM crashes, oversized/malformed input, hostile text and output links.
* Report/version/fingerprint tests reject misleading comparisons and preserve
  explicit baseline promotion. Artifact export is allowlisted and bounded.
* Existing tool/repository checks pass on supported Python versions and hosted
  Windows/Linux. Actual disposable Minecraft checks are reported separately from
  fixture checks, with exact tested bytes and no baseline promotion by default.

Readiness, responsiveness and attribution findings must be checked against the
recent failed candidate evidence without relabeling that run as a success. Real
acceptance after implementation must use new disposable directories. Passing
first delivery establishes server-monitoring/report behavior, not client,
multiplayer, long-gameplay or retained-object proof.

The design is self-reviewed before requesting written-spec approval. After that
approval, produce the implementation plan and have the user select its execution
method before product implementation, as required by the brainstorming workflow.

## Technical references

* [Java 21 jcmd](https://docs.oracle.com/en/java/javase/21/docs/specs/man/jcmd.html):
  local JVM diagnostics, bounded JFR controls and impact distinctions.
* [spark command documentation](https://spark.lucko.me/docs/Command-Usage): tick,
  memory and locally saved profiling capabilities; pinned-version support must be
  verified before an integration is enabled.
