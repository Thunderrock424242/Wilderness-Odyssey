import copy
from pathlib import Path
import tempfile
import subprocess
import ssl
import urllib.error
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from tools.modpack.common import PackError, read_json, write_json
from tools.modpack.loader import check_loader, latest_stable, official_metadata, METADATA as METADATA_URL
from tools.modpack.pack import generate


METADATA = b'<metadata><versioning><versions><version>26.1.999</version><version>21.2.999</version><version>21.1.263-beta</version><version>21.1.9</version><version>21.1.262</version></versions></versioning></metadata>'
POM = b'<project xmlns="http://maven.apache.org/POM/4.0.0"><dependencies><dependency><groupId>net.neoforged.fancymodloader</groupId><artifactId>loader</artifactId><version>4.0.45</version></dependency></dependencies></project>'


class LoaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(['git','init','-q',str(self.root)],check=True)
        self.lock = {'schema':1,'name':'Fixture','version':'1','minecraft':'1.21.1','java':21,
                     'neoforge':'21.1.256','migration':{'status':'imported'},'mods':[]}
        write_json(self.root/'modpack/lock.json',self.lock)
        write_json(self.root/'qa/tool-lock.json',{'neoforge':{}})
        generate(self.root,self.lock,[])

    def fetch(self,url,**kwargs):
        if url.endswith('maven-metadata.xml'):
            return METADATA
        if url.endswith('.sha256'):
            return b'a'*64+b'\n'
        if url.endswith('.pom'):
            return POM
        raise AssertionError(url)

    def test_latest_is_numeric_stable_and_only_for_minecraft_1211(self):
        self.assertEqual('21.1.262',latest_stable(METADATA))
        with self.assertRaises(PackError):
            latest_stable(b'<metadata><versioning><versions><version>26.1.1</version></versions></versioning></metadata>')

    def test_dry_run_never_mutates_and_apply_pins_verified_tool_and_provenance(self):
        before=(self.root/'modpack/lock.json').read_bytes()
        with patch('tools.modpack.loader.fetch',side_effect=self.fetch):
            result=check_loader(self.root,self.lock,latest=True)
            self.assertEqual('21.1.262',result['selected'])
            self.assertEqual(before,(self.root/'modpack/lock.json').read_bytes())
            check_loader(self.root,self.lock,latest=True,apply=True)
        lock=read_json(self.root/'modpack/lock.json')
        self.assertEqual('21.1.262',lock['neoforge'])
        self.assertEqual('4.0.45',lock['fml'])
        self.assertEqual('21.1.256',lock['migration']['profile_neoforge'])
        self.assertEqual('explicit',lock['loader_policy']['mode'])
        self.assertEqual('a'*64,read_json(self.root/'qa/tool-lock.json')['neoforge']['21.1.262']['sha256'])
        self.assertIn('neoforge = "21.1.262"',(self.root/'pack.toml').read_text())

    def test_bad_checksum_or_missing_fml_blocks_before_writes(self):
        before={p:p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        for suffix,bad in (('.sha256',b'bad'),('.pom',b'<project/>')):
            def fetch(url,**kwargs):
                return bad if url.endswith(suffix) else self.fetch(url,**kwargs)
            with patch('tools.modpack.loader.fetch',side_effect=fetch),self.assertRaises(PackError):
                check_loader(self.root,copy.deepcopy(self.lock),latest=True,apply=True)
            self.assertTrue(all(p.read_bytes()==data for p,data in before.items()))

    def test_cannot_pin_another_minecraft_line(self):
        with self.assertRaises(PackError):
            check_loader(self.root,self.lock,version='26.1.1',apply=True)

    def test_native_windows_tls_fallback_still_verifies_and_does_not_follow_redirects(self):
        error=PackError('TLS chain error')
        error.__cause__=urllib.error.URLError(ssl.SSLCertVerificationError(1,'expired chain'))
        with patch('tools.modpack.loader.fetch',side_effect=error), \
             patch('tools.modpack.loader.sys.platform','win32'), \
             patch.object(Path,'is_file',return_value=True), \
             patch('tools.modpack.loader.subprocess.run',return_value=SimpleNamespace(returncode=0,stdout=b'xml')) as run:
            self.assertEqual(b'xml',official_metadata(METADATA_URL,1024))
            command=run.call_args.args[0]
            self.assertEqual('--disable',command[1])
            self.assertIn('--max-filesize',command)
            self.assertNotIn('--insecure',command)
            self.assertNotIn('--location',command)
            self.assertEqual(35,run.call_args.kwargs['timeout'])
            with self.assertRaises(PackError):
                official_metadata('https://example.org/metadata',1024)
        with patch('tools.modpack.loader.fetch',side_effect=error),patch('tools.modpack.loader.sys.platform','linux'):
            with self.assertRaises(PackError):
                official_metadata(METADATA_URL,1024)
