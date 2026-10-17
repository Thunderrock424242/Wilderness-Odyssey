# Modpack foundation implementation plan

Goal: safely import the current local profile, produce a pinned packwiz view,
validate/reconstruct/package it, and provide bounded disposable server diagnostics.

Architecture: Python standard library modules, existing asset ownership, packwiz
interoperability, no JARs in Git. Spec: [design.md](design.md).

Global constraints: Minecraft 1.21.1; Java 21; loader comes from the selected
current profile; no live-profile writes; no public self-hosted PR execution.

Review focus: stale launcher metadata; malformed/embedded JAR metadata; Windows
path collisions and symlinks; uncertain dependency/side evidence; nonreproducing
or changed crash signatures. Tests must exercise each of these input classes.

1. [x] Scan and lock: add realistic fixture tests, observe failure, implement
   hash-verified identities, embedded metadata, change reports and review binding.
2. [x] Generate and validate: test pin/hash/path/dependency/side failures, implement
   deterministic packwiz views and static validation with explicit pending state.
3. [x] Install and package: test fresh destinations, private local downloads,
   hash mismatch and deterministic archives; implement bounded provider downloads.
4. [x] Diagnostics: test crash classes and memory interpretation, implement
   classification/reporting with phase-specific evidence and no leak assertions.
5. [x] Isolation: test dependency closures, pairs, changed signatures, unstable
   failures and budgets; implement a callback-based engine, then wire live trials.
6. [x] QA and CI: implement disposable server lifecycle with readiness/cleanup,
   opt-in profiling, hosted static checks, protected manual QA, release artifacts,
   and a private Windows execution guide. Keep website workflow byte-identical.
7. [ ] Verify and review: run the full suite and repository guards, import only
   the confirmed source, document real-runtime gaps, review changes, commit/push
   the dedicated feature branch and open a draft PR against `1.21-neoforge`.

Execution record and test evidence are maintained in `docs/modpack/verification.md`.
