"""Exercise the real runner with disposable Python processes standing in for Java."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools.modpack.common import PackError
from tools.modpack.pack import generate


MODULE_PATH = Path(__file__).resolve().parents[2] / 'tools/modpack/runner.py'
READY = '[12:00:00] [Server thread/INFO] [minecraft/DedicatedServer]: Done (1.234s)! For help, type "help"'
CRASH = ('[12:00:01] [Server thread/ERROR]: Encountered an unexpected exception\n'
         'java.lang.RuntimeException: fixture crash\n'
         '    at example.Encounter.build(Encounter.java:41)\n')


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE_PATH.is_file(), 'The bounded QA runner is not implemented')
        from tools.modpack import runner
        self.runner = runner
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / 'repository'
        self.root.mkdir()
        self.local = self.base / 'private-mods'
        self.local.mkdir()
        jar = self.local / 'example.jar'
        jar.write_bytes(b'fixture pinned mod bytes')
        self.lock = {'schema': 1, 'name': 'Fixture', 'version': '1.0', 'minecraft': '1.21.1',
                     'neoforge': '21.1.256', 'java': 21, 'migration': {'status': 'imported'},
                     'mods': [{'id': 'example', 'filename': 'example.jar', 'side': 'both',
                               'sha256': hashlib.sha256(jar.read_bytes()).hexdigest(), 'size': jar.stat().st_size,
                               'source': {'kind': 'manual', 'verified': False}, 'essential': False,
                               'provides': [{'id': 'example', 'version': '1.0', 'embedded': False}],
                               'requires': [], 'conflicts': [], 'issues': []}]}
        generate(self.root, self.lock, [])
        installer = b'fixture pinned installer bytes'
        self.installer_hash = hashlib.sha256(installer).hexdigest()
        (self.root / 'qa').mkdir()
        self.pin = {'neoforge': {'21.1.256': {'sha256': self.installer_hash,
                    'url': 'https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.256/neoforge-21.1.256-installer.jar'}}}
        (self.root / 'qa/tool-lock.json').write_text(json.dumps(self.pin))
        self.cache = self.base / 'cache'
        self.cache.mkdir()
        (self.cache / (self.installer_hash + '-installer.jar')).write_bytes(installer)
        self.args = argparse.Namespace(destination=self.base / 'server', local_mods=self.local,
            cache=self.cache, offline=True, accept_eula=True, java=sys.executable,
            memory_mb=512, startup_seconds=1, soak_seconds=0, profiling='off', isolate=False,
            max_tests=3, reports=self.base / 'reports')
        self.commands = []
        self.processes = []
        self.server_mode = 'success'
        self.installer_code = 0
        self.installer_hangs = False
        self.version = '21.0.8'
        self.real_popen = subprocess.Popen
        self.patcher = patch.object(runner.subprocess, 'Popen', side_effect=self.fake_java)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.addCleanup(self.reap)

    def reap(self):
        for process in self.processes:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)

    def fake_java(self, command, **options):
        if Path(command[0]).name.lower() in ('git', 'git.exe'):
            return self.real_popen(command, **options)
        self.commands.append((list(command), dict(options)))
        if '-version' in command:
            script = 'print(\'openjdk version "' + self.version + '"\')'
        elif '--installServer' in command:
            script = ('from pathlib import Path\n'
                      'p=Path("libraries/net/neoforged/neoforge/21.1.256")\n'
                      'p.mkdir(parents=True,exist_ok=True)\n'
                      '(p/"win_args.txt").write_text("fixture")\n'
                      '(p/"unix_args.txt").write_text("fixture")\n'
                      'print("Installer successfully installed")\n'
                      'raise SystemExit(' + str(self.installer_code) + ')\n')
            if self.installer_hangs:
                script = 'import time\nprint("Installer processing libraries",flush=True)\ntime.sleep(60)'
        elif Path(command[0]).name.lower() in ('jcmd', 'jcmd.exe'):
            if 'GC.heap_info' in command:
                script = 'print("garbage-first heap total 65536K, used 16384K [0x1234, 0x4321)")'
            elif 'Thread.print' in command:
                script = 'print(\'"Server thread" #1 prio=5\\n"Reference Handler" #9 daemon prio=10\')'
            else:
                script = 'print("Total: reserved=128000KB, committed=64000KB")'
        elif command and Path(command[0]).name.lower() == 'taskkill.exe':
            return self.real_popen(command, **options)
        elif self.server_mode == 'timeout':
            script = 'import time\nprint("Reloading ResourceManager: vanilla",flush=True)\ntime.sleep(60)'
        elif self.server_mode == 'no_ready':
            script = 'print("Installer successfully installed; Done loading assets")'
        elif self.server_mode == 'crash':
            script = 'print(' + repr(READY + '\n' + CRASH) + ',flush=True)\nraise SystemExit(1)'
        elif self.server_mode == 'shutdown_crash':
            script = ('import sys\nprint(' + repr(READY) + ',flush=True)\nsys.stdin.readline()\n'
                      'print(' + repr(CRASH) + ',flush=True)\nraise SystemExit(1)')
        elif self.server_mode == 'flood':
            script = 'import sys\nprint("x"*20000)\nprint(' + repr(READY) + ',flush=True)\nsys.stdin.readline()'
        elif self.server_mode == 'child':
            script = ('import sys, subprocess\n'
                      'child=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"],stdin=subprocess.DEVNULL)\n'
                      'print("CHILD_PID="+str(child.pid),flush=True)\n'
                      'print(' + repr(READY) + ',flush=True)\nsys.stdin.readline()')
        else:
            script = 'import sys\nprint(' + repr(READY) + ',flush=True)\nsys.stdin.readline()\nprint("Stopping server",flush=True)'
        process = self.real_popen([sys.executable, '-u', '-c', script], **options)
        self.processes.append(process)
        return process

    def run_qa(self):
        with patch.object(self.runner, '_SHUTDOWN_SECONDS', 0.15):
            return self.runner.run_qa(self.root, self.lock, self.args)

    def assert_reports(self, result):
        reports = Path(result['artifacts']['report_json']).parent
        if not reports.is_relative_to(self.base):
            self.addCleanup(shutil.rmtree, reports, True)
        self.assertTrue((reports / 'report.md').is_file())
        saved = json.loads((reports / 'report.json').read_text())
        self.assertEqual(result['category'], saved['category'])
        self.assertIn('not measured', (reports / 'report.md').read_text())

    def test_ready_server_uses_pinned_loopback_config_and_gracefully_stops(self):
        with patch.dict(os.environ, {'CURSEFORGE_API_KEY': 'private-provider-key',
                                     'JAVA_TOOL_OPTIONS': '-Dsecret=private-option'}):
            result = self.run_qa()
        self.assertEqual('success', result['category'])
        self.assertEqual('succeeded', result['phases']['installer']['status'])
        self.assertEqual('succeeded', result['phases']['startup']['status'])
        self.assertEqual('succeeded', result['phases']['soak']['status'])
        self.assertEqual('succeeded', result['phases']['shutdown']['status'])
        config = (self.args.destination / 'server.properties').read_text()
        for setting in ('server-ip=127.0.0.1', 'online-mode=false', 'level-seed=424242',
                        'view-distance=6', 'max-players=1', 'level-name=qa-world', 'enable-rcon=false'):
            self.assertIn(setting + '\n', config)
        self.assertEqual('eula=true\n', (self.args.destination / 'eula.txt').read_text())
        launch = next(command for command, _ in self.commands if 'nogui' in command)
        self.assertIn('-Xmx512M', launch)
        self.assertTrue(any(argument.startswith('@libraries/net/neoforged/neoforge/21.1.256/') for argument in launch))
        for command, options in self.commands:
            self.assertFalse(options.get('shell', False))
            self.assertNotIn('CURSEFORGE_API_KEY', options['env'])
            self.assertNotIn('JAVA_TOOL_OPTIONS', options['env'])
        self.assertEqual('unmeasured', result['memory']['status'])
        self.assertIsNone(result['metrics']['avg_mspt'])
        self.assertIsNone(result['metrics']['worst_mspt'])
        self.assertEqual({'scenario': 'startup-soak-v1', 'seed': 424242, 'minecraft': '1.21.1',
                          'neoforge': '21.1.256', 'java_major': 21, 'heap_mb': 512, 'profiling': 'off',
                          'startup_timeout_seconds': 1, 'soak_seconds': 0}, result['context'])
        self.assertIsNone(result['source_commit'])
        self.assertIsNone(result['dirty'])
        self.assertFalse((self.args.destination / 'mods').exists())
        self.assertEqual(b'fixture pinned mod bytes', (self.local / 'example.jar').read_bytes())
        self.assert_reports(result)

    def test_installer_success_and_asset_loading_never_count_as_readiness(self):
        self.server_mode = 'no_ready'
        result = self.run_qa()
        self.assertEqual('startup_failure', result['category'])
        self.assertEqual('failed', result['phases']['startup']['status'])
        self.assertEqual('not_run', result['phases']['soak']['status'])
        self.assert_reports(result)

    def test_startup_timeout_kills_server_and_records_shutdown_separately(self):
        self.server_mode = 'timeout'
        result = self.run_qa()
        self.assertEqual('timeout', result['category'])
        self.assertEqual('timed_out', result['phases']['startup']['status'])
        self.assertEqual('forced', result['phases']['shutdown']['status'])
        self.assertTrue(all(process.poll() is not None for process in self.processes))
        self.assert_reports(result)

    def test_interruption_cleans_active_process_and_still_writes_reports(self):
        self.server_mode = 'timeout'
        original_sleep = self.runner.time.sleep
        def cancel_after_launch(seconds):
            if any('nogui' in command for command, _ in self.commands):
                raise KeyboardInterrupt()
            original_sleep(seconds)
        with patch.object(self.runner.time, 'sleep', side_effect=cancel_after_launch):
            result = self.run_qa()
        self.assertEqual('cancelled', result['category'])
        self.assertTrue(all(process.poll() is not None for process in self.processes))
        self.assert_reports(result)

    def test_invalid_limits_and_missing_eula_report_without_launching_java(self):
        for index, (field, value) in enumerate([('memory_mb', 511), ('memory_mb', 16385), ('startup_seconds', 1801),
                             ('startup_seconds', 0), ('soak_seconds', 3601), ('soak_seconds', -1),
                             ('max_tests', 31), ('max_tests', 0), ('accept_eula', False)]):
            with self.subTest(field=field, value=value):
                self.args.reports = self.base / f'limit-report-{index}'
                old = getattr(self.args, field)
                setattr(self.args, field, value)
                result = self.run_qa()
                self.assertEqual('validation_failure', result['category'])
                self.assertFalse(self.commands)
                self.assertFalse(self.args.destination.exists())
                self.assert_reports(result)
                setattr(self.args, field, old)

    def test_java_major_version_must_be_exactly_twenty_one(self):
        self.version = '22.0.1'
        result = self.run_qa()
        self.assertEqual('setup_failure', result['category'])
        self.assertFalse(any('--installServer' in command for command, _ in self.commands))
        self.assertFalse(self.args.destination.exists())
        self.assert_reports(result)

    def test_missing_and_corrupted_installer_pins_never_launch_installer(self):
        for mode in ('missing', 'corrupt'):
            with self.subTest(mode=mode):
                self.args.reports = self.base / ('pin-report-' + mode)
                if mode == 'missing':
                    (self.root / 'qa/tool-lock.json').write_text('{"neoforge": {}}')
                else:
                    (self.root / 'qa/tool-lock.json').write_text(json.dumps(self.pin))
                    (self.cache / (self.installer_hash + '-installer.jar')).write_bytes(b'tampered')
                result = self.run_qa()
                self.assertEqual('setup_failure', result['category'])
                self.assertFalse(any('--installServer' in command for command, _ in self.commands))
                self.assert_reports(result)

    def test_installer_nonzero_exit_does_not_launch_minecraft(self):
        self.installer_code = 5
        result = self.run_qa()
        self.assertEqual('installer_failure', result['category'])
        self.assertEqual('failed', result['phases']['installer']['status'])
        self.assertEqual('not_run', result['phases']['startup']['status'])
        self.assertFalse(any('nogui' in command for command, _ in self.commands))
        self.assert_reports(result)

    def test_install_validation_failure_still_has_phase_report(self):
        (self.root / 'pack.toml').write_text('drift')
        result = self.run_qa()
        self.assertEqual('validation_failure', result['category'])
        self.assertEqual('not_run', result['phases']['installer']['status'])
        self.assertFalse(self.args.destination.exists())
        self.assert_reports(result)

    def test_basic_profiling_passes_bounded_gc_flags_without_forced_collection(self):
        self.args.profiling = 'basic'
        result = self.run_qa()
        launch = next(command for command, _ in self.commands if 'nogui' in command)
        self.assertTrue(any(argument.startswith('-Xlog:gc') and 'filecount=3' in argument for argument in launch))
        self.assertFalse(any('GC.run' in argument or 'HeapDump' in argument for command, _ in self.commands for argument in command))
        self.assertFalse(result['memory']['suspected_growth'])
        self.assertIn('Post-GC heap is unmeasured', ' '.join(result['memory']['limitations']))

    def test_capped_output_is_drained_and_late_readiness_still_works(self):
        self.server_mode = 'flood'
        with patch.object(self.runner, '_MAX_LOG_BYTES', 1024):
            result = self.run_qa()
        self.assertEqual('success', result['category'])
        self.assertLessEqual(Path(result['artifacts']['server_log']).stat().st_size, 1024)
        self.assertTrue(result['log_truncated'])

    def test_trace_is_classified_by_diagnostics_and_unknown_graph_stops_isolation(self):
        self.server_mode = 'crash'
        self.args.isolate = True
        self.lock['mods'][0]['issues'] = ['Unresolved metadata']
        result = self.run_qa()
        self.assertEqual('uncertain_crash', result['category'])
        self.assertTrue(result['signature'])
        self.assertEqual('inconclusive', result['isolation']['status'])
        self.assertEqual(0, result['isolation']['test_count'])
        self.assertEqual(1, sum('nogui' in command for command, _ in self.commands))
        self.assert_reports(result)

    def test_isolation_confirmations_get_fresh_installs_and_cleanup_mod_copies(self):
        self.server_mode = 'crash'
        self.args.isolate = True
        result = self.run_qa()
        launches = [options['cwd'] for command, options in self.commands if 'nogui' in command]
        self.assertEqual(3, len(launches))
        self.assertEqual(3, len(set(map(str, launches))))
        self.assertEqual(2, result['isolation']['test_count'])
        for directory in launches:
            self.assertFalse((Path(directory) / 'mods').exists())
            self.assertFalse((Path(directory) / 'qa-world').exists())
        self.assert_reports(result)

    def test_changed_signature_after_trigger_does_not_narrow_another_crash(self):
        self.server_mode='crash'
        self.args.isolate=True
        self.args.max_tests=10
        original=self.runner._run_trial
        calls=[]
        def changed(*args,**kwargs):
            text=CRASH if not calls else CRASH.replace('example.Encounter','different.Trigger')
            calls.append(1)
            with patch(__name__+'.CRASH',text):
                return original(*args,**kwargs)
        with patch.object(self.runner,'_run_trial',side_effect=changed):
            result=self.run_qa()
        self.assertEqual(result['signature'],result['isolation']['original_signature'])
        self.assertEqual(result['isolation']['status'],'inconclusive')
        self.assertEqual(len(calls),2)

    def test_runtime_temporary_files_are_private_cleaned_and_fresh_for_each_trial(self):
        self.server_mode='crash'
        self.args.isolate=True
        self.args.max_tests=3
        temporary_paths=[]
        original_popen=self.fake_java
        def record(command,**options):
            if 'nogui' in command:
                temporary=Path(options['env']['TEMP'])
                temporary_paths.append(temporary)
                self.assertFalse(temporary.is_relative_to(self.args.reports))
                (temporary/'mod-native-cache.bin').write_bytes(b'private cached bytes')
            return original_popen(command,**options)
        with patch.object(self.runner.subprocess,'Popen',side_effect=record):
            result=self.run_qa()
        self.assertGreaterEqual(len(temporary_paths),2,result)
        self.assertEqual(len(temporary_paths),len(set(temporary_paths)))
        self.assertTrue(all(not p.exists() for p in temporary_paths))

    def test_cache_and_report_tree_must_be_disjoint(self):
        self.args.cache=self.args.reports/'cache'
        result=self.run_qa()
        self.assertEqual(result['category'],'validation_failure')
        self.assertFalse(self.commands)

    def test_reports_inside_source_repository_use_external_failure_report(self):
        self.args.reports = self.root / 'unsafe-reports'
        result = self.run_qa()
        fallback = Path(result['artifacts']['report_json']).parent
        self.assertEqual('validation_failure', result['category'])
        self.assertFalse(self.args.reports.exists())
        self.assertFalse(fallback.is_relative_to(self.root))
        self.assert_reports(result)

    def test_isolation_graph_keeps_embedded_and_provider_dependencies_with_owner(self):
        original = self.lock['mods'][0]
        original['requires'] = [{'id': 'nested', 'version': '[2,)', 'side': 'both', 'owner': 'example'}]
        original['source'] = {'kind': 'curseforge', 'project_id': 1, 'required_projects': [2]}
        other = {'id': 'library-file', 'side': 'both', 'essential': True, 'requires': [], 'conflicts': [], 'issues': [],
                 'provides': [{'id': 'library', 'version': '2.0', 'embedded': False},
                              {'id': 'nested', 'version': '2.0', 'embedded': True}],
                 'source': {'kind': 'curseforge', 'project_id': 2, 'required_projects': []}}
        self.lock['mods'].append(other)
        graph = self.runner._isolation_graph(self.lock)
        self.assertEqual(['library-file'], next(row['requires'] for row in graph if row['id'] == 'example'))
        self.assertTrue(next(row['essential'] for row in graph if row['id'] == 'library-file'))
        original['requires'][0]['version'] = '^2'
        with self.assertRaises(PackError):
            self.runner._isolation_graph(self.lock)

    def test_isolation_graph_uses_the_same_verified_fml_matrix_as_validation(self):
        self.lock['mods'][0]['requires']=[{'id':'minecraft','version':'[1.21,1.21.1)','side':'both'}]
        self.assertTrue(self.runner._isolation_graph(self.lock))
        self.lock['fml']='unverified'
        with self.assertRaises(PackError):
            self.runner._isolation_graph(self.lock)

    def test_artifact_copy_failure_does_not_skip_owned_trial_cleanup(self):
        with patch.object(self.runner, '_collect_artifacts', side_effect=OSError('fixture disk error')):
            result = self.run_qa()
        self.assertEqual('harness_failure', result['category'], result)
        self.assertFalse((self.args.destination / 'mods').exists())
        self.assert_reports(result)

    def test_cancellation_during_isolation_stops_all_later_trials(self):
        self.server_mode = 'crash'
        self.args.isolate = True
        original_sleep = self.runner.time.sleep
        injected = False
        def cancel_second_trial(seconds):
            nonlocal injected
            # One Ctrl+C, then allow process cleanup to wait. subprocess.wait
            # also uses this module's time.sleep on POSIX; repeatedly raising
            # here interrupts cleanup itself and tests a different scenario.
            if not injected and sum('nogui' in command for command, _ in self.commands) >= 2:
                injected = True
                raise KeyboardInterrupt()
            original_sleep(seconds)
        with patch.object(self.runner.time, 'sleep', side_effect=cancel_second_trial):
            result = self.run_qa()
        self.assertEqual('cancelled', result['category'])
        self.assertEqual(2, sum('nogui' in command for command, _ in self.commands))
        self.assertEqual('inconclusive', result['isolation']['status'])
        self.assertTrue(all(process.poll() is not None for process in self.processes))
        self.assert_reports(result)

    def test_children_are_stopped_when_the_ready_parent_exits_cleanly(self):
        self.server_mode = 'child'
        result = self.run_qa()
        logs = Path(result['artifacts']['server_log']).read_text()
        child_pid = int(logs.split('CHILD_PID=')[1].splitlines()[0])
        if os.name == 'nt':
            import ctypes
            from ctypes import wintypes
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.OpenProcess.restype = wintypes.HANDLE
            kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
            kernel.CloseHandle.argtypes = [wintypes.HANDLE]
            handle = kernel.OpenProcess(0x00100000, False, child_pid)
            if handle:
                stopped = kernel.WaitForSingleObject(handle, 3000) == 0
                kernel.CloseHandle(handle)
            else:
                stopped = True
        else:
            try:
                os.kill(child_pid, 0)
                status = Path(f'/proc/{child_pid}/stat')
                stopped = status.exists() and status.read_text().split()[2] == 'Z'
            except ProcessLookupError:
                stopped = True
        if not stopped:
            # A failing test owns this harmless fixture child and must clean it up.
            if os.name == 'nt':
                self.real_popen(['taskkill', '/PID', str(child_pid), '/F'], stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL).wait(timeout=5)
            else:
                import signal
                os.kill(child_pid, signal.SIGKILL)
        self.assertTrue(stopped, 'The ready Java parent left a live descendant')
        self.assertEqual('success', result['category'])

    def test_existing_hardlinked_report_sinks_are_preserved_with_external_failure_report(self):
        private = self.base / 'private-profile-metadata.json'
        private.write_bytes(b'private profile fixture bytes')
        for index, name in enumerate(('report.json', 'report.md', 'samples.json', 'java-version.log', 'server.log', 'installer.log')):
            with self.subTest(name=name):
                self.args.reports = self.base / f'hardlink-report-{index}'
                self.args.reports.mkdir()
                os.link(private, self.args.reports / name)
                result = self.run_qa()
                self.assertEqual(b'private profile fixture bytes', private.read_bytes())
                self.assertEqual('validation_failure', result['category'])
                self.assertFalse(self.commands)
                self.assertNotEqual(self.args.reports, Path(result['artifacts']['report_json']).parent)
                self.assert_reports(result)

    def test_streaming_log_cannot_truncate_an_existing_hardlink(self):
        source = self.base / 'private-fixture.txt'
        source.write_bytes(b'preserve private fixture')
        log = self.base / 'existing-process.log'
        os.link(source, log)
        with self.assertRaises(PackError):
            self.runner._command([sys.executable, '-version'], self.base,
                self.runner._environment(sys.executable, self.base), log, 1)
        self.assertEqual(b'preserve private fixture', source.read_bytes())

    def test_artifact_copy_cannot_truncate_an_existing_hardlink(self):
        source = self.base / 'private-fixture.txt'
        source.write_bytes(b'preserve private fixture')
        self.args.destination.mkdir()
        (self.args.destination / 'logs').mkdir()
        (self.args.destination / 'logs/latest.log').write_text('new server log')
        artifact = self.args.reports / 'artifacts/logs/latest.log'
        artifact.parent.mkdir(parents=True)
        os.link(source, artifact)
        with self.assertRaises(FileExistsError):
            self.runner._collect_artifacts(self.args.destination, self.args.reports, {'artifacts': {}})
        self.assertEqual(b'preserve private fixture', source.read_bytes())

    def test_shutdown_failure_is_not_used_to_isolate_startup_or_soak(self):
        self.server_mode = 'shutdown_crash'
        self.args.isolate = True
        result = self.run_qa()
        self.assertEqual('failed', result['phases']['shutdown']['status'])
        self.assertFalse(result['isolation_eligible'])
        self.assertEqual(0, result['isolation']['test_count'])
        self.assertEqual(1, sum('nogui' in command for command, _ in self.commands))

    def test_installer_deadline_reaps_process_without_starting_minecraft(self):
        self.installer_hangs = True
        with patch.object(self.runner, '_INSTALLER_SECONDS', 0.1):
            result = self.run_qa()
        self.assertEqual('installer_failure', result['category'])
        self.assertEqual('timed_out', result['phases']['installer']['status'])
        self.assertFalse(any('nogui' in command for command, _ in self.commands))
        self.assertTrue(all(process.poll() is not None for process in self.processes))
        self.assert_reports(result)

    def test_downloaded_installer_is_rejected_before_execution_on_hash_mismatch(self):
        (self.cache / (self.installer_hash + '-installer.jar')).unlink()
        self.args.offline = False
        def bad_download(url, target, **options):
            Path(target).write_bytes(b'not the publisher pinned installer')
        with patch.object(self.runner, 'fetch', side_effect=bad_download):
            result = self.run_qa()
        self.assertEqual('setup_failure', result['category'])
        self.assertFalse(any('--installServer' in command for command, _ in self.commands))
        self.assertFalse((self.cache / (self.installer_hash + '-installer.jar')).exists())
        self.assertFalse(list(self.cache.glob('neoforge-download-*')))
        self.assert_reports(result)

    def test_available_jcmd_samples_real_heap_and_threads_without_fabricating_post_gc(self):
        java = self.base / ('java.exe' if os.name == 'nt' else 'java')
        java.write_bytes(b'fixture intercepted executable')
        java.chmod(0o755)
        jcmd = java.with_name('jcmd.exe' if os.name == 'nt' else 'jcmd')
        jcmd.write_bytes(b'fixture intercepted executable')
        jcmd.chmod(0o755)
        self.args.java = str(java)
        self.args.profiling = 'basic'
        result = self.run_qa()
        self.assertEqual('success', result['category'])
        self.assertEqual('measured', result['memory']['status'])
        self.assertEqual(16777216, result['memory']['metrics']['heap_used_bytes']['first'])
        self.assertEqual(2, result['memory']['metrics']['threads']['first'])
        self.assertIsNone(result['memory']['metrics']['post_gc_heap_bytes'])
        self.assertFalse(result['memory']['suspected_growth'])
        self.assert_reports(result)

    def test_report_records_commit_and_dirty_state_without_changing_source_repository(self):
        git = shutil.which('git')
        if not git:
            self.skipTest('Git is unavailable for the disposable repository fixture')
        environment = dict(os.environ, GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull)
        for arguments in (['init', '-q'], ['add', '.'],
                          ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                           '-c', 'core.hooksPath=' + str(self.base / 'no-hooks'), 'commit', '-qm', 'Fixture']):
            subprocess.run([git, '-C', str(self.root), *arguments], env=environment,
                           check=True, capture_output=True)
        expected = subprocess.run([git, '-C', str(self.root), 'rev-parse', 'HEAD'],
                                  env=environment, check=True, capture_output=True, text=True).stdout.strip()
        clean = self.run_qa()
        self.assertEqual(expected, clean['source_commit'])
        self.assertIs(False, clean['dirty'])
        self.assertEqual('success', clean['category'])
        (self.root / 'untracked-fixture.txt').write_text('Deliberately dirty fixture')
        self.args.destination = self.base / 'second-server'
        self.args.reports = self.base / 'second-reports'
        dirty = self.run_qa()
        self.assertEqual(expected, dirty['source_commit'])
        self.assertIs(True, dirty['dirty'])
        self.assertEqual('success', dirty['category'])
        self.assertNotIn(str(self.root), json.dumps(dirty['context']))

    @unittest.skipUnless(os.name == 'nt', 'Windows job assignment race regression')
    def test_fast_child_is_owned_before_it_can_exit_or_spawn_descendants(self):
        original_job = self.runner._WindowsJob
        def delayed_job(process):
            self.runner.time.sleep(0.15)
            return original_job(process)
        with patch.object(self.runner, '_WindowsJob', side_effect=delayed_job):
            result = self.runner._command([sys.executable, '-version'], self.base,
                self.runner._environment(sys.executable, self.base), self.base / 'owned-process.log', 1)
        self.assertEqual(0, result['exit_code'])
        self.assertIn('openjdk version "21.0.8"', result['logs'])


if __name__ == '__main__':
    unittest.main()
