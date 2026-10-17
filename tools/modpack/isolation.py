"""Pure, dependency-aware delta debugging for a repeated uncertain crash.

The caller owns disposable installations, process cleanup and a timeout on every
``run_trial`` call. This module never opens files or launches processes. Budgets
and cancellation are checked around calls; they cannot interrupt a blocking
callback. A result describes observed groups, never a causal mod attribution.
"""

from collections import deque
from collections.abc import Callable
from math import isfinite
from time import monotonic


class _Halt(Exception):
    """Stop without discarding the last repeatedly confirmed candidate group."""


def _token(value):
    return value.strip().lower().replace("-", "_").replace(" ", "_") if isinstance(value, str) else ""


def _blocked_outcome(value):
    outcome = _token(value)
    return (any(word in outcome for word in ("dependenc", "harness", "timeout"))
            or outcome in {"timed_out", "cancelled", "canceled", "install_failure", "startup_failure"})


def _eligible(result):
    return (result["category"] == "uncertain_crash"
            and result["crashed"] is True
            and result["isolation_eligible"] is True
            and isinstance(result["signature"], str)
            and bool(result["signature"].strip())
            and not _blocked_outcome(result.get("outcome")))


def _diagnostic(value):
    """Keep bounded comparison fields, rather than copying potentially huge logs."""
    if (not isinstance(value, dict)
            or not isinstance(value.get("category"), str)
            or not isinstance(value.get("crashed"), bool)
            or not isinstance(value.get("isolation_eligible"), bool)
            or not isinstance(value.get("signature"), (str, type(None)))):
        return {"category": "harness_failure", "signature": None, "crashed": False,
                "isolation_eligible": False, "outcome": "malformed_result"}
    return {"category": _token(value["category"]), "signature": value.get("signature"),
            "crashed": value["crashed"], "isolation_eligible": value["isolation_eligible"],
            "outcome": _token(value.get("outcome"))}


def _graph(mods):
    if not isinstance(mods, list) or not mods:
        raise ValueError("A nonempty list of mod records is required.")
    requires, essentials = {}, set()
    for record in mods:
        if not isinstance(record, dict):
            raise ValueError("Each mod record must be a dictionary.")
        identifier = record.get("id")
        dependencies = record.get("requires", [])
        essential = record.get("essential", False)
        if (not isinstance(identifier, str) or not identifier.strip()
                or identifier != identifier.strip()):
            raise ValueError("Every mod needs a nonempty, trimmed string ID.")
        if identifier in requires:
            raise ValueError(f"Duplicate mod ID: {identifier}.")
        if (not isinstance(dependencies, list)
                or any(not isinstance(item, str) or not item for item in dependencies)
                or not isinstance(essential, bool)):
            raise ValueError(f"Invalid dependencies or essential flag for {identifier}.")
        requires[identifier] = set(dependencies)
        if essential:
            essentials.add(identifier)
    dependents = {identifier: set() for identifier in requires}
    for identifier, dependencies in requires.items():
        unknown = dependencies - requires.keys()
        if unknown:
            raise ValueError(f"Unknown dependencies for {identifier}: {', '.join(sorted(unknown))}.")
        for dependency in dependencies:
            dependents[dependency].add(identifier)
    counts = {identifier: len(dependencies) for identifier, dependencies in requires.items()}
    ready = deque(identifier for identifier, count in counts.items() if count == 0)
    visited = 0
    while ready:
        identifier = ready.popleft()
        visited += 1
        for dependent in dependents[identifier]:
            counts[dependent] -= 1
            if counts[dependent] == 0:
                ready.append(dependent)
    if visited != len(requires):
        raise ValueError("The dependency graph contains a cycle; isolation requires a resolved acyclic graph.")
    return requires, essentials


