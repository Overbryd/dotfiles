import os
from pathlib import Path
import subprocess
import tempfile
import unittest


PROFILE = Path(__file__).resolve().parents[2] / '.profile.d' / 'ca-certificates'
VARIABLES = ['PIP_CERT', 'AWS_CA_BUNDLE', 'REQUESTS_CA_BUNDLE']


class CertificateProfileTests(unittest.TestCase):
    def load_profile(self, prefix, extra=None):
        env = {'PATH': os.defpath, 'HOMEBREW_PREFIX': str(prefix), **(extra or {})}
        result = subprocess.run(
            ['/bin/bash', '-ec',
             'source "$1"; printf "%s\\n%s\\n%s\\n" "$PIP_CERT" "$AWS_CA_BUNDLE" "$REQUESTS_CA_BUNDLE"',
             'bash', str(PROFILE)],
            env=env, capture_output=True, text=True, check=True,
        )
        return result.stdout.splitlines()

    def test_uses_shared_ca_bundle_when_present(self):
        with tempfile.TemporaryDirectory() as directory:
            prefix = Path(directory)
            bundle = prefix / 'etc/ca-certificates/cert.pem'
            bundle.parent.mkdir(parents=True)
            bundle.write_text('test fixture')
            self.assertEqual(self.load_profile(prefix), [str(bundle)] * 3)

    def test_preserves_explicit_application_overrides(self):
        with tempfile.TemporaryDirectory() as directory:
            prefix = Path(directory)
            bundle = prefix / 'etc/ca-certificates/cert.pem'
            bundle.parent.mkdir(parents=True)
            bundle.write_text('test fixture')
            self.assertEqual(
                self.load_profile(prefix, dict.fromkeys(VARIABLES, '/custom/ca.pem')),
                ['/custom/ca.pem'] * 3,
            )

    def test_does_not_configure_a_missing_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(self.load_profile(Path(directory)), ['', '', ''])


if __name__ == '__main__':
    unittest.main()
