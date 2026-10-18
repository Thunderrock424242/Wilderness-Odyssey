import hashlib
import html
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.modpack.common import PackError


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name); self.reports=self.base/'reports'; self.reports.mkdir()
        (self.reports/'report.md').write_text('Outcome: **timeout**\n')
        (self.reports/'server.log').write_text('token=private-provider-key\nAuthorization: Bearer secretbearer\n'
            'https://user:secret@host.invalid/path?token=urlsecret\nC:\\Users\\mason\\private\\file\n/home/mason/private/file\n'
            'password='+('x'*70000)+'\n')
        for name in ('recording.jfr','heap.hprof','accounts.json','world.zip','evil[script].log'):
            (self.reports/name).write_bytes(b'private-binary')

    def test_only_sanitized_text_and_manifest_are_exported_with_exact_budget(self):
        from tools.modpack.export import export_reports
        for cap in (1024,4096,100000):
            out=self.base/str(cap); result=export_reports(self.reports,out,max_bytes=cap)
            files=[p for p in out.rglob('*') if p.is_file()]
            self.assertEqual(result['bytes'],sum(p.stat().st_size for p in files))
            self.assertLessEqual(result['bytes'],cap)
            text='\n'.join(p.read_text() for p in files)
            for value in ('private-provider-key','secretbearer','urlsecret','user:secret','mason','private-binary'):
                self.assertNotIn(value,text)
            self.assertIn('timeout',text)
            manifest=json.loads((out/'manifest.json').read_text())
            self.assertTrue(manifest['omitted_count'])
            for entry in manifest['files']:
                self.assertEqual(entry['sha256'],hashlib.sha256((out/entry['file']).read_bytes()).hexdigest())
            self.assertNotIn('sha256',manifest)

    def test_overlapping_existing_and_linked_outputs_are_refused(self):
        from tools.modpack.export import export_reports
        for target in (self.reports,self.reports/'nested',self.base):
            with self.assertRaises((PackError,OSError)): export_reports(self.reports,target)
        existing=self.base/'existing'; existing.mkdir()
        with self.assertRaises(PackError): export_reports(self.reports,existing)
        alias=self.base/'alias'
        try: alias.symlink_to(self.reports,target_is_directory=True)
        except OSError: return
        with self.assertRaises(PackError): export_reports(alias,self.base/'out')

    def test_read_failure_is_recorded_as_missing_evidence(self):
        from tools.modpack import export
        original=export._read_file
        def denied(path,limit):
            if path.name=='server.log': raise PermissionError()
            return original(path,limit)
        with patch.object(export,'_read_file',side_effect=denied):
            result=export.export_reports(self.reports,self.base/'out')
        self.assertGreater(result['omitted'],0)

    def test_shared_renderer_preserves_outcome_and_escapes_finding(self):
        from tools.modpack.diagnostics import render_report
        text=render_report({'category':'timeout','findings':[{'code':'repeated_wait','evidence':['<script>evil</script>'],
            'confidence':'medium','limitations':['No cause established'],'next_step':'Inspect workers'}],
            'gc':{'count':2,'pause_max_ms':240},'readiness':{'verified':False}})
        self.assertIn('**timeout**',text)
        self.assertIn('repeated_wait',html.unescape(text))
        self.assertNotIn('<script>',text)
        self.assertIn('240',text)

    def test_write_failure_is_not_reported_as_success(self):
        from tools.modpack.export import export_reports
        original=Path.open
        def denied(path,*args,**kwargs):
            if path.name=='manifest.json': raise PermissionError()
            return original(path,*args,**kwargs)
        with patch.object(Path,'open',denied),self.assertRaises(PermissionError):
            export_reports(self.reports,self.base/'out')

    def test_rendered_credentials_and_personal_paths_are_redacted(self):
        from tools.modpack.diagnostics import render_report
        from tools.modpack.export import export_reports
        text=render_report({'category':'timeout','evidence':[
            'API_KEY=synthetic-sensitive-value','"password": "synthetic-password"',
            r'C:\Users\private-person\instance\mods',
            '/home/private-person/instance/mods',
            'https://user:synthetic-userinfo@host.invalid/path?key=synthetic-query']})
        (self.reports/'report.md').write_text(text)
        export_reports(self.reports,self.base/'rendered')
        shared=(self.base/'rendered/report.md').read_text()
        for secret in ('synthetic-sensitive-value','synthetic-password','private-person','synthetic-userinfo','synthetic-query'):
            self.assertNotIn(secret,html.unescape(shared))
        self.assertIn('**timeout**',shared)

    def test_memory_finding_stays_visible_amid_configuration_noise(self):
        from tools.modpack.diagnostics import render_report
        noise=[{'code':'registry_warning_'+str(i),'category':'configuration','severity':'warning'} for i in range(40)]
        pressure={'code':'gc_pause_pressure','category':'memory','severity':'warning','evidence':['Maximum pause 2618 ms']}
        text=html.unescape(render_report({'category':'success','findings':noise+[pressure]}))
        self.assertIn('gc_pause_pressure',text)
        self.assertIn('16 of 41',text)
        self.assertLess(text.index('gc_pause_pressure'),text.index('registry_warning'))

