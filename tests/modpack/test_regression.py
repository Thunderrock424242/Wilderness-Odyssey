import copy
import unittest
from tools.modpack.regression import baseline_from, compare
from tools.modpack.common import PackError


class RegressionTests(unittest.TestCase):
    def report(self):
        return {'category':'success','context':{'scenario':'startup-soak-v1','seed':424242,'java_major':21,'heap_mb':4096,
            'minecraft':'1.21.1','neoforge':'21.1.256','profiling':'basic','soak_seconds':120},
            'phases':{s:{'status':'passed'} for s in ('startup','soak','shutdown')},
            'metrics':{'startup_seconds':100,'avg_mspt':None,'worst_mspt':None},'private_logs':'do not copy'}

    def test_deliberate_baseline_is_summary_only_and_rejects_failed_run(self):
        report = self.report()
        baseline = baseline_from(report,'a'*40)
        self.assertNotIn('private_logs',str(baseline))
        self.assertEqual(baseline['commit'],'a'*40)
        report['category']='out_of_memory'
        with self.assertRaises(PackError):
            baseline_from(report,'a'*40)
        report=self.report()
        report['source_dirty']=True
        with self.assertRaises(PackError):
            baseline_from(report,'a'*40)

    def test_comparable_regression_is_indicator_not_confirmed_failure(self):
        report = self.report()
        baseline = baseline_from(report,'a'*40)
        report['metrics']['startup_seconds']=150
        result=compare(report,baseline)
        self.assertEqual(result['status'],'warning')
        self.assertFalse(result['confirmed_failure'])
        self.assertIn('startup_seconds',str(result))
        self.assertIn('MSPT',str(result))

    def test_incomparable_workload_or_missing_metrics_is_inconclusive(self):
        report=self.report()
        baseline=baseline_from(report,'a'*40)
        report['context']['seed']=1
        self.assertEqual(compare(report,baseline)['status'],'inconclusive')
        report=self.report()
        report['metrics']={}
        self.assertEqual(compare(report,baseline)['status'],'inconclusive')


if __name__ == '__main__':
    unittest.main()
