"""Bounded, standard-library diagnostics for disposable modpack QA trials.

Log classification describes evidence; it does not attribute a crash to a mod
whose package happens to appear in a trace. Memory sampling can suggest growth,
but retained-object analysis is required to establish a leak.
"""

from __future__ import annotations

import hashlib
import html
import math
import re
from collections.abc import Mapping


_MAX_LOG_CHARS = 4_000_000
_MAX_EVIDENCE_LINES = 18
_MAX_EVIDENCE_LINE = 500
_MAX_REPORT_CHARS = 32_000
_METRICS = (
    "heap_used_bytes", "post_gc_heap_bytes", "threads", "cpu_percent",
    "gc_count", "gc_pause_ms",
)
_EXCEPTION = re.compile(
    r"(?<![\w$])(?:(?:[\w$]+\.)+)?[\w$]*(?:Exception|Error|Throwable)\b"
)
_FRAME = re.compile(r"\bat\s+([^\s()]+)\(([^)]+)\)")
_LOG_LEVEL = re.compile(r"\[(?:[^\]]*/)?(WARN|INFO|DEBUG|ERROR|FATAL)\](?::|\s|$)")
_CRASH_START = re.compile(
    r"Encountered an unexpected exception|---- Minecraft Crash Report ----|"
    r"Exception in thread\s+\"|Uncaught exception|Error executing task on Server|"
    r"Failed to start the minecraft server",
    re.IGNORECASE,
)
_FOOTER = re.compile(r"crash report (?:saved|has been saved)|process exited|exit code", re.IGNORECASE)
_DIRECT_FAILURES = (
    (
        "out_of_memory",
        re.compile(r"\bOutOfMemoryError\b|There is insufficient memory for the Java Runtime Environment|"
                   r"Native memory allocation \([^\n]+\) failed", re.IGNORECASE),
        "The Java process reported memory exhaustion.",
        "Inspect the heap limit, native memory and GC logs before repeating the same workload.",
    ),
    (
        "jvm_crash",
        re.compile(r"A fatal error has been detected by the Java Runtime Environment|"
                   r"\bEXCEPTION_ACCESS_VIOLATION\b|#\s*SIG(?:SEGV|BUS|ILL)\b|"
                   r"Internal Error \([^\n]*(?:hotspot|\.cpp:)", re.IGNORECASE),
        "The Java runtime reported a native or VM crash.",
        "Inspect the private hs_err log, Java build and native components; a Java trace alone cannot identify the cause.",
    ),
    (
        "dependency_failure",
        re.compile(r"Missing (?:or unsupported )?(?:mandatory|required) dependencies|"
                   r"Missing mandatory dependency|requires?\s+(?:the\s+)?(?:mod\s+)?['\"]?[\w.-]+['\"]?\s+"
                   r"(?:version|\[)|Mod\s+['\"]?[\w.-]+['\"]?\s+requires?\s+['\"]?[\w.-]+['\"]?\s+"
                   r"(?:version|\d)|(?:mandatory|required) dependenc[^\n]*(?:not installed|missing)|"
                   r"ModResolutionException[^\n]*missing", re.IGNORECASE),
        "The loader reported a missing or unsupported required dependency.",
        "Resolve the exact required dependency and version in the pinned inventory, then retry startup.",
    ),
    (
        "incompatible_mods",
        re.compile(r"incompatible mod set|(?:found|detected) incompatible mods|incompatible mods detected|"
                   r"DuplicateModsFoundException|Mod\s+['\"]?[\w.-]+['\"]?[^\n]*\bis incompatible with\b", re.IGNORECASE),
        "The loader explicitly reported incompatible or duplicate mods.",
        "Review the loader's compatibility details and pinned versions before retrying startup.",
    ),
    (
        "watchdog",
        re.compile(r"A single server tick took|Considering it to be crashed, server will forcibly shutdown|"
                   r"Description:\s*Watching Server", re.IGNORECASE),
        "The server watchdog reported a stalled tick.",
        "Inspect the watchdog's sampled server thread and trial phase; a slow tick does not identify a mod by itself.",
    ),
)
_STARTUP_ERROR = re.compile(
    r"Error occurred during initialization of VM|Could not find or load main class|"
    r"Unable to access jarfile|Invalid or corrupt jarfile|UnsupportedClassVersionError|"
    r"Unrecognized VM option",
    re.IGNORECASE,
)
_MOD_LOADING_FAILURE = re.compile(
    r'ModLoadingException:\s*Loading errors encountered|Description:\s*Mod loading failures have occurred',
    re.IGNORECASE,
)
_GAMEPLAY = re.compile(
    r"Description:\s*(?:Ticking (?:entity|block entity|memory connection)|"
    r"Exception ticking world|Exception in server tick loop)", re.IGNORECASE,
)


