"""Behavior tests for bounded, evidence-based disposable QA diagnostics."""

import unittest

from tools.modpack import diagnostics


RUNTIME_CRASH = """[12:34:56] [Server thread/ERROR]: Encountered an unexpected exception
java.lang.RuntimeException: Cannot build encounter
    at example.events.Encounter.build(Encounter.java:41)
    at net.minecraft.server.MinecraftServer.runServer(MinecraftServer.java:912)
Caused by: java.lang.IllegalStateException: Missing arena at C:\\qa\\trial-42\\world\\arena.dat
    at example.world.Arena.open(Arena.java:65)
[12:34:57] [Server thread/FATAL]: Crash report saved to C:\\qa\\trial-42\\crash-reports\\crash-2026-10-16_12.34.57-server.txt
"""


class ClassificationTests(unittest.TestCase):
    def test_clean_ready_exit_is_success_despite_warnings_and_trace_mentions(self):
        result = diagnostics.classify(
            "[WARN] Optional integration: java.lang.RuntimeException: example\n"
            " at harmless.optional.Hook.run(Hook.java:13)\n"
            "[WARN] Can't keep up! Is the server overloaded?\nStopping server\n",
            0,
            started=True,
        )
        self.assertEqual("success", result["category"])
        self.assertFalse(result["crashed"])
        self.assertFalse(result["isolation_eligible"])
        self.assertIsNone(result["signature"])
        self.assertEqual([], result["suspects"])

    def test_installer_exit_or_asset_progress_does_not_establish_startup(self):
        for logs in ("Installer successfully installed", "Reloading ResourceManager: vanilla"):
            with self.subTest(logs=logs):
                result = diagnostics.classify(logs, 0)
                self.assertEqual("startup_failure", result["category"])
                self.assertFalse(result["crashed"])
                self.assertFalse(result["isolation_eligible"])

    def test_direct_failures_are_not_candidates_for_isolation(self):
        cases = [
            ("Missing or unsupported mandatory dependencies:\nMod ID: 'example', Requested by: 'quest'", "dependency_failure"),
            ("net.neoforged.fml.loading.EarlyLoadingException: Incompatible mod set", "incompatible_mods"),
            ("java.lang.OutOfMemoryError: Java heap space", "out_of_memory"),
            ("There is insufficient memory for the Java Runtime Environment to continue.", "out_of_memory"),
            ("# A fatal error has been detected by the Java Runtime Environment:\n# EXCEPTION_ACCESS_VIOLATION (0xc0000005) at pc=0x000001c887ff", "jvm_crash"),
            ("# SIGSEGV (0xb) at pc=0x00007fe1234, pid=7821", "jvm_crash"),
            ("A single server tick took 60.00 seconds (should be max 0.05)\nConsidering it to be crashed, server will forcibly shutdown.", "watchdog"),
            ("Error occurred during initialization of VM\nUnrecognized VM option 'bogus'", "startup_failure"),
        ]
        for logs, category in cases:
            with self.subTest(category=category, logs=logs):
                result = diagnostics.classify(logs, 1, started=True)
                self.assertEqual(category, result["category"])
                self.assertFalse(result["isolation_eligible"])
                self.assertTrue(result["evidence"])
                self.assertEqual([], result["suspects"])

    def test_dependency_version_message_is_direct_evidence(self):
        result = diagnostics.classify(
            "Mod 'quest' requires 'common' version 2 or above\nCurrently, common is not installed",
            1,
        )
        self.assertEqual("dependency_failure", result["category"])
        self.assertFalse(result["isolation_eligible"])

    def test_trace_backed_unknown_crash_is_eligible_before_or_after_readiness(self):
        for started in (False, True):
            with self.subTest(started=started):
                result = diagnostics.classify(RUNTIME_CRASH, 1, started=started)
                self.assertEqual("uncertain_crash", result["category"])
                self.assertTrue(result["crashed"])
                self.assertTrue(result["isolation_eligible"])
                self.assertTrue(result["signature"])
                self.assertEqual([], result["suspects"])
                self.assertIn("RuntimeException", "\n".join(result["evidence"]))

    def test_explicit_gameplay_crash_is_separate_from_startup_soak_isolation(self):
        result = diagnostics.classify(
            "---- Minecraft Crash Report ----\nDescription: Ticking entity\n" + RUNTIME_CRASH,
            1,
            started=True,
        )
        self.assertEqual("gameplay_crash", result["category"])
        self.assertTrue(result["crashed"])
        self.assertFalse(result["isolation_eligible"])

    def test_nonzero_exit_without_crash_evidence_does_not_authorize_isolation(self):
        for started, category in ((False, "startup_failure"), (True, "inconclusive")):
            with self.subTest(started=started):
                result = diagnostics.classify("Process exited with code 1", 1, started=started)
                self.assertEqual(category, result["category"])
                self.assertFalse(result["crashed"])
                self.assertFalse(result["isolation_eligible"])
                self.assertIsNone(result["signature"])

    def test_caught_warning_trace_plus_unrelated_exit_is_not_crash_evidence(self):
        result = diagnostics.classify(
            "[12:00:00] [main/WARN]: Optional integration could not initialize\n"
            "java.lang.RuntimeException: optional hook unavailable\n"
            " at optional.Hook.initialize(Hook.java:22)\n"
            "[12:00:01] [main/INFO]: Continuing without optional integration\n"
            "Process exited with code 1",
            1,
        )
        self.assertFalse(result["crashed"])
        self.assertFalse(result["isolation_eligible"])
        self.assertIsNone(result["signature"])

    def test_neoforge_transformer_module_frames_are_actual_crash_evidence(self):
        result = diagnostics.classify(
            "[16Oct2026 12:34:56.015] [Server thread/ERROR]: Encountered an unexpected exception\n"
            "java.lang.RuntimeException: test trigger\n"
            " at TRANSFORMER/quests@2.3.4/example.events.Encounter.build(Encounter.java:41) ~[quests.jar:?]\n"
            " at TRANSFORMER/minecraft@1.21.1/net.minecraft.server.MinecraftServer.runServer(MinecraftServer.java:912) ~[server.jar:?]\n",
            1,
        )
        self.assertEqual("uncertain_crash", result["category"])
        self.assertTrue(result["isolation_eligible"])

    def test_footer_alone_is_not_a_repeatable_crash_signature(self):
        result = diagnostics.classify(
            "Crash report saved to crash-reports/crash-2026-10-16-server.txt\nProcess exited with code 1",
            1,
            started=True,
        )
        self.assertIsNone(result["signature"])
        self.assertFalse(result["isolation_eligible"])

    def test_timeout_and_missing_exit_are_inconclusive_not_crashes(self):
        result = diagnostics.classify("Preparing spawn area: 24%", None, timed_out=True)
        self.assertEqual("timeout", result["category"])
        self.assertFalse(result["crashed"])
        self.assertFalse(result["isolation_eligible"])
        self.assertIsNone(result["signature"])
        result = diagnostics.classify("Waiting for process", None)
        self.assertEqual("inconclusive", result["category"])

    def test_direct_crash_evidence_survives_harness_deadline(self):
        result = diagnostics.classify("java.lang.OutOfMemoryError: GC overhead limit exceeded", None, timed_out=True)
        self.assertEqual("out_of_memory", result["category"])

    def test_harness_failure_is_never_misreported_as_a_mod_crash(self):
        result = diagnostics.classify(RUNTIME_CRASH, 1, harness_error="Could not create trial directory")
        self.assertEqual("harness_failure", result["category"])
        self.assertFalse(result["crashed"])
        self.assertFalse(result["isolation_eligible"])
        self.assertIsNone(result["signature"])

    def test_all_classifications_have_the_public_contract(self):
        result = diagnostics.classify("", None)
        self.assertEqual(
            {"category", "message", "signature", "confidence", "evidence", "suspects", "next_step", "crashed", "isolation_eligible"},
            set(result),
        )


