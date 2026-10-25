import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

GC = ('[0.001s][info][gc] Using G1\n'
      '[1.000s][info][gc,start] GC(1) Pause Young (Normal) (G1 Evacuation Pause)\n'
      '[1.020s][info][gc] GC(1) Pause Young (Normal) (G1 Evacuation Pause) 100M->40M(512M) 20.000ms\n'
      '[61.000s][info][gc] GC(2) Pause Full (System.gc()) 200M->80M(512M) 30.000ms\n')
THREAD = ('"Server thread" #1 prio=5\n java.lang.Thread.State: WAITING\n'
          ' at java.util.concurrent.CompletableFuture.join(CompletableFuture.java:123)\n'
          ' at net.minecraft.world.level.chunk.storage.ChunkStorage.flushWorker(ChunkStorage.java:123)\n\n')


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('tools.modpack.evidence'),'evidence analyzer missing')
        from tools.modpack import evidence
        self.e=evidence

    def test_gc_rotation_deduplicates_complete_events(self):
        result=self.e.analyze_evidence({'gc_logs':[{'source':'qa-gc.log','text':GC},{'source':'qa-gc.log.0','text':GC}]})
        self.assertEqual(2,result['gc']['count'])
        self.assertEqual(50,result['gc']['pause_total_ms'])

    def test_native_threads_are_separate_from_jvm_threads_when_reanalyzing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'resources.json').write_text(json.dumps([{'elapsed_seconds':0,'threads':1,'cpu_percent':10}]))
            (root/'samples.json').write_text(json.dumps([
                {'elapsed_seconds':0,'threads':1,'cpu_percent':10},  # Earlier schema-2 merged OS row.
                {'elapsed_seconds':1,'threads':2}]))
            result=self.e.analyze_evidence(self.e.read_evidence(root))
            self.assertEqual(2,result['memory']['metrics']['threads']['first'])
            self.assertEqual(1,result['resources'][0]['threads'])
            self.assertEqual(10,result['memory']['metrics']['cpu_percent']['first'])

    def test_young_gc_is_not_retained_live_set(self):
        result=self.e.parse_gc(GC,'gc.log')
        self.assertEqual('young',result['events'][0]['collection'])
        self.assertEqual('full',result['events'][1]['collection'])
        self.assertFalse(result['events'][0]['retained_live_set'])
        self.assertFalse(any(f['code']=='confirmed_memory_leak' for f in self.e.analyze_evidence({'gc_logs':[{'text':GC}]})['findings']))

    def test_truncated_gc_remains_partial(self):
        result=self.e.parse_gc('[0.1s][info][gc] Using G1\n[1.0s][info][gc,start] GC(1) Pause Young','gc.log')
        self.assertEqual([],result['events'])
        self.assertTrue(result['limitations'])

    def test_repeated_flush_wait_is_not_mod_blame(self):
        findings=self.e.analyze_thread_dumps([{'source':'a','text':THREAD,'elapsed_seconds':10},
                                             {'source':'b','text':THREAD,'elapsed_seconds':20}])
        self.assertTrue(any(f['code']=='repeated_chunk_flush_wait' for f in findings))
        self.assertNotIn('confirmed_culprit',str(findings))
        self.assertTrue(all(f['limitations'] for f in findings))

    def test_data_errors_group_without_fatal_crash(self):
        logs='[Server thread/ERROR] Couldn\'t load tag test:missing as it is missing following references\n'*3
        findings=self.e.group_log_findings(logs)
        self.assertEqual(1,len(findings))
        self.assertEqual(3,findings[0]['count'])
        result=self.e.analyze_evidence({'logs':logs,'report':{'schema':2,'category':'success','phases':{}}})
        self.assertEqual('success',result['category'])

    def test_oom_observation_does_not_infer_exit_or_leak(self):
        result=self.e.analyze_evidence({'logs':'java.lang.OutOfMemoryError: Java heap space'})
        self.assertEqual('out_of_memory',result['category'])
        self.assertNotIn('confirmed_memory_leak',str(result))
        self.assertIsNone(result.get('exit_code'))
        self.assertFalse(result['crashed'])

    def test_reader_is_bounded_and_ignores_private_files_and_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'server.log').write_text('hello\n'+('x'*20000)+'\nlast\n')
            (root/'accounts.json').write_text('secret-account')
            (root/'recording.jfr').write_bytes(b'private binary')
            result=self.e.read_evidence(root)
            self.assertNotIn('secret-account',str(result))
            self.assertNotIn('private binary',str(result))
            self.assertTrue(result['limitations'])

    def test_reader_future_schema_is_explicitly_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'report.json'
            path.write_text(json.dumps({'schema':999,'category':'success'}))
            result=self.e.read_evidence(path)
            self.assertIsNone(result.get('report'))
            self.assertTrue(any('schema' in s.lower() for s in result['limitations']))

    def test_reader_notes_concurrently_changing_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'server.log'; path.write_text('start')
            original=self.e._read_file
            def changed(path,limit):
                result=original(path,limit)
                result['partial']=True
                return result
            with patch.object(self.e,'_read_file',side_effect=changed):
                result=self.e.read_evidence(path)
            self.assertTrue(result['limitations'])

    def test_healthy_sawtooth_and_missing_gc_do_not_create_leak(self):
        empty=self.e.analyze_evidence({})
        self.assertEqual('unmeasured',empty['memory']['status'])
        logs=GC.replace('200M->80M','200M->40M')
        healthy=self.e.analyze_evidence({'gc_logs':[{'text':logs}]})
        self.assertFalse(healthy['memory']['suspected_growth'])
        self.assertNotIn('confirmed_memory_leak',str(healthy))

    def test_gc_scaled_overflow_is_rejected_without_crashing_analysis(self):
        number='1'+'0'*308
        text='Using G1\n[1.0s][info][gc] GC(1) Pause Full (System.gc()) '+number+'G->40M(512M) 1.0ms'
        self.assertEqual([],self.e.parse_gc(text)['events'])

    def test_capture_does_not_exceed_byte_budget_including_omission_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'server.log';p.write_bytes(b'x'*5000)
            self.assertLessEqual(self.e._read_file(p,1024)['bytes'],1024)

    def test_explicit_named_log_file_is_analyzed(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'my-client-output.txt';p.write_text('java.lang.OutOfMemoryError: Java heap space')
            self.assertIn('OutOfMemoryError',self.e.read_evidence(p)['logs'])

    def test_boolean_schema_and_malformed_samples_are_partial_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'report.json';p.write_text('{"schema":true,"category":"success"}')
            self.assertIsNone(self.e.read_evidence(p)['report'])
        result=self.e.analyze_evidence({'report':{'schema':2,'samples':True}})
        self.assertTrue(result['analysis']['limitations'])

    def test_oversized_numeric_samples_are_not_valid_measurements(self):
        result=self.e.analyze_evidence({'samples':[{'elapsed_seconds':0,'heap_used_bytes':10**400}]})
        self.assertIsNone(result['memory']['metrics']['heap_used_bytes'])