def isolate(mods: list[dict], run_trial: Callable[[set[str]], dict], max_tests=20,
            repeats=2, budget_seconds=1800, cancelled=lambda: False, expected_signature=None) -> dict:
    """Reduce repeated same-signature crashes, preserving required dependencies.

    At least two matching full-pack runs are required, even if ``repeats=1``.
    Every subset is repeated before it can shrink the last confirmed group.
    ``test_count`` counts callback invocations, including failed confirmations.
    Stable nonmatching crashes are uninformative, not evidence of a successful
    run. Nondeterministic repeats stop with an inconclusive result.

    ``isolated`` means a group is minimal under tested dependency-preserving
    single removals. It does not imply a globally smallest group or individual
    causation; dependencies and protected essential mods can be inseparable.
    """
    trials, cache = [], {}
    signature = expected_signature
    current, protected = set(), set()
    started = monotonic()
    caveat = ("Observations are not causal attribution. Minimality applies only to repeated, "
              "dependency-preserving removals in this startup/soak scenario, not a globally "
              "smallest group. Required dependencies and essential mods may be inseparable; "
              "finite repeats do not establish determinism. The callback owns per-trial timeouts.")

    def finish(status, reason, *, minimal=False):
        suspects = (sorted(current - protected if current - protected else current)
                    if status not in {"stopped", "invalid_input"} else [])
        ranked = []
        for identifier in suspects:
            ranked.append({
                "id": identifier,
                "matching_trials_with": sum(identifier in trial["mods"] and trial["comparison"] == "match"
                                             for trial in trials),
                "matching_trials_without": sum(identifier not in trial["mods"] and trial["comparison"] == "match"
                                                for trial in trials),
                "nonmatching_trials_with": sum(identifier in trial["mods"] and trial["comparison"] == "pass"
                                                for trial in trials),
                "uninformative_trials_with": sum(identifier in trial["mods"] and trial["comparison"] == "uninformative"
                                                  for trial in trials),
            })
        ranked.sort(key=lambda row: (-row["matching_trials_with"], row["id"]))
        return {"status": status, "original_signature": signature, "trials": trials,
                "test_count": len(trials), "remaining_suspects": suspects,
                "ranked_suspects": ranked, "protected_mods": sorted(protected),
                "reason": reason, "minimality_caveat": caveat,
                "minimality": "dependency_preserving_1_minimal" if minimal else "not_established"}

    try:
        if (not callable(run_trial) or not callable(cancelled)
                or not isinstance(max_tests, int) or isinstance(max_tests, bool) or max_tests < 0
                or not isinstance(repeats, int) or isinstance(repeats, bool) or repeats < 1
                or not isinstance(budget_seconds, (int, float)) or isinstance(budget_seconds, bool)
                or not isfinite(budget_seconds) or budget_seconds < 0):
            raise ValueError("Invalid callback, test budget, repeat count, or time budget.")
        if expected_signature is not None and (not isinstance(expected_signature,str) or not expected_signature.strip()):
            raise ValueError('Expected crash signature must be a nonempty string.')
        requires, essentials = _graph(mods)
    except ValueError as error:
        return finish("invalid_input", str(error))

    def closure(candidate):
        included = set(candidate) | protected
        pending = list(included)
        while pending:
            for dependency in requires[pending.pop()]:
                if dependency not in included:
                    included.add(dependency)
                    pending.append(dependency)
        return included

    protected = closure(essentials)
    current = set(requires)
    repeat_count = max(2, repeats)

    def check_limits(*, before_trial=False):
        try:
            is_cancelled = cancelled()
        except Exception as error:
            raise _Halt(f"Cancellation check failed ({type(error).__name__}).") from error
        if is_cancelled:
            raise _Halt("Isolation cancelled; the last confirmed group is retained.")
        if monotonic() - started >= budget_seconds:
            raise _Halt("Wall-clock time budget exhausted; the last confirmed group is retained.")
        if before_trial and len(trials) >= max_tests:
            raise _Halt("Test budget exhausted; the last confirmed group is retained.")

    def comparison(result):
        if _eligible(result) and result["signature"] == signature:
            return "match"
        if (result["category"] in {"success", "warning", "warnings"}
                and result["crashed"] is False and not _blocked_outcome(result.get("outcome"))):
            return "pass"
        return "uninformative"

    def trial(candidate, phase):
        nonlocal signature
        check_limits(before_trial=True)
        try:
            result = _diagnostic(run_trial(set(candidate)))
        except Exception as error:
            result = {"category": "harness_failure", "signature": None, "crashed": False,
                      "isolation_eligible": False, "outcome": f"callback_exception:{type(error).__name__}"}
        if signature is None and phase == "confirmation" and _eligible(result):
            signature = result["signature"]
        trials.append({"number": len(trials) + 1, "mods": sorted(candidate), "phase": phase,
                       **result, "comparison": comparison(result)})
        check_limits()
        return result

    def evaluate(candidate, phase):
        key = frozenset(candidate)
        if key in cache:
            return cache[key]
        first, outcome = None, None
        for _ in range(repeat_count):
            result = trial(candidate, phase)
            outcome = comparison(result)
            fingerprint = ((outcome,) if outcome in {"match", "pass"} else
                           (outcome, result["category"], result["signature"],
                            result["crashed"], result["isolation_eligible"], result.get("outcome")))
            if first is not None and fingerprint != first:
                raise _Halt("Unstable subset results; repeated trials disagreed, so narrowing is inconclusive.")
            first = fingerprint
        cache[key] = outcome
        return outcome

    try:
        first = trial(current, "confirmation")
        if not _eligible(first):
            return finish("stopped", "The full pack did not show an isolation-eligible uncertain crash; no subsets were tested.")
        if comparison(first) != 'match':
            return finish('inconclusive','Full-pack confirmation differed from the triggering crash signature; no subsets were tested.')
        for _ in range(repeat_count - 1):
            result = trial(current, "confirmation")
            if comparison(result) != "match":
                return finish("inconclusive", "Unstable original failure: full-pack repeats did not reproduce the same eligible signature.")
        cache[frozenset(current)] = "match"
        granularity = 2
        while current - protected:
            check_limits()
            optional = sorted(current - protected)
            count = min(granularity, len(optional))
            chunks = [set(optional[index * len(optional) // count:(index + 1) * len(optional) // count])
                      for index in range(count)]
            reduced = False
            for complement in (False, True):
                for chunk in chunks:
                    candidate = closure(current - chunk if complement else chunk)
                    if candidate == current:
                        continue  # A closure that re-adds removed prerequisites makes no progress.
                    if evaluate(candidate, "complement" if complement else "subset") == "match":
                        current = candidate
                        granularity = max(2, count - 1)
                        reduced = True
                        break
                if reduced:
                    break
            if reduced:
                continue
            if count == len(optional):
                break
            granularity = min(len(optional), count * 2)

        check_limits()
        if not current - protected:
            return finish("inconclusive", "The protected essential group reproduces the crash; optional mods cannot be blamed by this search.")
        # Single removals at the final granularity must have stable successful
        # outcomes. A different crash or harness failure proves no minimality.
        neighbors = {frozenset(closure(current - {identifier})) for identifier in current - protected}
        neighbors.discard(frozenset(current))
        if any(cache.get(candidate) != "pass" for candidate in neighbors):
            return finish("inconclusive", "Some dependency-preserving removals had uninformative results; minimality was not established.")
        return finish("isolated", "Repeated trials found a crash-reproducing group whose tested dependency-preserving single removals succeeded.", minimal=True)
    except _Halt as error:
        return finish("inconclusive", str(error))