class SignatureTests(unittest.TestCase):
    def test_signature_ignores_time_addresses_source_lines_and_trial_paths(self):
        first = RUNTIME_CRASH + "Native address 0x001234ab\n"
        second = (
            RUNTIME_CRASH.replace("12:34:56", "23:09:10")
            .replace("12:34:57", "23:09:11")
            .replace("trial-42", "trial-999")
            .replace("Encounter.java:41", "Encounter.java:202")
            .replace("Arena.java:65", "Arena.java:11")
            + "Native address 0xabcd9999\n"
        )
        self.assertEqual(diagnostics.classify(first, 1)["signature"], diagnostics.classify(second, 1)["signature"])

    def test_volatile_values_inside_exception_message_are_normalized(self):
        first = RUNTIME_CRASH.replace(
            "Cannot build encounter", "Cannot build encounter at 0x001234ab on 2026-10-16T12:34:56Z in /tmp/trial-12/world/arena.dat"
        )
        second = RUNTIME_CRASH.replace(
            "Cannot build encounter", "Cannot build encounter at 0xabcd9999 on 2026-11-01T23:09:10Z in /home/qa/trial-999/world/arena.dat"
        )
        self.assertEqual(diagnostics.classify(first, 1)["signature"], diagnostics.classify(second, 1)["signature"])

    def test_different_exception_top_frame_or_cause_have_different_signatures(self):
        original = diagnostics.classify(RUNTIME_CRASH, 1)["signature"]
        for changed in (
            RUNTIME_CRASH.replace("RuntimeException", "UnsupportedOperationException"),
            RUNTIME_CRASH.replace("Encounter.build", "Encounter.spawn"),
            RUNTIME_CRASH.replace("IllegalStateException", "IllegalArgumentException"),
        ):
            with self.subTest(changed=changed):
                self.assertNotEqual(original, diagnostics.classify(changed, 1)["signature"])

    def test_same_footer_does_not_make_different_crashes_match(self):
        other = RUNTIME_CRASH.replace("example.events.Encounter.build", "other.network.Connection.close")
        self.assertNotEqual(diagnostics.classify(RUNTIME_CRASH, 1)["signature"], diagnostics.classify(other, 1)["signature"])

    def test_prior_optional_error_is_not_the_fatal_crash_identity(self):
        optional = "[WARN] java.lang.IllegalArgumentException: optional integration\n at optional.Hook.run(Hook.java:1)\n"
        self.assertEqual(
            diagnostics.classify(RUNTIME_CRASH, 1)["signature"],
            diagnostics.classify(optional + RUNTIME_CRASH, 1)["signature"],
        )

    def test_evidence_is_contextual_bounded_and_safe_for_markdown(self):
        hostile = "[ERROR] <script>alert(1)</script> [go](https://bad.invalid)\n" + RUNTIME_CRASH + ("X" * 10000 + "\n") * 100
        result = diagnostics.classify(hostile, 1)
        text = "\n".join(result["evidence"])
        self.assertIn("RuntimeException", text)
        self.assertLessEqual(len(text), 12000)
        self.assertNotIn("<script>", text)
        self.assertNotIn("[go](", text)

    def test_escaping_does_not_expand_evidence_beyond_its_output_budget(self):
        hostile = RUNTIME_CRASH.replace("Cannot build encounter", "[" * 2000)
        text = "\n".join(diagnostics.classify(hostile, 1)["evidence"])
        self.assertLessEqual(len(text), 12000)
        self.assertTrue(all(len(line) <= 600 for line in text.splitlines()))


