import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from unittest import mock

from tools.modpack.common import PackError, digest
from tools.modpack.pack import generate, validate, dependency_satisfies
from tools.modpack.install import install
from tools.modpack.release import package


def lock_for(jar):
    return {'schema':1,'name':'Test Pack','version':'0.1.0','minecraft':'1.21.1',
        'neoforge':'21.1.256','java':21,'migration':{'status':'imported'},'mods':[
            {'id':'test','filename':'test.jar','sha256':digest(jar),'size':jar.stat().st_size,
             'side':'both','essential':False,'provides':[{'id':'test','version':'1.0','embedded':False}],
             'requires':[],'conflicts':[],'issues':[],'loaders':['neoforge'],
             'source':{'kind':'curseforge','project_id':1,'file_id':2,'verified':True,'allow_distribution':False,'required_projects':[]}}]}


class PackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.repo = self.base/'repo'
        self.repo.mkdir()
        self.local = self.base/'local'
        self.local.mkdir()
        self.jar = self.local/'test.jar'
        self.jar.write_bytes(b'fixture jar bytes')
        self.lock = lock_for(self.jar)
        (self.repo/'config').mkdir()
        (self.repo/'config/example.toml').write_text('enabled=true\n')
        self.assets = ['config/example.toml']

    def test_reproducible_generation_and_hash_drift(self):
        generate(self.repo, self.lock, self.assets)
        self.assertFalse(validate(self.repo, self.lock)['errors'])
        before = (self.repo/'index.toml').read_bytes()
        generate(self.repo, self.lock, self.assets)
        self.assertEqual(before, (self.repo/'index.toml').read_bytes())
        (self.repo/'config/example.toml').write_text('enabled=false')
        self.assertTrue(any('hash' in e for e in validate(self.repo, self.lock)['errors']))

    def test_neoforge_fml_matrix_accepts_only_verified_1211_aliases(self):
        for loader in ('21.1.256','21.1.262'):
            self.lock['neoforge']=loader
            self.assertTrue(dependency_satisfies(self.lock,'minecraft','1.21.1','[1.21,1.21.1)'))
            self.assertTrue(dependency_satisfies(self.lock,'neoforge',loader,'[21.0,21.1)'))
            self.assertFalse(dependency_satisfies(self.lock,'minecraft','1.21.1','[1.20,1.21)'))
            self.assertFalse(dependency_satisfies(self.lock,'minecraft','1.21.1','[1.22,)'))
        self.lock['fml']='unverified'
        self.assertFalse(dependency_satisfies(self.lock,'minecraft','1.21.1','[1.21,1.21.1)'))

    def test_validator_uses_verified_fml_matrix_for_required_builtins(self):
        self.lock['mods'][0]['requires']=[{'id':'minecraft','version':'[1.21,1.21.1)','side':'both'}]
        generate(self.repo,self.lock,self.assets)
        self.assertTrue(validate(self.repo,self.lock)['ready'])
        self.lock['fml']='unverified'
        self.assertFalse(validate(self.repo,self.lock)['ready'])

    def test_malformed_inventory_is_reported_without_a_parser_traceback(self):
        generate(self.repo,self.lock,self.assets)
        for malformed in ([],{'schema':1,'mods':[{'id':'broken'}]},
                          {**self.lock,'mods':[{**self.lock['mods'][0],'requires':['broken']}]},
                          {**self.lock,'mods':[{**self.lock['mods'][0],'provides':'broken'}]}):
            with self.subTest(malformed=type(malformed).__name__):
                result=validate(self.repo,malformed)
                self.assertFalse(result['ready'])
                self.assertTrue(result['errors'])

    def test_pending_and_unknown_sides_cannot_claim_ready(self):
        self.lock['migration']['status'] = 'pending'
        self.lock['mods'] = []
        self.lock['neoforge'] = None
        generate(self.repo, self.lock, self.assets)
        result = validate(self.repo, self.lock)
        self.assertFalse(result['ready'])
        self.assertTrue(any('migration' in e.lower() for e in result['errors']))

    def test_unknown_server_support_kept_in_client_projection_and_blocks_server(self):
        self.lock['mods'][0]['side'] = 'unknown'
        generate(self.repo,self.lock,self.assets)
        self.assertIn('side = "client"',(self.repo/'mods/test.pw.toml').read_text())
        self.assertTrue(validate(self.repo,self.lock,side='client')['ready'])
        self.assertFalse(validate(self.repo,self.lock,side='server')['ready'])
        install(self.repo,self.lock,self.base/'client',local_mods=self.local,offline=True)
        self.assertTrue((self.base/'client/mods/test.jar').exists())

    def test_text_newlines_are_portable_without_source_rewrites(self):
        path = self.repo/'config/example.toml'
        path.write_bytes(b'enabled=true\r\n')
        generate(self.repo,self.lock,self.assets)
        index = (self.repo/'index.toml').read_bytes()
        path.write_bytes(b'enabled=true\n')
        self.assertTrue(validate(self.repo,self.lock)['ready'])
        self.assertEqual(index,(self.repo/'index.toml').read_bytes())
        path.write_bytes(b'enabled=true\r\n')
        install(self.repo,self.lock,self.base/'lf',local_mods=self.local,offline=True)
        self.assertEqual((self.base/'lf/config/example.toml').read_bytes(),b'enabled=true\n')
        self.assertEqual(path.read_bytes(),b'enabled=true\r\n')

    def test_duplicate_missing_side_dependency_and_incompatible_range(self):
        self.lock['mods'][0]['requires'] = [{'id':'missing','version':'*','side':'both'},
            {'id':'neoforge','version':'[99,)','side':'both'}]
        self.lock['mods'].append(copy.deepcopy(self.lock['mods'][0]))
        self.lock['mods'][1]['id'] = 'duplicate'
        self.lock['mods'][1]['filename'] = 'other.jar'
        generate(self.repo, self.lock, self.assets)
        errors = '\n'.join(validate(self.repo, self.lock)['errors'])
        self.assertIn('Duplicate mod ID', errors)
        self.assertIn('missing', errors)
        self.assertIn('99', errors)

    def test_client_only_conflict_does_not_block_server(self):
        client=copy.deepcopy(self.lock['mods'][0])
        client.update(id='client',filename='client.jar',side='client',provides=[{'id':'client','version':'1.0'}])
        self.lock['mods'].append(client)
        self.lock['mods'][0]['conflicts']=[{'id':'client','version':'*','side':'client','kind':'incompatible'}]
        generate(self.repo,self.lock,self.assets)
        self.assertTrue(validate(self.repo,self.lock,side='server')['ready'])
        self.assertFalse(validate(self.repo,self.lock,side='client')['ready'])

    def test_separate_side_variants_and_ambiguous_embedded_versions(self):
        client=copy.deepcopy(self.lock['mods'][0])
        self.lock['mods'][0]['side']='server'
        client.update(id='client',filename='client.jar',side='client')
        self.lock['mods'].append(client)
        generate(self.repo,self.lock,self.assets)
        self.assertTrue(validate(self.repo,self.lock,side='client')['ready'])
        self.lock['mods'][0]['side']='both'
        client['provides']=[{'id':'library','version':'1.0','embedded':True}]
        self.lock['mods'][0]['provides'].append({'id':'library','version':'2.0','embedded':True})
        self.lock['mods'][0]['requires']=[{'id':'library','version':'[2,)','side':'both'}]
        generate(self.repo,self.lock,self.assets)
        result=validate(self.repo,self.lock,side='client')
        self.assertTrue(result['ready'])
        self.assertTrue(any('selection' in w for w in result['warnings']))

    def test_install_private_local_exact_bytes_and_refuse_existing_destination(self):
        generate(self.repo, self.lock, self.assets)
        target = self.base/'disposable'
        install(self.repo, self.lock, target, local_mods=self.local, offline=True)
        self.assertEqual(digest(target/'mods/test.jar'), digest(self.jar))
        self.assertTrue((target/'config/example.toml').exists())
        with self.assertRaises(PackError):
            install(self.repo, self.lock, target, local_mods=self.local, offline=True)
        with self.assertRaises(PackError):
            install(self.repo, self.lock, self.repo/'run', local_mods=self.local, offline=True)

    def test_manual_download_instructions_and_no_partial_install(self):
        self.lock['mods'][0]['source'] = {'kind':'manual','verified':False,'instructions':'Download from author.'}
        generate(self.repo, self.lock, self.assets)
        with self.assertRaisesRegex(PackError, 'local-mods'):
            install(self.repo, self.lock, self.base/'missing', offline=True)
        self.assertFalse((self.base/'missing').exists())

    def test_local_hash_mismatch_is_not_accepted(self):
        generate(self.repo, self.lock, self.assets)
        self.jar.write_bytes(b'wrong version')
        with self.assertRaisesRegex(PackError, 'SHA-256'):
            install(self.repo, self.lock, self.base/'bad', local_mods=self.local, offline=True)

    def test_cache_cannot_write_anywhere_in_live_source_profile(self):
        generate(self.repo,self.lock,self.assets)
        profile=self.base/'profile'
        profile.mkdir()
        (profile/'minecraftinstance.json').write_text('{}')
        (profile/'mods').mkdir()
        (profile/'mods/test.jar').write_bytes(self.jar.read_bytes())
        with self.assertRaisesRegex(PackError,'[Pp]rofile'):
            install(self.repo,self.lock,self.base/'new',local_mods=profile/'mods',cache=profile/'cache',offline=True)
        self.assertFalse((profile/'cache').exists())

    def test_destination_symlink_is_rejected_before_resolving(self):
        generate(self.repo,self.lock,self.assets)
        actual,alias=self.base/'actual',self.base/'alias'
        actual.mkdir()
        try:
            alias.symlink_to(actual,target_is_directory=True)
        except OSError:
            self.skipTest('Host does not permit symlinks; Linux CI exercises this check.')
        with self.assertRaisesRegex(PackError,'[Ss]ymlink|[Ll]ink'):
            install(self.repo,self.lock,alias,local_mods=self.local,offline=True)

    def test_release_deterministic_ids_and_no_jars(self):
        generate(self.repo, self.lock, self.assets)
        a, b = self.base/'a.zip', self.base/'b.zip'
        package(self.repo, self.lock, a)
        package(self.repo, self.lock, b)
        self.assertEqual(digest(a), digest(b))
        with zipfile.ZipFile(a) as z:
            self.assertFalse(any(p.endswith('.jar') for p in z.namelist()))
            manifest = json.loads(z.read('manifest.json'))
            self.assertEqual(manifest['files'], [{'projectID':1,'fileID':2,'required':True}])
            self.assertIn('overrides/config/example.toml', z.namelist())

    def test_release_blocks_non_curseforge_redistribution(self):
        self.lock['mods'][0]['source'] = {'kind':'manual','verified':False}
        generate(self.repo, self.lock, self.assets)
        with self.assertRaisesRegex(PackError, 'CurseForge'):
            package(self.repo, self.lock, self.base/'blocked.zip')

    def test_release_owned_api_requires_explicit_flag_and_exact_local_bytes(self):
        mod=self.lock['mods'][0]
        mod.update(id='wildernessodysseyapi',source={'kind':'manual','verified':False},
                   provides=[{'id':'wildernessodysseyapi','version':'5.0.0','embedded':False}])
        generate(self.repo,self.lock,self.assets)
        with self.assertRaises(PackError):
            package(self.repo,self.lock,self.base/'no-consent.zip',local_mods=self.local)
        with self.assertRaises(PackError):
            package(self.repo,self.lock,self.base/'no-bytes.zip',include_owned_api=True)
        first,second=self.base/'owned.zip',self.base/'repeat.zip'
        package(self.repo,self.lock,first,local_mods=self.local,include_owned_api=True)
        package(self.repo,self.lock,second,local_mods=self.local,include_owned_api=True)
        self.assertEqual(digest(first),digest(second))
        with zipfile.ZipFile(first) as archive:
            self.assertEqual(self.jar.read_bytes(),archive.read('overrides/mods/test.jar'))
            self.assertEqual([],json.loads(archive.read('manifest.json'))['files'])
            self.assertIn('overrides/mods/test.jar',archive.read('SHA256SUMS.txt').decode())
        self.jar.write_bytes(b'wrong API version')
        with self.assertRaisesRegex(PackError,'SHA-256'):
            package(self.repo,self.lock,self.base/'bad.zip',local_mods=self.local,include_owned_api=True)
        self.assertFalse((self.base/'bad.zip').exists())

    def test_owned_api_flag_cannot_bundle_unrelated_manual_mod(self):
        self.lock['mods'][0]['source']={'kind':'manual','verified':False}
        generate(self.repo,self.lock,self.assets)
        with self.assertRaises(PackError):
            package(self.repo,self.lock,self.base/'other.zip',local_mods=self.local,include_owned_api=True)

    def test_release_bytes_do_not_depend_on_windows_or_linux_host(self):
        generate(self.repo,self.lock,self.assets)
        a,b=self.base/'windows.zip',self.base/'linux.zip'
        with mock.patch('zipfile.sys.platform','win32'):
            package(self.repo,self.lock,a)
        with mock.patch('zipfile.sys.platform','linux'):
            package(self.repo,self.lock,b)
        self.assertEqual(digest(a),digest(b))


if __name__ == '__main__':
    unittest.main()