def _safe(value: object, limit: int = 500) -> str:
    """Render untrusted values as a single bounded Markdown text fragment."""
    text = html.unescape(str(value))
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = " / ".join(text.splitlines())
    if len(text) > limit:
        text = text[:limit - 1] + "…"
    text = html.escape(text, quote=True)
    text = text.translate(str.maketrans({c: f"&#{ord(c)};" for c in "\\`*_{}[]()#+!|>"}))
    if len(text) > limit:
        # Count the serialized output, including escaping, against the budget.
        text = re.sub(r"&[^;]*$", "", text[:limit - 1]) + "…"
    return text


def _bounded_lines(logs: str) -> list[str]:
    if len(logs) > _MAX_LOG_CHARS:
        half = _MAX_LOG_CHARS // 2
        logs = logs[:half] + "\n[diagnostics: middle of oversized log omitted]\n" + logs[-half:]
    return logs.splitlines()


def _evidence(lines: list[str], positions: list[int]) -> list[str]:
    """Keep matching lines and nearby context, never an unbounded log tail."""
    selected: set[int] = set()
    for index in positions[:6]:
        selected.update(range(max(0, index - 1), min(len(lines), index + 3)))
    return [_safe(lines[i], _MAX_EVIDENCE_LINE) for i in sorted(selected)[:_MAX_EVIDENCE_LINES]]


def _crash_trace(lines: list[str]) -> list[str]:
    starts = [i for i, line in enumerate(lines) if _CRASH_START.search(line) and not _FOOTER.search(line)]
    start = starts[-1] if starts else 0
    # A cause can be far from the crash header, but bounded inspection also avoids
    # retaining an entire crash report's mod inventory.
    window = lines[start:start + 300]
    traces: list[str] = []
    exception_seen = False
    frames = 0
    level = None
    for line in window:
        if _FOOTER.search(line):
            continue
        logged_level = _LOG_LEVEL.search(line[:150]) if line.lstrip().startswith("[") else None
        if logged_level:
            level = logged_level.group(1)
            if level in ("WARN", "INFO", "DEBUG"):
                exception_seen = False
        if level in ("WARN", "INFO", "DEBUG"):
            continue
        if _EXCEPTION.search(line):
            traces.append(line)
            exception_seen = True
            frames = 0
        elif exception_seen and _FRAME.search(line) and frames < 6:
            traces.append(line)
            frames += 1
        if len(traces) >= 40:
            break
    return traces


