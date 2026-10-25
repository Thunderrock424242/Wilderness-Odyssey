import unittest
from tools.modpack.common import PackError
from tools.modpack.providers import validate_url


class ProviderTests(unittest.TestCase):
    def test_private_or_credential_urls_rejected(self):
        for url in ('http://example.org/a','https://localhost/a','https://127.0.0.1/a',
                    'https://169.254.169.254/a','https://[::1]/a','https://user:pass@example.org/a',
                    'https://example.org:123/a','https://host.internal/a'):
            with self.subTest(url=url), self.assertRaises(PackError):
                validate_url(url)

    def test_public_https_accepted(self):
        self.assertEqual(validate_url('https://cdn.modrinth.com/data/x/file.jar').hostname,'cdn.modrinth.com')
