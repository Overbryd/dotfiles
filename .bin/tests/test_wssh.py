#!/usr/bin/env python3

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


WSSH = Path(__file__).resolve().parents[1] / "wssh"

FAKE_SSH = """#!/bin/bash
set -u
printf '%s\\n' "$*" >> "$FAKE_SSH_LOG"
attempt=$(cat "$FAKE_SSH_COUNT" 2>/dev/null || echo 0)
attempt=$((attempt + 1))
printf '%s' "$attempt" > "$FAKE_SSH_COUNT"
codes=($FAKE_SSH_CODES)
index=$((attempt - 1))
if [[ $index -ge ${#codes[@]} ]]; then
  index=$((${#codes[@]} - 1))
fi
if [[ "$*" == *BatchMode=yes* && -n "${FAKE_SSH_PROBE_STDERR:-}" ]]; then
  printf '%s\\n' "$FAKE_SSH_PROBE_STDERR" >&2
fi
exit "${codes[$index]}"
"""


class WsshTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.log = self.root / "ssh.log"
        self.count = self.root / "ssh.count"
        self.fake_ssh = self.root / "ssh"
        self.fake_ssh.write_text(FAKE_SSH)
        self.fake_ssh.chmod(0o755)
        self.workdir = self.root / "work"
        self.workdir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_wssh(self, codes, args=(), env=None):
        environment = dict(os.environ)
        environment.update(
            {
                "FAKE_SSH_LOG": str(self.log),
                "FAKE_SSH_COUNT": str(self.count),
                "FAKE_SSH_CODES": " ".join(str(code) for code in codes),
                "WSSH_SSH": str(self.fake_ssh),
                "WSSH_HOST": "peer1",
                "WSSH_MIN_BACKOFF": "0",
                "WSSH_MAX_BACKOFF": "0",
            }
        )
        if env:
            environment.update(env)

        return subprocess.run(
            [str(WSSH), *args],
            cwd=str(self.workdir),
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )

    def ssh_calls(self):
        if not self.log.exists():
            return []
        return [line for line in self.log.read_text().splitlines() if line]

    def test_attaches_to_the_tms_session_of_the_current_directory(self):
        result = self.run_wssh([0])

        self.assertEqual(0, result.returncode, result.stderr)
        calls = self.ssh_calls()
        self.assertEqual(1, len(calls))
        self.assertIn("peer1", calls[0])
        self.assertIn("$HOME/.bin/tms", calls[0])
        self.assertIn(str(self.workdir), calls[0])
        self.assertIn("TMS_ATTACH_DETACH_OTHERS=1", calls[0])
        self.assertIn("detached from peer1", result.stderr)

    def test_reconnects_after_a_dropped_connection(self):
        # attach drops (255), reachability probe succeeds (0), attach exits clean (0)
        result = self.run_wssh([255, 0, 0])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("connection to peer1 lost", result.stderr)
        self.assertIn("reconnect attempt 1", result.stderr)
        calls = self.ssh_calls()
        self.assertEqual(3, len(calls))
        self.assertIn("BatchMode=yes", calls[1])
        self.assertIn("$HOME/.bin/tms", calls[2])

    def test_probe_counts_a_refused_batch_login_as_reachable(self):
        result = self.run_wssh(
            [255, 255, 0],
            env={"FAKE_SSH_PROBE_STDERR": "peer1: Permission denied (publickey)."},
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("peer1 is reachable", result.stderr)
        self.assertEqual(3, len(self.ssh_calls()))

    def test_no_retry_exits_on_a_dropped_connection(self):
        result = self.run_wssh([255], args=["--no-retry"])

        self.assertEqual(255, result.returncode)
        self.assertEqual(1, len(self.ssh_calls()))

    def test_remote_failure_is_reported_without_reconnecting(self):
        result = self.run_wssh([1])

        self.assertEqual(1, result.returncode)
        self.assertIn("remote tms failed on peer1", result.stderr)
        self.assertEqual(1, len(self.ssh_calls()))

    def test_explicit_directory_overrides_the_current_directory(self):
        other = self.root / "other"
        other.mkdir()

        result = self.run_wssh([0], args=[str(other)])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn(str(other), self.ssh_calls()[0])

    def test_missing_peer_configuration_fails_early(self):
        result = self.run_wssh([0], env={"WSSH_HOST": "", "WSSH_WSYNC": "false"})

        self.assertEqual(2, result.returncode)
        self.assertIn("no peer host configured", result.stderr)
        self.assertEqual([], self.ssh_calls())


if __name__ == "__main__":
    unittest.main()
