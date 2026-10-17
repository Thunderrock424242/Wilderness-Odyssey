import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest import mock
from types import SimpleNamespace

from tools.modpack.sync import scan_profile, changes
from tools.modpack.metadata import inspect_jar
from tools.modpack.common import PackError, safe_path, junction


def make_jar(path, mod_id='example', version='1.0', dependencies=''):
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w') as jar:
        jar.writestr('META-INF/neoforge.mods.toml',
                     'modLoader="javafml"\nloaderVersion="[1,)"\n'
                     '[[mods]]\nmodId="' + mod_id + '"\nversion="' + version + '"\n' + dependencies)


class ManagementTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.profile = self.root / 'profile'
        make_jar(self.profile / 'mods' / 'example.jar')
        self.meta = {'gameVersion': '1.21.1', 'baseModLoader': {'name': 'neoforge-21.1.256'},
                     'name': 'private profile', 'installedAddons': []}

    def save(self):
        (self.profile / 'minecraftinstance.json').write_text(json.dumps(self.meta))

    def test_scan_hashes_and_manual_identity_without_filename_guess(self):
        self.save()
        result = scan_profile(self.profile)
        mod = result['mods'][0]
        self.assertEqual(result['neoforge'], '21.1.256')
        self.assertEqual(mod['sha256'], hashlib.sha256((self.profile/'mods/example.jar').read_bytes()).hexdigest())
        self.assertEqual(mod['source']['kind'], 'manual')
        self.assertEqual(mod['side'], 'unknown')
        self.assertNotIn('private profile', json.dumps(result))
        self.assertEqual(mod['provides'][0]['id'], 'example')

    def test_curseforge_hash_proof_and_stale_metadata(self):
        jar = self.profile/'mods/example.jar'
        self.meta['installedAddons'] = [{'addonID': 123, 'allowModDistribution': False,
            'installedFile': {'id': 456, 'fileName': jar.name,
                              'hashes': [{'type': 1, 'value': hashlib.sha1(jar.read_bytes()).hexdigest()}]}}]
        self.save()
        source = scan_profile(self.profile)['mods'][0]['source']
        self.assertEqual(source['kind'], 'curseforge')
        self.assertEqual(source['file_id'], 456)
        self.assertFalse(source['allow_distribution'])
        self.meta['installedAddons'][0]['installedFile']['hashes'][0]['value'] = '0'*40
        self.save()
        changed = scan_profile(self.profile)['mods'][0]
        self.assertEqual(changed['source']['kind'], 'manual')
        self.assertTrue(any('hash' in s.lower() for s in changed['issues']))

    def test_real_launcher_dependency_shape(self):
        jar = self.profile/'mods/example.jar'
        self.meta['installedAddons'] = [{'addonID':123,'installedFile':{'id':456,'fileName':jar.name,
            'hashes':[{'type':1,'value':hashlib.sha1(jar.read_bytes()).hexdigest()}],
            'dependencies':[{'addonId':817709,'type':3},{'addonId':548599,'type':2}]}}]
        self.save()
        self.assertEqual(scan_profile(self.profile)['mods'][0]['source']['required_projects'],[817709])

    def test_requires_extracted_and_nested_jars_provide_libraries(self):
        dep = '\n[[dependencies.example]]\nmodId="library"\ntype="required"\nversionRange="[2,)"\nside="BOTH"\n'
        jar = self.profile/'mods/example.jar'
        make_jar(jar, dependencies=dep)
        library = self.root/'library.jar'
        make_jar(library, 'library', '2.0')
        with zipfile.ZipFile(jar, 'a') as z:
            z.writestr('META-INF/jarjar/metadata.json', json.dumps({'jars':[{'path':'META-INF/jarjar/library.jar'}]}))
            z.writestr('META-INF/jarjar/library.jar', library.read_bytes())
        info = inspect_jar(jar)
        self.assertEqual({m['id'] for m in info['provides']}, {'example', 'library'})
        self.assertEqual(info['requires'][0]['id'], 'library')

    def test_review_is_bound_to_exact_bytes_and_sync_is_repeatable(self):
        self.save()
        first = scan_profile(self.profile)
        key = first['mods'][0]['id']
        review = {key: {'sha256': first['mods'][0]['sha256'], 'side': 'both', 'essential': True}}
        second = scan_profile(self.profile, reviews=review)
        self.assertEqual(second['mods'][0]['side'], 'both')
        self.assertTrue(second['mods'][0]['essential'])
        self.assertEqual(changes(second, second)['updated'], [])
        make_jar(self.profile/'mods/example.jar', version='2.0')
        third = scan_profile(self.profile, reviews=review)
        self.assertEqual(third['mods'][0]['side'], 'unknown')
        self.assertTrue(changes(second, third)['updated'])

    def test_nested_inspection_has_an_aggregate_work_budget(self):
        child=self.root/'child.jar'
        make_jar(child,'child')
        jar=self.profile/'mods/example.jar'
        with zipfile.ZipFile(jar,'a') as z:
            z.writestr('META-INF/jarjar/metadata.json',json.dumps({'jars':[{'path':'nested.jar'}]*300}))
            z.writestr('nested.jar',child.read_bytes())
        self.assertTrue(inspect_jar(jar)['issues'])

    def test_symlink_mod_rejected_and_traversal_rejected(self):
        for value in ['../x', 'C:/x', 'a\\b', '/x', 'CON', 'a:b', 'a/../b', 'a./b']:
            with self.subTest(value=value), self.assertRaises(PackError):
                safe_path(self.root, value)

    def test_windows_reparse_point_detected_without_path_is_junction(self):
        with mock.patch.object(Path,'lstat',return_value=SimpleNamespace(st_file_attributes=0x400)), \
             mock.patch.object(Path,'is_junction',lambda p:False,create=True):
            self.assertTrue(junction(self.root))

    def test_missing_loader_not_replaced_with_legacy_version(self):
        self.meta['baseModLoader'] = {}
        self.save()
        with self.assertRaisesRegex(PackError, 'NeoForge'):
            scan_profile(self.profile)

    def test_launcher_metadata_change_during_scan_is_rejected(self):
        self.save()
        original=inspect_jar
        def update_during_scan(path):
            info=original(path)
            self.meta['baseModLoader']['name']='neoforge-21.1.257'
            self.save()
            return info
        with mock.patch('tools.modpack.sync.inspect_jar',side_effect=update_during_scan):
            with self.assertRaisesRegex(PackError,'changed during'):
                scan_profile(self.profile)

    def test_disabled_jars_reported_not_imported(self):
        (self.profile/'mods/disabled.jar.disabled').write_bytes(b'not enabled')
        self.save()
        lock = scan_profile(self.profile)
        self.assertEqual(len(lock['mods']), 1)
        self.assertIn('disabled.jar.disabled', lock['disabled_files'])


if __name__ == '__main__':
    unittest.main()
