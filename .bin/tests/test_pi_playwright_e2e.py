import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / '.bin/pi-playwright-e2e'
INSTALLER = ROOT / '.agent/skills/playwright-e2e/scripts/install.sh'


class PiPlaywrightE2eTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.playwright_home = self.home / 'shared playwright'
        self.venv = self.playwright_home / 'venv'
        self.env = {
            **os.environ,
            'HOME': str(self.home),
            'PI_PLAYWRIGHT_HOME': str(self.playwright_home),
            'PYTHON_BIN': sys.executable,
        }

    def make_broken_venv(self):
        bin_dir = self.venv / 'bin'
        bin_dir.mkdir(parents=True)
        (bin_dir / 'python').symlink_to('python3.13')
        (bin_dir / 'python3').symlink_to('python3.13')
        (bin_dir / 'python3.13').symlink_to(self.home / 'removed-homebrew-python')

    def run_script(self, script, *args):
        return subprocess.run(
            ['/bin/bash', str(script), *args], env=self.env,
            capture_output=True, text=True, timeout=60,
        )

    def test_installer_rebuilds_stale_homebrew_virtualenv(self):
        self.make_broken_venv()
        (self.venv / 'old-package').write_text('stale')
        modules = self.home / 'modules'
        modules.mkdir()
        log = self.home / 'install.jsonl'
        for module in ['pip', 'playwright']:
            (modules / f'{module}.py').write_text(
                'import json, os, sys\n'
                'with open(os.environ["INSTALL_LOG"], "a") as log:\n'
                '    log.write(json.dumps(sys.argv) + "\\n")\n'
            )
        self.env.update(PYTHONPATH=str(modules), INSTALL_LOG=str(log))

        result = self.run_script(INSTALLER, 'chromium', 'firefox')

        self.assertEqual(result.returncode, 0, result.stderr)
        python = self.venv / 'bin/python'
        self.assertTrue(python.exists())
        self.assertFalse((self.venv / 'old-package').exists())
        probe = subprocess.run(
            [str(python), '-c', 'import sys; print(sys.prefix)'],
            capture_output=True, text=True, check=True,
        )
        self.assertEqual(Path(probe.stdout.strip()).resolve(), self.venv.resolve())
        calls = [json.loads(line)[1:] for line in log.read_text().splitlines()]
        self.assertEqual(calls, [
            ['install', '--upgrade', 'pip'],
            ['install', '--upgrade', 'playwright'],
            ['install', 'chromium', 'firefox'],
        ])

    def test_launcher_reports_broken_link_without_global_fallback(self):
        self.make_broken_venv()
        result = self.run_script(LAUNCHER, '--help')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('missing or broken', result.stderr)
        self.assertIn(str(self.venv / 'bin/python'), result.stderr)
        self.assertIn('PI_PLAYWRIGHT_HOME=', result.stderr)
        self.assertIn('install.sh', result.stderr)
        self.assertEqual(result.stdout, '')

    def test_launcher_reports_missing_virtualenv(self):
        result = self.run_script(LAUNCHER, '--help')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('missing or broken', result.stderr)

    def test_launcher_reports_unusable_interpreter(self):
        bin_dir = self.venv / 'bin'
        bin_dir.mkdir(parents=True)
        python = bin_dir / 'python'
        python.write_text('#!/bin/sh\nexit 1\n')
        python.chmod(0o755)

        result = self.run_script(LAUNCHER, '--help')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('missing or broken', result.stderr)

    def test_launcher_uses_dedicated_python_and_preserves_arguments(self):
        bin_dir = self.venv / 'bin'
        bin_dir.mkdir(parents=True)
        (bin_dir / 'python').symlink_to(sys.executable)
        runner = self.home / 'dotfiles/.agent/skills/playwright-e2e/scripts/pi_playwright_e2e.py'
        runner.parent.mkdir(parents=True)
        runner.write_text('import json, sys; print(json.dumps(sys.argv[1:]))\n')

        result = self.run_script(LAUNCHER, '--scenario', 'a scenario.py')

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), ['--scenario', 'a scenario.py'])


if __name__ == '__main__':
    unittest.main()
