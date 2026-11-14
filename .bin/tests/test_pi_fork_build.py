import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class PiForkBuildTests(unittest.TestCase):
    def test_fork_build_has_no_privileged_global_install_and_uses_matching_model_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            fork = Path(temporary) / 'pi'
            (fork / '.git').mkdir(parents=True)
            result = subprocess.run(
                ['make', '--dry-run', 'pi-fork', f'PI_FORK_ROOT={fork}'],
                cwd=ROOT, env={**os.environ, 'HOME': temporary},
                capture_output=True, text=True,
            )
        self.assertEqual(0, result.returncode, result.stderr)
        recipe = result.stdout
        self.assertNotIn('sudo', recipe)
        self.assertNotIn('install -g', recipe)
        self.assertNotIn('MIN_RELEASE_AGE=0', recipe)
        self.assertIn('ci --ignore-scripts --min-release-age=30', recipe)
        self.assertIn('npm pack --ignore-scripts --json', recipe)
        self.assertIn('@earendil-works/pi-ai@$fork_version', recipe)
        self.assertIn('package/dist/providers/data/.', recipe)
        self.assertIn('run build:offline', recipe)

    def test_build_recipe_extracts_the_hidden_manifest_without_a_global_cli(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fork = root / 'pi'
            (fork / '.git').mkdir(parents=True)
            package = fork / 'packages/coding-agent/package.json'
            package.parent.mkdir(parents=True)
            package.write_text(json.dumps({'version': '1.2.0'}))
            archive = root / 'models.tgz'
            with tarfile.open(archive, 'w:gz') as target:
                for name in ('.manifest.json', 'openai.json'):
                    data = b'fixture\n'
                    entry = tarfile.TarInfo(f'package/dist/providers/data/{name}')
                    entry.size = len(data)
                    target.addfile(entry, io.BytesIO(data))
            binaries = root / 'bin'
            binaries.mkdir()
            npm = binaries / 'npm'
            npm.write_text('''#!/bin/sh
set -eu
case "$1" in
  --min-release-age=30) printf '30\\n' ;;
  ci) exit 0 ;;
  pack) cp "$MODEL_TARBALL" models.tgz; printf '%s\\n' '[{"filename":"models.tgz"}]' ;;
  run) test -f packages/ai/src/providers/data/.manifest.json; touch build-completed ;;
  *) exit 2 ;;
esac
''')
            node = binaries / 'node'
            node.write_text('''#!/bin/sh
if [ "$1" = "../../node_modules/vitest/dist/cli.js" ]; then exit 0; fi
exec "$REAL_NODE" "$@"
''')
            npm.chmod(0o755)
            node.chmod(0o755)
            env = {**os.environ, 'HOME': temporary, 'PATH': f'{binaries}:{os.environ["PATH"]}',
                   'MODEL_TARBALL': str(archive), 'REAL_NODE': shutil.which('node')}

            result = subprocess.run(['make', 'pi-fork', f'PI_FORK_ROOT={fork}'],
                                    cwd=ROOT, env=env, capture_output=True, text=True)

            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertEqual('fixture\n', (fork / 'packages/ai/src/providers/data/.manifest.json').read_text())
            self.assertTrue((fork / 'build-completed').exists())


if __name__ == '__main__':
    unittest.main()
