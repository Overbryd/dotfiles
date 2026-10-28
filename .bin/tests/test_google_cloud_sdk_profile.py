import os
from pathlib import Path
import subprocess
import tempfile
import unittest


PROFILE = Path(__file__).resolve().parents[2] / '.profile.d' / 'google-cloud-sdk'


class GoogleCloudSdkProfileTests(unittest.TestCase):
    def test_uses_supported_python_and_shared_ca_store(self):
        with tempfile.TemporaryDirectory() as temporary:
            prefix = Path(temporary)
            sdk = prefix / 'Caskroom/google-cloud-sdk/latest/google-cloud-sdk'
            sdk.mkdir(parents=True)
            for filename in ['path.bash.inc', 'completion.bash.inc']:
                (sdk / filename).write_text('')
            result = subprocess.run(
                ['/bin/bash', '-c',
                 'source "$1"; printf "%s\\n%s\\n" "$CLOUDSDK_PYTHON" "$CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE"',
                 'bash', str(PROFILE)],
                env={'PATH': os.defpath, 'HOMEBREW_PREFIX': str(prefix)},
                capture_output=True, text=True, check=True,
            )
            self.assertEqual(result.stdout.splitlines(), [
                str(prefix / 'opt/python@3.13/libexec/bin/python'),
                str(prefix / 'etc/ca-certificates/cert.pem'),
            ])


if __name__ == '__main__':
    unittest.main()
