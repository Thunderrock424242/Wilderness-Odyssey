import copy
import unittest
from tools.modpack.regression import baseline_from, compare
from tools.modpack.common import PackError


class RegressionTests(unittest.TestCase):
    def report(self):
        return {'schema':2,'category':'success','dirty':False,'source_commit':'a'*40,'readiness':{'protocol':2,'verified':True},
            'content':{'inventory_sha256':'b'*64,'assets_sha256':'c'*64,'mods':{'example.jar':'d'*64},'assets':{}},
            'context':{'scenario':'startup-soak','seed':424242,'java_major':21,'java_build':'21.0.12+1','heap_mb':4096,
            'report_schema':2,'readiness_protocol':2,'os_cpu':{'os':'Windows','logical_cpus':16,'cpu_quota':'unmeasured'},
            'monitor':{'resource_seconds':5},'startup_timeout_seconds':600,
            'minecraft':'1.21.1','neoforge':'21.1.256','profiling':'basic','soak_seconds':120,'active_processors':4},
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

    def test_execution_semantics_must_match_and_content_updates_are_visible(self):
        good=self.report(); baseline=baseline_from(good,'a'*40)
        for field in ('readiness_protocol','java_build','os_cpu','monitor'):
            report=copy.deepcopy(good); report['context'][field]='changed'
            self.assertEqual('inconclusive',compare(report,baseline)['status'])
        old=copy.deepcopy(baseline); old['context'].pop('readiness_protocol')
        self.assertEqual('inconclusive',compare(good,old)['status'])
        updated=copy.deepcopy(good); updated['content']['mods']['example.jar']='e'*64
        result=compare(updated,baseline)
        self.assertEqual('within_thresholds',result['status'])
        self.assertEqual(['example.jar'],result['content_changes']['mods']['changed'])
        self.assertNotIn('avg_mspt',[i['metric'] for i in result['indicators']])

    def test_legacy_unverified_unknown_source_and_incomplete_save_cannot_promote(self):
        for mutate in (lambda r:r.pop('schema'),lambda r:r['context'].pop('readiness_protocol'),
                       lambda r:r.update(dirty=None),lambda r:r.update(source_commit=None),
                       lambda r:r['readiness'].update(verified=False),
                       lambda r:r['context'].update(scenario='save-flush')):
            report=self.report(); mutate(report)
            with self.assertRaises(PackError): baseline_from(report,'a'*40)


if __name__ == '__main__':
    unittest.main()
