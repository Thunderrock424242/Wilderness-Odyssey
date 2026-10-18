from pathlib import Path
import subprocess
import tempfile
import unittest

from tools.modpack.repository import audit_repository


class RepositoryTests(unittest.TestCase):
    def test_qa_upload_boundary_and_trusted_runtime_contract(self):
        workflow=(Path(__file__).resolve().parents[2]/'.github/workflows/modpack-qa.yml').read_text()
        self.assertIn('path: ${{ runner.temp }}/pack-qa-export/',workflow)
        self.assertNotIn('path: ${{ runner.temp }}/pack-qa-reports/',workflow)
        for boundary in ("github.ref == 'refs/heads/1.21-neoforge'",'inputs.accept_eula','environment: modpack-qa',
                         'MODPACK_QA_BASELINE_VALIDATED','retention-days: 7','--scenario "$SCENARIO"',
                         'SCENARIO: ${{ inputs.scenario', 'tools.modpack export'):
            self.assertIn(boundary,workflow)

    def test_tracked_secret_and_jar_are_rejected_without_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(['git','init','-q',tmp],check=True)
            (root/'bad.jar').write_bytes(b'jar')
            (root/'.env').write_text('TOKEN=private_secret_value')
            subprocess.run(['git','-C',tmp,'add','.'],check=True)
            result = audit_repository(root)
            self.assertTrue(any('bad.jar' in e for e in result['errors']))
            self.assertTrue(any('.env' in e for e in result['errors']))
            self.assertNotIn('private_secret_value',str(result))

    def test_custom_asset_zips_preserved_but_nested_jars_and_profile_archives_blocked(self):
        import zipfile
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(['git','init','-q',tmp],check=True)
            (root/'resourcepacks').mkdir()
            with zipfile.ZipFile(root/'resourcepacks/okay.zip','w') as z:
                z.writestr('pack.mcmeta','{}')
            subprocess.run(['git','-C',tmp,'add','.'],check=True)
            self.assertEqual(audit_repository(root)['errors'],[])
            with zipfile.ZipFile(root/'resourcepacks/okay.zip','a') as z:
                z.writestr('mods/hidden.jar',b'jar')
            self.assertTrue(any('JAR' in e for e in audit_repository(root)['errors']))


if __name__ == '__main__':
    unittest.main()
