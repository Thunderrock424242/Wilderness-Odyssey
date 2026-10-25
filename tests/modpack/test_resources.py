import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class ResourceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('tools.modpack.resources'),'resource sampler missing')
        from tools.modpack import resources
        self.module=resources
        self.process=SimpleNamespace(pid=123,poll=lambda:None)
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)

    def raw(self,identity='A',cpu=1):
        return {'identity':identity,'cpu_time_seconds':cpu,'rss_bytes':2048,
                'read_io_bytes':2**40,'write_io_bytes':2**41,'threads':3,'unavailable':{}}

    def test_cpu_delta_is_one_core_percent_and_reset_is_unavailable(self):
        sampler=self.module.ResourceSampler(self.process,Path(self.tmp.name))
        with patch.object(self.module,'_read_process',side_effect=[self.raw(cpu=1),self.raw(cpu=3),self.raw(cpu=0)]):
            self.assertIsNone(sampler.sample(0)['cpu_percent'])
            self.assertEqual(200.0,sampler.sample(1)['cpu_percent'])
            self.assertIsNone(sampler.sample(2)['cpu_percent'])

    def test_zero_interval_does_not_fabricate_zero_cpu(self):
        sampler=self.module.ResourceSampler(self.process,Path(self.tmp.name))
        with patch.object(self.module,'_read_process',return_value=self.raw()):
            sampler.sample(1)
            self.assertIsNone(sampler.sample(1)['cpu_percent'])

    def test_reused_or_exited_process_stops_reading(self):
        sampler=self.module.ResourceSampler(self.process,Path(self.tmp.name))
        with patch.object(self.module,'_read_process',side_effect=[self.raw(),self.raw('B')]) as reader:
            sampler.sample(0)
            changed=sampler.sample(1)
            self.assertIsNone(changed['rss_bytes'])
            self.assertEqual('process_identity_changed',changed['unavailable']['process'])
            sampler.sample(2)
            self.assertEqual(2,reader.call_count)
        self.process.poll=lambda:0
        with patch.object(self.module,'_read_process') as reader:
            self.assertEqual('process_exited',sampler.sample(3)['unavailable']['process'])
            reader.assert_not_called()

    def test_denied_io_preserves_other_measurements_and_large_counters(self):
        sampler=self.module.ResourceSampler(self.process,Path(self.tmp.name))
        raw=self.raw(); raw['read_io_bytes']=None; raw['unavailable']={'read_io_bytes':'permission_denied'}
        with patch.object(self.module,'_read_process',return_value=raw):
            row=sampler.sample(0)
        self.assertEqual(2048,row['rss_bytes'])
        self.assertEqual(2**41,row['write_io_bytes'])
        self.assertEqual('permission_denied',row['unavailable']['read_io_bytes'])
        self.assertGreater(row['free_disk_bytes'],0)

    def test_linux_stat_handles_parentheses_and_spaces_in_process_name(self):
        fields=['S']+['0']*21
        fields[11]='100'; fields[12]='50'; fields[17]='9'; fields[19]='1234'; fields[21]='20'
        result=self.module._linux_stat('123 (a name (with) brackets) '+' '.join(fields),100,4096)
        self.assertEqual('1234',result['identity'])
        self.assertEqual(1.5,result['cpu_time_seconds'])
        self.assertEqual(81920,result['rss_bytes'])
        self.assertEqual(9,result['threads'])

    def test_real_owned_child_has_values_or_explicit_availability(self):
        process=subprocess.Popen([sys.executable,'-c','import time; time.sleep(10)'],
            stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            sampler=self.module.ResourceSampler(process,Path(self.tmp.name))
            row=sampler.sample(0)
            for field in ('cpu_time_seconds','rss_bytes','read_io_bytes','write_io_bytes','threads'):
                self.assertTrue(row[field] is not None or field in row['unavailable'] or 'process' in row['unavailable'],field)
            self.assertEqual('one_logical_cpu',sampler.context()['cpu_percent_basis'])
        finally:
            process.kill(); process.wait(timeout=5)
