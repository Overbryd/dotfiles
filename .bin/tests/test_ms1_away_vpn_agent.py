#!/usr/bin/env python3

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


AGENT = Path(__file__).resolve().parents[1] / "ms1-away-vpn-agent"


class Ms1AwayVpnAgentTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.calls = self.root / "wg-calls.log"
        self.fake_wg = self.root / "wg-tunnel"
        self.fake_wg.write_text(
            """#!/bin/bash
set -u
printf '%s\\n' \"$*\" >> \"$FAKE_WG_LOG\"
case \"${1:-}\" in
  show) exit 0 ;;
  status) echo \"${FAKE_WG_STATUS:-disconnected}\" ;;
  is-connected)
    echo \"${FAKE_WG_STATUS:-disconnected}\"
    [[ \"${FAKE_WG_STATUS:-disconnected}\" == connected ]]
    ;;
  start) echo connected ;;
  stop) echo disconnected ;;
  *) exit 64 ;;
esac
"""
        )
        self.fake_wg.chmod(0o755)

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_agent(self, **overrides):
        hostname = subprocess.run(
            ["/bin/hostname", "-s"], check=True, capture_output=True, text=True
        ).stdout.strip()
        env = {
            **os.environ,
            "HOME": str(self.root),
            "USER": "test-user",
            "WG_AUTO_EXPECT_HOSTNAME": hostname,
            "WG_AUTO_TUNNEL": "ms1",
            "WG_TUNNEL_BIN": str(self.fake_wg),
            "WG_AUTO_HA_STATE_OVERRIDE": "away",
            "WG_AUTO_LOCKED_OVERRIDE": "false",
            "WG_AUTO_IDLE_SECONDS_OVERRIDE": "0",
            "WG_AUTO_STATE_DIR": str(self.root / "state"),
            "FAKE_WG_LOG": str(self.calls),
            "FAKE_WG_STATUS": "disconnected",
            **overrides,
        }
        return subprocess.run(
            [str(AGENT)], env=env, capture_output=True, text=True, timeout=10
        )

    def wg_calls(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def test_away_starts_tunnel_even_while_machine_is_active(self):
        result = self.run_agent()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("start ms1", self.wg_calls())
        self.assertIn("reason=away-and-disconnected", result.stdout)

    def test_restarts_connected_tunnel_after_repeated_health_failures(self):
        common = {
            "FAKE_WG_STATUS": "connected",
            "WG_AUTO_HEALTH_STATE_OVERRIDE": "unhealthy",
            "WG_AUTO_HEALTH_FAILURE_THRESHOLD": "2",
        }

        first = self.run_agent(**common)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertNotIn("stop ms1", self.wg_calls())

        second = self.run_agent(**common)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.wg_calls().count("stop ms1"), 1)
        self.assertEqual(self.wg_calls().count("start ms1"), 1)
        self.assertIn("reason=away-and-healthcheck-failed", second.stdout)


if __name__ == "__main__":
    unittest.main()
