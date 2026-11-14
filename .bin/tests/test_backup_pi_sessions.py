import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.bin/backup-pi-sessions'


@unittest.skipUnless(Path('/opt/homebrew/bin/rsync').exists(), 'requires Homebrew rsync')
class PiSessionBackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.source = self.home / '.pi/agent/sessions/project'
        self.destination = self.home / 'Dropbox/Backups/pi/agent/sessions'
        self.state = self.home / '.local/state/pi-session-backup'
        self.env = {**os.environ, 'HOME': str(self.home), 'XDG_STATE_HOME': str(self.home / '.local/state')}

    def run_backup(self):
        return subprocess.run(['bash', str(SCRIPT)], env=self.env, capture_output=True, text=True)

    def test_copies_sessions_privately_without_deleting_history_or_copying_auth(self):
        self.source.mkdir(parents=True)
        (self.source / 'session.jsonl').write_text('{"type":"session","id":"fixture"}\n')
        (self.home / '.pi/agent/auth.json').write_text('{"private":"not backed up"}\n')
        self.destination.mkdir(parents=True)
        (self.destination / 'archived.jsonl').write_text('keep\n')

        result = self.run_backup()

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual((self.source / 'session.jsonl').read_bytes(), (self.destination / 'project/session.jsonl').read_bytes())
        self.assertEqual((self.source / 'session.jsonl').read_bytes(), (self.state / 'sessions/project/session.jsonl').read_bytes())
        self.assertTrue((self.state / 'last-local-success').exists())
        self.assertTrue((self.state / 'last-dropbox-copy-success').exists())
        self.assertTrue((self.destination / 'archived.jsonl').exists())
        self.assertFalse((self.destination.parent / 'auth.json').exists())
        self.assertEqual(0o700, self.destination.stat().st_mode & 0o777)
        self.assertEqual(0o700, self.state.stat().st_mode & 0o777)
        self.assertEqual(0o600, (self.state / 'last-run.log').stat().st_mode & 0o777)
        self.assertEqual(0o600, (self.state / 'last-success').stat().st_mode & 0o777)
        self.assertFalse((self.state / 'last-failure').exists())
        self.assertEqual('', result.stdout)

    def test_failure_preserves_success_marker_and_records_failure_then_recovers(self):
        self.state.mkdir(parents=True)
        (self.state / 'last-success').write_text('previous successful backup\n')

        result = self.run_backup()

        self.assertNotEqual(0, result.returncode)
        self.assertEqual('previous successful backup\n', (self.state / 'last-success').read_text())
        self.assertTrue((self.state / 'last-failure').exists())
        self.assertIn('source directory missing', (self.state / 'last-run.log').read_text())
        self.source.mkdir(parents=True)
        (self.source / 'session.jsonl').write_text('{}\n')
        self.assertEqual(0, self.run_backup().returncode)
        self.assertFalse((self.state / 'last-failure').exists())
        self.assertNotEqual('previous successful backup\n', (self.state / 'last-success').read_text())

    def test_cloud_failure_still_leaves_a_current_private_local_backup(self):
        self.source.mkdir(parents=True)
        (self.source / 'session.jsonl').write_text('{}\n')
        self.destination.parent.mkdir(parents=True)
        self.destination.write_text('not a directory\n')

        result = self.run_backup()

        self.assertNotEqual(0, result.returncode)
        self.assertEqual('{}\n', (self.state / 'sessions/project/session.jsonl').read_text())
        self.assertTrue((self.state / 'last-local-success').exists())
        self.assertTrue((self.state / 'last-failure').exists())
        self.assertFalse((self.state / 'last-dropbox-copy-success').exists())
        self.assertFalse((self.state / 'last-success').exists())

    def test_launch_agent_runs_the_observable_backup_helper_hourly(self):
        with (ROOT / 'LaunchAgents/io.pi.agent.sessions-backup.plist').open('rb') as source:
            config = plistlib.load(source)
        self.assertEqual(3600, config['StartInterval'])
        self.assertTrue(config['RunAtLoad'])
        self.assertIn('$HOME/.bin/backup-pi-sessions', config['ProgramArguments'][-1])


if __name__ == '__main__':
    unittest.main()
