"""Behavioral tests for dependency-preserving, bounded crash isolation."""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).resolve().parents[2] / "tools" / "modpack" / "isolation.py"


def crash(signature="original", **overrides):
    result = {
        "category": "uncertain_crash",
        "signature": signature,
        "crashed": True,
        "isolation_eligible": True,
    }
    result.update(overrides)
    return result


def success():
    return {
        "category": "success",
        "signature": None,
        "crashed": False,
        "isolation_eligible": False,
    }


def mods(*identifiers):
    return [{"id": identifier, "requires": [], "essential": False}
            for identifier in identifiers]


class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE_PATH.is_file(), "The isolation engine is not implemented")
        spec = importlib.util.spec_from_file_location("modpack_isolation", MODULE_PATH)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.calls = []

    def isolate(self, records, behavior, **options):
        def trial(included):
            self.calls.append(set(included))
            return behavior(set(included))
        return self.module.isolate(records, trial, **options)

    def test_single_culprit_is_confirmed_before_narrowing(self):
        result = self.isolate(mods("a", "bad", "c", "d"),
                              lambda included: crash() if "bad" in included else success(),
                              max_tests=100)
        self.assertEqual(self.calls[:2], [{"a", "bad", "c", "d"}] * 2)
        self.assertEqual(result["status"], "isolated")
        self.assertEqual(result["remaining_suspects"], ["bad"])
        self.assertEqual(result["original_signature"], "original")
        self.assertEqual(result["test_count"], len(self.calls))
        self.assertEqual(len(result["trials"]), len(self.calls))
        self.assertIn("caus", result["minimality_caveat"].lower())
        self.assertEqual(result["ranked_suspects"][0]["id"], "bad")
        self.assertNotIn("confidence", result["ranked_suspects"][0])

    def test_triggering_signature_cannot_be_replaced_by_a_different_repeated_crash(self):
        result=self.isolate(mods('a','b'),lambda included:crash('different'),
                            expected_signature='triggering',max_tests=20)
        self.assertEqual(result['status'],'inconclusive')
        self.assertEqual(result['original_signature'],'triggering')
        self.assertEqual(self.calls,[{'a','b'}])
        self.assertNotEqual(result['minimality'],'dependency_preserving_1_minimal')

    def test_interacting_pair_survives_complement_testing(self):
        result = self.isolate(mods("a", "b", "c", "d", "e", "f", "g", "h"),
                              lambda included: crash() if {"a", "h"} <= included else success(),
                              max_tests=200)
        self.assertEqual(result["status"], "isolated")
        self.assertEqual(result["remaining_suspects"], ["a", "h"])
        self.assertTrue(any({"a", "h"} < included < {"a", "b", "c", "d", "e", "f", "g", "h"}
                            for included in self.calls[2:]))

    def test_transitive_and_essential_dependencies_are_always_preserved(self):
        records = [
            {"id": "platform", "requires": ["base"], "essential": True},
            {"id": "base", "requires": [], "essential": False},
            {"id": "bad", "requires": ["library"], "essential": False},
            {"id": "library", "requires": ["base"], "essential": False},
            {"id": "extra", "requires": [], "essential": False},
        ]
        def trial(included):
            self.assertTrue({"platform", "base"} <= included)
            if "bad" in included:
                self.assertIn("library", included)
            if "library" in included:
                self.assertIn("base", included)
            return crash() if "bad" in included else success()
        result = self.isolate(records, trial, max_tests=100)
        self.assertEqual(result["status"], "isolated")
        self.assertEqual(result["remaining_suspects"], ["bad", "library"])
        self.assertEqual(result["protected_mods"], ["base", "platform"])
        for included in set(map(frozenset, self.calls)):
            self.assertEqual(self.calls.count(set(included)), 2)

    def test_success_warning_and_known_causes_stop_without_subset_tests(self):
        for diagnostic in [success(), crash(category="warnings", crashed=False),
                           crash(category="out_of_memory"), crash(category="dependency_failure"),
                           crash(category="harness_failure"), crash(category="timeout"),
                           crash(category="jvm_crash"), crash(category="incompatible_mods"),
                           crash(category="watchdog"), crash(category="startup_failure"),
                           crash(category="gameplay_crash"), crash(category="inconclusive")]:
            with self.subTest(category=diagnostic["category"]):
                self.calls = []
                result = self.isolate(mods("a", "b"), lambda included: diagnostic)
                self.assertEqual(result["status"], "stopped")
                self.assertEqual(self.calls, [{"a", "b"}])
                self.assertEqual(result["remaining_suspects"], [])
                self.assertEqual(result["ranked_suspects"], [])

    def test_unstable_original_never_starts_subset_tests(self):
        for later in [success(), crash("different")]:
            with self.subTest(later=later):
                self.calls = []
                result = self.isolate(mods("a", "b"),
                                      lambda included: crash() if len(self.calls) == 1 else later)
                self.assertEqual(result["status"], "inconclusive")
                self.assertEqual(self.calls, [{"a", "b"}] * 2)
                self.assertIn("unstable", result["reason"].lower())

    def test_subset_repeat_disagreement_stops_with_confirmed_group(self):
        result = self.isolate(mods("a", "b"),
                              lambda included: crash() if len(included) == 2 or len(self.calls) % 2 else success())
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(result["remaining_suspects"], ["a", "b"])
        self.assertEqual(len(self.calls), 4)
        self.assertIn("unstable", result["reason"].lower())

    def test_other_subset_failures_are_never_the_original_crash(self):
        for changed in [crash("different"), crash(category="dependency_failure"),
                        crash(category="timeout"), crash(category="harness_failure"),
                        crash(outcome="missing_dependency"), crash(outcome="missing_dependencies")]:
            with self.subTest(changed=changed):
                self.calls = []
                result = self.isolate(mods("a", "b"),
                                      lambda included: crash() if len(included) == 2 else changed,
                                      max_tests=30)
                self.assertEqual(result["status"], "inconclusive")
                self.assertEqual(result["remaining_suspects"], ["a", "b"])

    def test_essential_group_failure_is_reported_without_optional_blame(self):
        records = [{"id": "core", "requires": [], "essential": True}, *mods("a", "b")]
        result = self.isolate(records, lambda included: crash(), max_tests=100)
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(result["remaining_suspects"], ["core"])
        self.assertIn("essential", result["reason"].lower())

    def test_unknown_dependencies_cycles_duplicates_and_bad_records_do_not_launch(self):
        invalid = [
            [{"id": "a", "requires": ["absent"], "essential": False}],
            [{"id": "a", "requires": ["b"]}, {"id": "b", "requires": ["a"]}],
            mods("a", "a"),
            [{"id": "a", "requires": "b"}],
            [{"id": "a", "requires": [], "essential": "yes"}],
            [],
        ]
        for records in invalid:
            with self.subTest(records=records):
                result = self.isolate(records, lambda included: crash())
                self.assertEqual(result["status"], "invalid_input")
                self.assertEqual(result["test_count"], 0)
        self.assertEqual(self.calls, [])

    def test_test_budget_also_bounds_initial_confirmation(self):
        result = self.isolate(mods("a", "b"), lambda included: crash(), max_tests=1)
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(result["test_count"], 1)
        self.assertEqual(self.calls, [{"a", "b"}])
        self.assertIn("budget", result["reason"].lower())

    def test_zero_budget_does_not_launch(self):
        result = self.isolate(mods("a"), lambda included: crash(), max_tests=0)
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(self.calls, [])

    def test_wall_clock_budget_stops_after_trial_and_before_narrowing(self):
        clock = [0.0]
        def trial(included):
            clock[0] = 2.0
            return crash()
        with patch.object(self.module, "monotonic", side_effect=lambda: clock[0]):
            result = self.isolate(mods("a", "b"), trial, budget_seconds=1)
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(result["test_count"], 1)
        self.assertIn("time", result["reason"].lower())

    def test_cancellation_before_first_trial_or_during_confirmation(self):
        result = self.isolate(mods("a", "b"), lambda included: crash(), cancelled=lambda: True)
        self.assertEqual(result["status"], "inconclusive")
        self.assertEqual(self.calls, [])
        result = self.isolate(mods("a", "b"), lambda included: crash(),
                              cancelled=lambda: bool(self.calls))
        self.assertEqual(result["test_count"], 1)
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("cancel", result["reason"].lower())

    def test_requested_single_repeat_cannot_bypass_two_full_pack_confirmations(self):
        result = self.isolate(mods("a", "b"), lambda included: crash(), repeats=1, max_tests=2)
        self.assertEqual(self.calls, [{"a", "b"}] * 2)
        self.assertEqual(result["status"], "inconclusive")

    def test_callback_exception_and_malformed_result_are_bounded(self):
        def broken(included):
            raise RuntimeError("provider failed")
        for behavior in [broken, lambda included: None, lambda included: {}]:
            with self.subTest(behavior=behavior):
                self.calls = []
                result = self.isolate(mods("a", "b"), behavior)
                self.assertEqual(result["status"], "stopped")
                self.assertEqual(result["test_count"], 1)


if __name__ == "__main__":
    unittest.main()