class MemoryTests(unittest.TestCase):
    def test_no_samples_explains_metrics_are_unmeasured(self):
        result = diagnostics.analyze_memory([])
        self.assertEqual("unmeasured", result["status"])
        self.assertEqual(0, result["sample_count"])
        self.assertFalse(result["suspected_growth"])
        self.assertTrue(result["limitations"])

    def test_sawtooth_heap_with_stable_post_gc_is_not_a_leak_warning(self):
        samples = [
            {"elapsed_seconds": t, "heap_used_bytes": heap, "post_gc_heap_bytes": 100_000_000, "threads": 40, "cpu_percent": 20}
            for t, heap in ((0, 120_000_000), (30, 220_000_000), (60, 130_000_000), (90, 250_000_000), (120, 125_000_000))
        ]
        result = diagnostics.analyze_memory(samples)
        self.assertFalse(result["suspected_growth"])
        self.assertNotIn("leak", " ".join(result["warnings"]).lower())
        self.assertEqual(5, result["sample_count"])
        self.assertEqual(120, result["duration_seconds"])

    def test_sustained_post_gc_growth_is_suspicion_and_not_proof_of_leak(self):
        result = diagnostics.analyze_memory([
            {"elapsed_seconds": n * 60, "heap_used_bytes": (200 + n * 40) * 1024**2,
             "post_gc_heap_bytes": (100 + n * 40) * 1024**2, "threads": 40 + n * 2,
             "gc_count": 10 + n * 2, "gc_pause_ms": 100 + n * 25}
            for n in range(5)
        ])
        self.assertTrue(result["suspected_growth"])
        self.assertEqual("suspected_growth", result["status"])
        self.assertGreater(result["metrics"]["post_gc_heap_bytes"]["slope_per_second"], 0)
        self.assertIn("not", " ".join(result["limitations"]).lower())
        self.assertNotIn("confirmed leak", " ".join(result["warnings"]).lower())

    def test_short_or_sparse_samples_do_not_claim_growth(self):
        for samples in (
            [{"elapsed_seconds": 0, "post_gc_heap_bytes": 1}, {"elapsed_seconds": 5, "post_gc_heap_bytes": 500_000_000}],
            [{"elapsed_seconds": n * 60, "heap_used_bytes": (100 + n * 50) * 1024**2} for n in range(5)],
        ):
            with self.subTest(samples=samples):
                result = diagnostics.analyze_memory(samples)
                self.assertFalse(result["suspected_growth"])
                self.assertTrue(result["limitations"])

    def test_invalid_nonfinite_samples_do_not_corrupt_trends(self):
        result = diagnostics.analyze_memory([
            {}, {"elapsed_seconds": float("nan"), "heap_used_bytes": float("inf")},
            {"elapsed_seconds": -1, "threads": -1},
            {"elapsed_seconds": 10, "heap_used_bytes": 20, "cpu_percent": 0, "threads": 3},
            {"elapsed_seconds": 10, "heap_used_bytes": 30},
            {"elapsed_seconds": "no", "heap_used_bytes": 40},
        ])
        self.assertEqual(1, result["sample_count"])
        self.assertEqual(0, result["duration_seconds"])
        self.assertFalse(result["suspected_growth"])

    def test_partial_metrics_and_gc_counters_remain_explicit(self):
        result = diagnostics.analyze_memory([
            {"elapsed_seconds": 0, "cpu_percent": 0, "threads": 40, "gc_count": 2, "gc_pause_ms": 10},
            {"elapsed_seconds": 60, "cpu_percent": 25, "threads": 41, "gc_count": 5, "gc_pause_ms": 40},
        ])
        self.assertEqual(3, result["metrics"]["gc_count"]["delta"])
        self.assertEqual(30, result["metrics"]["gc_pause_ms"]["delta"])
        self.assertIsNone(result["metrics"]["heap_used_bytes"])
        self.assertEqual(0, result["metrics"]["cpu_percent"]["first"])


