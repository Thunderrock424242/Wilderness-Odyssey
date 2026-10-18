import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import os
from unittest.mock import patch
from tools.modpack.__main__ import main
from tools.modpack.common import read_json
from test_management import make_jar


class SyncCliTests(unittest.TestCase):
    def test_offline_analysis_without_inventory_never_launches_or_fetches(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp); repo=base/'repo'; repo.mkdir(); evidence=base/'evidence'; evidence.mkdir()
            (evidence/'server.log').write_text('java.lang.OutOfMemoryError: Java heap space\n')
            args=['--root',str(repo),'analyze','--input',str(evidence),'--reports',str(base/'analysis')]
            with patch('subprocess.Popen',side_effect=AssertionError('No processes')),patch('tools.modpack.providers.fetch',side_effect=AssertionError('No downloads')),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(0,main(args))
            result=read_json(base/'analysis/report.json')
            self.assertEqual(2,result['schema']); self.assertEqual('out_of_memory',result['category'])
            self.assertFalse(result['crashed'])
            self.assertTrue((base/'analysis/report.md').exists())
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(2,main(args))
                self.assertEqual(2,main(['--root',str(repo),'analyze','--input',str(evidence),'--reports',str(evidence/'nested')]))

    def test_qa_scenario_reaches_runner_and_unknown_scenario_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp); repo=base/'repo'; (repo/'modpack').mkdir(parents=True)
            (repo/'modpack/lock.json').write_text('{}')
            args=['--root',str(repo),'qa','--destination',str(base/'run'),'--reports',str(base/'reports')]
            with patch('tools.modpack.runner.run_qa',return_value={'category':'success'}) as run, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(0,main(args+['--scenario','save-flush']))
                self.assertEqual('save-flush',run.call_args.args[2].scenario)
                self.assertEqual(0,main(args))
                self.assertEqual('startup-soak',run.call_args.args[2].scenario)
            with contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
                main(args+['--scenario','arbitrary-command'])

    def test_repeated_sync_keeps_new_custom_files_without_overwriting_existing(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp)
            repo,profile,reports=base/'repo',base/'profile',base/'reports'
            repo.mkdir()
            subprocess.run(['git','init','-q',str(repo)],check=True)
            (repo/'config').mkdir()
            (repo/'config/existing.toml').write_text('custom=true\n')
            subprocess.run(['git','-C',str(repo),'add','.'],check=True)
            make_jar(profile/'mods/example.jar')
            (profile/'minecraftinstance.json').write_text(json.dumps({'gameVersion':'1.21.1',
                'baseModLoader':{'name':'neoforge-21.1.256'},'installedAddons':[]}))
            (profile/'config').mkdir()
            (profile/'config/existing.toml').write_text('custom=false\n')
            (profile/'config/new.toml').write_text('enabled=true\n')
            (profile/'config/private.toml').write_text('password="do_not_copy"\n')
            (profile/'config/minified.json').write_text('{"password":"do_not_copy"}')
            command=['--root',str(repo),'sync','--profile',str(profile),'--reports',str(reports),'--apply','--copy-new-configs']
            before={p.relative_to(profile).as_posix():p.read_bytes() for p in profile.rglob('*') if p.is_file()}
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(command),0)
                first=(repo/'index.toml').read_bytes()
                self.assertEqual(main(command),0)
            self.assertEqual(first,(repo/'index.toml').read_bytes())
            self.assertIn('config/new.toml',read_json(repo/'modpack/assets.json'))
            self.assertEqual((repo/'config/existing.toml').read_text(),'custom=true\n')
            self.assertFalse((repo/'config/private.toml').exists())
            self.assertFalse((repo/'config/minified.json').exists())
            after={p.relative_to(profile).as_posix():p.read_bytes() for p in profile.rglob('*') if p.is_file()}
            self.assertEqual(before,after)

    def test_linked_report_cannot_modify_live_profile_even_in_dry_run(self):
        for report_name in ('sync.json','sync.md'):
            with self.subTest(report_name=report_name), tempfile.TemporaryDirectory() as tmp:
                base=Path(tmp)
                repo,profile,reports=base/'repo',base/'profile',base/'reports'
                repo.mkdir()
                reports.mkdir()
                subprocess.run(['git','init','-q',str(repo)],check=True)
                make_jar(profile/'mods/example.jar')
                meta=profile/'minecraftinstance.json'
                meta.write_text(json.dumps({'gameVersion':'1.21.1','baseModLoader':{'name':'neoforge-21.1.256'}}))
                before=meta.read_bytes()
                os.link(meta,reports/report_name)
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(main(['--root',str(repo),'sync','--profile',str(profile),'--reports',str(reports)]),0)
                self.assertEqual(before,meta.read_bytes())


if __name__ == '__main__':
    unittest.main()
