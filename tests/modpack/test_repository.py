from pathlib import Path
import subprocess
import tempfile
import unittest

from tools.modpack.repository import audit_repository


class RepositoryTests(unittest.TestCase):
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