class ReportTests(unittest.TestCase):
    def test_report_separates_stages_and_leaves_unmeasured_performance_explicit(self):
        result = diagnostics.classify("Gradle failed before Java server launch", 1)
        result.update({
            "phases": {
                "installer": {"status": "failed", "seconds": 12, "evidence": ["Download hash mismatch"]},
                "startup": {"status": "skipped"}, "soak": {"status": "not_measured"},
                "shutdown": {"status": "skipped"},
            },
            "metrics": {"startup_seconds": None, "loaded_mods": None, "avg_mspt": None, "worst_mspt": None},
            "artifacts": {"installer_log": "artifacts/installer.log"},
        })
        report = diagnostics.render_report(result)
        for text in ("Installer", "Startup", "Soak", "Shutdown", "failed", "skipped", "not measured", "MSPT", "installer.log", "GPU", "client"):
            self.assertIn(text, report)
        self.assertNotIn("Startup | passed", report)
        self.assertIn("Download hash mismatch", report)

    def test_report_escapes_external_fields_and_is_bounded(self):
        result = diagnostics.classify("", None)
        result.update({
            "message": "<img src=x onerror=alert(1)>\n# Injected\n[click](https://bad.invalid)",
            "evidence": ["```\n<script>evil</script>\n```" + "X" * 20000] * 100,
            "artifacts": {"<script>": "[click](https://bad.invalid)"},
        })
        report = diagnostics.render_report(result)
        self.assertNotIn("<img", report)
        self.assertNotIn("<script>", report)
        self.assertNotIn("\n# Injected", report)
        self.assertNotIn("[click](", report)
        self.assertLessEqual(len(report), 32000)

    def test_memory_and_isolation_limits_are_visible_in_report(self):
        result = diagnostics.classify(RUNTIME_CRASH, 1)
        result["memory"] = diagnostics.analyze_memory([])
        result["isolation"] = {"status": "inconclusive", "remaining_suspects": ["example"], "limitations": ["Trial budget exhausted"]}
        report = diagnostics.render_report(result)
        self.assertIn("unmeasured", report)
        self.assertIn("Trial budget exhausted", report)
        self.assertIn("example", report)


if __name__ == "__main__":
    unittest.main()