def _normalize(line: str) -> str:
    line = re.sub(r"^\s*\[[^\]]*\d\d:\d\d:\d\d[^\]]*\]\s*", "", line)
    line = re.sub(r"^\s*\[(?:[^\]]+/)?(?:ERROR|FATAL|WARN|INFO)\]:?\s*", "", line)
    line = re.sub(r"\b\d{4}-\d\d-\d\d[T _]\d\d[.:]\d\d[.:]\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?\b", "<time>", line)
    line = re.sub(r"\b0x[0-9a-fA-F]+\b", "<address>", line)
    line = re.sub(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b", "<uuid>", line)
    line = re.sub(r"([\w$]+\.java):\d+", r"\1:<line>", line)
    line = re.sub(r"\bline\s+\d+\b", "line <line>", line, flags=re.IGNORECASE)
    line = re.sub(r"[A-Za-z]:[\\/][^\s\"'<>]+|(?<![\w:/])/(?:[^\s/\"'<>]+/)+[^\s\"'<>]*", "<path>", line)
    line = re.sub(r"\b(?:pid|tid)\s*[=:]\s*\d+", "id=<id>", line, flags=re.IGNORECASE)
    return " ".join(line.split())


def _signature(lines: list[str], category: str) -> str | None:
    if not lines:
        return None
    normalized = "\n".join(_normalize(line) for line in lines)
    return hashlib.sha256((category + "\n" + normalized).encode("utf-8")).hexdigest()


def classify(
    logs: str,
    exit_code: int | None,
    timed_out: bool = False,
    started: bool = False,
    harness_error: str | None = None,
    evidence_only: bool = False,
) -> dict:
    """Classify one trial using explicit crash evidence and process outcome.

    ``started`` must be the runner's verified Minecraft readiness signal. A clean
    installer exit or asset-loading line is not evidence of server readiness.
    Only an unknown, trace-backed crash is eligible for the startup/soak isolator.
    """
    result = {
        "category": "inconclusive", "message": "The trial has no conclusive process outcome.",
        "signature": None, "confidence": "low", "evidence": [], "suspects": [],
        "next_step": "Inspect the process and phase logs before retrying the trial.",
        "crashed": False, "isolation_eligible": False,
    }
    if harness_error:
        result.update(category="harness_failure", message="The QA harness failed; this is not evidence of a mod crash.",
                      confidence="high", evidence=[_safe(harness_error)],
                      next_step="Repair the harness error before running another Minecraft trial.")
        return result

    lines = _bounded_lines(logs)
    # Warnings and caught exceptions in a clean, ready server are not failures.
    if exit_code == 0 and started and not timed_out:
        result.update(category="success", message="The server reached readiness and exited successfully.",
                      confidence="high", next_step="Review the measured startup and soak coverage before accepting the pack.")
        return result

    # A running process is not a failed trial. Direct fatal evidence may explain
    # a missing exit after the harness deadline, so inspect it before timeouts.
    loading_positions = [i for i,line in enumerate(lines) if _MOD_LOADING_FAILURE.search(line)] if not started else []
    # NeoForge's Main can catch a fatal loading error and still return code zero.
    failure_context = evidence_only or exit_code not in (None, 0) or timed_out or (exit_code is not None and bool(loading_positions))
    if failure_context:
        for category, pattern, message, next_step in _DIRECT_FAILURES:
            positions = [i for i, line in enumerate(lines) if pattern.search(line)]
            if positions:
                trace = _crash_trace(lines)
                result.update(category=category, message=message, confidence="high",
                              evidence=_evidence(lines, positions), crashed=True, next_step=next_step,
                              signature=_signature(trace or [lines[i] for i in positions[:4]], category))
                return result
        positions = [i for i, line in enumerate(lines) if _STARTUP_ERROR.search(line)]
        if positions:
            result.update(category="startup_failure", message="The Java process could not initialize the server.",
                          confidence="high", evidence=_evidence(lines, positions),
                          next_step="Correct the Java version, launch options or verified server files, then retry startup.")
            return result

        if loading_positions:
            instances = [i for i,line in enumerate(lines) if 'Failed to create mod instance.' in line]
            trace = _crash_trace(lines[instances[-1]:instances[-1]+120]) if instances else _crash_trace(lines)
            causes = [i for i,line in enumerate(trace) if line.lstrip().startswith('Caused by:')]
            root = trace[causes[-1]:causes[-1]+8] if causes else trace[:8]
            evidence = [_safe(line,_MAX_EVIDENCE_LINE) for line in root+trace[:4]]
            evidence += _evidence(lines,loading_positions)[:4]
            result.update(category='startup_failure',
                message='NeoForge reported a fatal mod-loading failure before server readiness.',
                confidence='high',crashed=True,evidence=evidence[:_MAX_EVIDENCE_LINES],
                signature=_signature(trace,'startup_failure'),
                next_step='Inspect the cause chain and runtime environment in the loader/crash logs before changing mods; a named mod alone does not establish blame.')
            return result

        trace = _crash_trace(lines)
        has_exception = any(_EXCEPTION.search(line) for line in trace)
        has_frame = any(_FRAME.search(line) for line in trace)
        if has_exception and has_frame:
            gameplay = started and any(_GAMEPLAY.search(line) for line in lines)
            category = "gameplay_crash" if gameplay else "uncertain_crash"
            phase = "after" if started else "before"
            result.update(
                category=category,
                message=f"A Java crash occurred {phase} verified server readiness; the cause is not established.",
                signature=_signature(trace, category), confidence="medium", crashed=True,
                evidence=[_safe(line, _MAX_EVIDENCE_LINE) for line in trace[:_MAX_EVIDENCE_LINES]],
                isolation_eligible=not gameplay,
                next_step=("Reproduce the gameplay trigger with a controlled workload; this runner covers startup and soak only."
                           if gameplay else "Reproduce the same crash signature before bounded dependency-aware isolation."),
            )
            return result

    if timed_out:
        result.update(category="timeout", message="The trial reached its deadline without a conclusive crash diagnosis.",
                      confidence="high", evidence=[_safe(line) for line in lines[-4:]],
                      next_step="Inspect the active phase and sampled thread stacks; a timeout alone is not a mod crash.")
    elif exit_code is not None and not started:
        result.update(category="startup_failure", message="The process exited before verified Minecraft readiness.",
                      confidence="high", evidence=[_safe(line) for line in lines[-4:]],
                      next_step="Inspect startup and installer logs; only the server readiness signal establishes successful startup.")
    elif exit_code not in (None, 0):
        result.update(message="The ready server exited unsuccessfully without a usable crash trace.",
                      evidence=[_safe(line) for line in lines[-4:]],
                      next_step="Collect the crash report and process logs before attributing or isolating the failure.")
    return result


def _number(value: object) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return value if math.isfinite(value) and value >= 0 else None
    except OverflowError:
        return None


def _trend(points: list[tuple[float, float]]) -> dict | None:
    if not points:
        return None
    times, values = zip(*points)
    duration = times[-1] - times[0]
    mean_t, mean_v = sum(times) / len(times), sum(values) / len(values)
    variance = sum((t - mean_t) ** 2 for t in times)
    slope = sum((t - mean_t) * (v - mean_v) for t, v in points) / variance if variance else None
    return {
        "sample_count": len(points), "duration_seconds": duration,
        "first": values[0], "last": values[-1], "min": min(values), "max": max(values),
        "mean": mean_v, "delta": values[-1] - values[0], "slope_per_second": slope,
    }


def analyze_memory(samples: list[dict]) -> dict:
    """Summarize sampled metrics; sustained post-GC growth remains suspicion.

    ``gc_count`` and ``gc_pause_ms`` are cumulative counters. Missing values are
    left unmeasured. Samples need a finite, nonnegative elapsed time; duplicate
    timestamps use the first usable sample rather than fabricating duration.
    """
    rows: dict[float, dict] = {}
    for row in samples[:100_000]:
        if not isinstance(row, Mapping):
            continue
        elapsed = _number(row.get("elapsed_seconds"))
        values = {key: _number(row.get(key)) for key in _METRICS}
        if elapsed is not None and any(value is not None for value in values.values()):
            rows.setdefault(elapsed, values)
    ordered = sorted(rows.items())
    metrics = {key: _trend([(t, row[key]) for t, row in ordered if row[key] is not None]) for key in _METRICS}
    result = {
        "status": "measured" if ordered else "unmeasured", "sample_count": len(ordered),
        "duration_seconds": ordered[-1][0] - ordered[0][0] if len(ordered) > 1 else 0,
        "metrics": metrics, "suspected_growth": False, "warnings": [],
        "limitations": ["Sampled metrics do not establish a memory leak; retained-object analysis and a repeatable workload are not measured."],
    }
    post_gc = metrics["post_gc_heap_bytes"]
    if post_gc is None:
        result["limitations"].append("Post-GC heap is unmeasured; ordinary heap growth and GC sawtooth patterns cannot identify retained growth.")
    elif post_gc["sample_count"] < 4 or post_gc["duration_seconds"] < 120:
        result["limitations"].append("The post-GC sample count or duration is too small to assess sustained growth.")
    else:
        values = [row["post_gc_heap_bytes"] for _, row in ordered if row["post_gc_heap_bytes"] is not None]
        increasing = sum(b > a for a, b in zip(values, values[1:])) / (len(values) - 1)
        meaningful_delta = max(32 * 1024**2, post_gc["first"] * 0.20)
        if post_gc["delta"] >= meaningful_delta and increasing >= 0.75 and post_gc["slope_per_second"] > 0:
            result.update(status="suspected_growth", suspected_growth=True)
            result["warnings"].append("Sustained post-GC heap growth is suspected in this sample window; repeat the same workload and inspect retained objects.")
    for key in ("gc_count", "gc_pause_ms"):
        metric = metrics[key]
        if metric and metric["delta"] < 0:
            result["warnings"].append(f"The {key} counter reset during sampling; its delta is not a total for the trial.")
    if len(samples) > 100_000:
        result["limitations"].append("Only the first 100000 input samples were analyzed.")
    return result


def _items(value: object, maximum: int = 18) -> list:
    if isinstance(value, (list, tuple)):
        return list(value[:maximum])
    return [value] if value else []


def render_report(result: dict) -> str:
    """Render a bounded report, keeping failure phases and coverage explicit."""
    lines = [
        "# Modpack QA report", "",
        f"Outcome: **{_safe(result.get('category', 'inconclusive'), 80)}**",
        _safe(result.get("message", "No diagnostic outcome was recorded."), 1000), "",
        f"Confidence: {_safe(result.get('confidence', 'unmeasured'), 80)}. "
        f"Crash evidence: {'yes' if result.get('crashed') else 'not established'}. "
        f"Isolation eligible: {'yes' if result.get('isolation_eligible') else 'no'}.",
        "", "## Phases", "", "| Phase | Status | Seconds | Evidence |", "| --- | --- | ---: | --- |",
    ]
    phases = result.get("phases", {})
    phases = phases if isinstance(phases, Mapping) else {}
    for name in ("validation", "setup", "installer", "startup", "soak", "workload", "shutdown"):
        phase = phases.get(name, {})
        phase = phase if isinstance(phase, Mapping) else {"status": phase}
        status = str(phase.get("status", "not_measured")).replace("_", " ")
        seconds = phase.get("seconds")
        duration = f"{seconds:.2f}" if _number(seconds) is not None else "not measured"
        evidence = " / ".join(_safe(x, 250) for x in _items(phase.get("evidence"), 3)) or "—"
        lines.append(f"| {name.title()} | {_safe(status, 80)} | {duration} | {evidence} |")
    readiness=result.get('readiness')
    if isinstance(readiness,Mapping):
        lines.extend(['',f"Console readiness: {'verified' if readiness.get('verified') is True else 'unverified'}. "
            f"Log marker seconds: {_safe(readiness.get('log_observed_seconds'))}; "
            f"verified seconds: {_safe(readiness.get('verified_seconds'))}."])
    lines.extend(['','## Findings',''])
    findings=_items(result.get('findings'),16)
    for item in findings:
        if not isinstance(item,Mapping): continue
        lines.append(f"- **{_safe(item.get('code'),100)}** ({_safe(item.get('confidence'),40)} confidence; phase {_safe(item.get('phase'),40)}): "+
            ' / '.join(_safe(value,300) for value in _items(item.get('evidence'),3)))
        lines.append('  Next: '+_safe(item.get('next_step'),400))
        lines.extend('  Limit: '+_safe(value,250) for value in _items(item.get('limitations'),2))
    if not findings: lines.append('No additional issue pattern established in the available evidence.')
    lines.extend(["", "## Evidence", ""])
    evidence = _items(result.get("evidence"))
    lines.extend(f"- {_safe(value, 600)}" for value in evidence)
    if not evidence:
        lines.append("No bounded diagnostic evidence was recorded.")
    if result.get("signature"):
        lines.extend(["", f"Crash signature: {_safe(result['signature'], 100)}"])
    lines.extend(["", f"Next step: {_safe(result.get('next_step', 'Review the phase logs.'), 1200)}", "", "## Measurements", ""])
    metrics = result.get("metrics", {})
    metrics = metrics if isinstance(metrics, Mapping) else {}
    for key, label in (("startup_seconds", "Startup seconds"), ('save_flush_seconds','Save flush acknowledgement seconds'), ("loaded_mods", "Loaded mods"),
                       ("avg_mspt", "Average MSPT"), ("worst_mspt", "Worst MSPT")):
        value = metrics.get(key)
        lines.append(f"- {label}: {_safe(value, 100) if _number(value) is not None else 'not measured'}")
    lines.append("- Player gameplay, multiplayer, client rendering and GPU performance: not measured by the startup/soak scenario.")
    gc=result.get('gc')
    if isinstance(gc,Mapping):
        lines.append('- GC observations: '+', '.join(_safe(key)+': '+_safe(gc.get(key),100)
            for key in ('count','pause_total_ms','pause_max_ms','pause_p95_ms','window_seconds','pause_fraction')))
    resources=_items(result.get('resources'),1500)
    lines.append(f'- Owned-process resource samples: {len(resources)}. CPU 100% means one logical CPU; RSS includes memory outside the Java heap.')
    for item in resources[:1]:
        if isinstance(item,Mapping) and isinstance(item.get('unavailable'),Mapping):
            lines.append('- Resource availability: '+_safe(item['unavailable'],500))
    memory = result.get("memory")
    if isinstance(memory, Mapping):
        lines.extend(["", "## Memory sampling", "", f"Status: {_safe(memory.get('status', 'unmeasured'), 80)}"])
        lines.append(f"Samples: {_safe(memory.get('sample_count', 0), 30)}. Duration seconds: {_safe(memory.get('duration_seconds', 0), 50)}.")
        memory_metrics = memory.get("metrics", {})
        memory_metrics = memory_metrics if isinstance(memory_metrics, Mapping) else {}
        for key in _METRICS:
            metric = memory_metrics.get(key)
            if isinstance(metric, Mapping):
                lines.append(f"- {_safe(key)}: first {_safe(metric.get('first'))}, last {_safe(metric.get('last'))}, "
                             f"delta {_safe(metric.get('delta'))}, slope per second {_safe(metric.get('slope_per_second'))}.")
            else:
                lines.append(f"- {_safe(key)}: not measured")
        for key in ("warnings", "limitations"):
            lines.extend(f"- {_safe(value, 600)}" for value in _items(memory.get(key), 8))
    else:
        lines.extend(["", "Memory and post-GC heap sampling: not measured."])
    isolation = result.get("isolation")
    if isinstance(isolation, Mapping):
        lines.extend(["", "## Isolation", "", f"Status: {_safe(isolation.get('status', 'inconclusive'), 80)}"])
        suspects = _items(isolation.get("remaining_suspects"), 30)
        lines.append("Remaining tested candidates: " + (", ".join(_safe(x, 100) for x in suspects) or "none established"))
        lines.extend(f"- {_safe(value, 600)}" for value in _items(isolation.get("limitations"), 8))
        lines.append("A candidate group is not individual mod attribution or proof of a cause.")
    lines.extend(['','## Coverage and limitations',''])
    analysis=result.get('analysis',{})
    analysis=analysis if isinstance(analysis,Mapping) else {}
    for values in (result.get('coverage'),result.get('diagnostic_limitations'),analysis.get('limitations')):
        lines.extend('- '+_safe(value,400) for value in _items(values,12))
    lines.extend(["", "## Artifacts", ""])
    artifacts = result.get("artifacts", {})
    if isinstance(artifacts, Mapping):
        lines.extend(f"- {_safe(name, 100)}: {_safe(value, 500)}" for name, value in list(artifacts.items())[:20])
    else:
        lines.extend(f"- {_safe(value, 500)}" for value in _items(artifacts, 20))
    if not artifacts:
        lines.append("No artifacts were recorded.")
    text = "\n".join(lines) + "\n"
    if len(text) > _MAX_REPORT_CHARS:
        text = text[:_MAX_REPORT_CHARS - 60] + "\n\nReport truncated; inspect the bounded private artifacts.\n"
    return text
