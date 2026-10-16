#!/usr/bin/env python3
"""Integration tests against an isolated tmux socket; never touch the user's server."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import uuid

SCRIPT = Path(__file__).resolve().parents[1] / "tmux-pi"


class TmuxPiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.socket = "pi-restore-test-" + uuid.uuid4().hex[:12]
        fake_pi = self.root / "pi"
        fake_pi.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" > \"$TMUX_PI_TEST_ARGS\"\nexec sleep 30\n")
        fake_pi.chmod(0o755)
        self.env = {**os.environ, "TMUX_PI_SOCKET": self.socket,
                    "TMUX_PI_BIN": str(fake_pi),
                    "TMUX_PI_STATE": str(self.root / "state" / "snapshot.json"),
                    "TMUX_PI_TEST_ARGS": str(self.root / "pi.args"),
                    "PATH": f'{self.root}:{os.environ["PATH"]}'}
        self.tmux("-f", "/dev/null", "new-session", "-d", "-s", "TestPi", "-n", "TODAY", "-c", str(self.root),
                  "exec -a pi /opt/homebrew/bin/node -e 'setInterval(() => {}, 1000)'")
        self.tmux("set-environment", "-t", "TestPi", "PATH", self.env["PATH"])
        self.tmux("set-environment", "-t", "TestPi", "TMUX_PI_TEST_ARGS", self.env["TMUX_PI_TEST_ARGS"])
        self.addCleanup(lambda: self.tmux("kill-server", check=False))

    def tmux(self, *args, check=True):
        return subprocess.run(["tmux", "-L", self.socket, *args], check=check,
                              text=True, capture_output=True)

    def script(self, *args):
        return subprocess.run([str(SCRIPT), *args], env=self.env, text=True, capture_output=True)

    def test_requires_verified_pi_mapping_and_restores_names_and_split(self):
        session = self.root / "conversation.jsonl"
        session.write_text(json.dumps({"type": "session", "version": 3, "cwd": str(self.root),
                                       "id": "test-session", "timestamp": "2026-10-15T00:00:00Z"}) + "\n")
        pane = self.tmux("display-message", "-p", "-t", "TestPi:TODAY", "#{pane_id}").stdout.strip()
        # Simulated marker on a live node process; production bind requires the command to be Pi.
        self.tmux("set-option", "-p", "-t", pane, "@tmux-pi-file", str(session))
        self.tmux("set-option", "-p", "-t", pane, "@tmux-pi-id", "test-session")
        pid = self.tmux("display-message", "-p", "-t", pane, "#{pane_pid}").stdout.strip()
        self.tmux("set-option", "-p", "-t", pane, "@tmux-pi-pid", pid)
        self.tmux("split-window", "-h", "-t", "TestPi:TODAY", "-c", str(self.root))
        self.tmux("new-window", "-d", "-t", "TestPi:1", "-n", "other/work", "-c", str(self.root))
        saved = self.script("save")
        self.assertEqual(0, saved.returncode, saved.stderr)
        data = json.loads(Path(self.env["TMUX_PI_STATE"]).read_text())
        self.assertEqual(0o600, Path(self.env["TMUX_PI_STATE"]).stat().st_mode & 0o777)
        self.assertEqual("TODAY", data["sessions"][0]["windows"][0]["name"])
        self.assertEqual(2, len(data["sessions"][0]["windows"][0]["panes"]))
        self.assertEqual(str(session), data["sessions"][0]["windows"][0]["panes"][0]["session_file"])
        self.assertEqual(0, self.script("restore", "--dry-run").returncode)
        self.tmux("kill-server")
        restored = self.script("restore")
        self.assertEqual(0, restored.returncode, restored.stderr)
        windows = self.tmux("list-windows", "-t", "TestPi", "-F", "#{window_index}|#{window_name}|#{window_panes}").stdout
        self.assertIn("0|TODAY|2", windows)
        self.assertIn("1|other/work|1", windows)
        self.assertIn(str(session), json.dumps(data))
        self.assertEqual(str(session), self.tmux("show-options", "-p", "-v", "-t", "TestPi:0.0", "@tmux-pi-file").stdout.strip())
        self.assertEqual("TODAY", self.tmux("display-message", "-p", "-t", "TestPi:0", "#{window_name}").stdout.strip())
        import time
        for _ in range(20):
            if (self.root / "pi.args").exists():
                break
            time.sleep(0.1)
        self.assertEqual(f"--session {session} --name TODAY", (self.root / "pi.args").read_text().strip())

    def test_grouped_tms_views_snapshot_only_the_project_anchor(self):
        pane = self.tmux("display-message", "-p", "-t", "TestPi:TODAY", "#{pane_id}").stdout.strip()
        pid = self.tmux("display-message", "-p", "-t", pane, "#{pane_pid}").stdout.strip()
        self.tmux("set-option", "-p", "-t", pane, "@tmux-pi-shell", pid)
        for option, value in (("@tms-root", str(self.root)), ("@tms-role", "anchor"),
                              ("@tms-project", "TestPi")):
            self.tmux("set-option", "-t", "TestPi", option, value)
        self.tmux("new-session", "-d", "-s", "TestPi/ms1-local", "-t", "TestPi")
        for option, value in (("@tms-root", str(self.root)), ("@tms-role", "view"),
                              ("@tms-project", "TestPi"), ("@tms-view", "ms1-local")):
            self.tmux("set-option", "-t", "TestPi/ms1-local", option, value)

        saved = self.script("save")

        self.assertEqual(0, saved.returncode, saved.stderr)
        data = json.loads(Path(self.env["TMUX_PI_STATE"]).read_text())
        self.assertEqual(["TestPi"], [session["name"] for session in data["sessions"]])
        self.assertEqual(str(self.root), data["sessions"][0]["tms_root"])
        self.tmux("kill-server")
        restored = self.script("restore")
        self.assertEqual(0, restored.returncode, restored.stderr)
        self.assertEqual("anchor", self.tmux("show-options", "-qv", "-t", "TestPi", "@tms-role").stdout.strip())
        self.assertEqual(str(self.root), self.tmux("show-options", "-qv", "-t", "TestPi", "@tms-root").stdout.strip())

    def test_layout_only_restore_does_not_launch_pi(self):
        session = self.root / "conversation.jsonl"
        session.write_text(json.dumps({"type": "session", "version": 3, "cwd": str(self.root),
                                       "id": "test-session", "timestamp": "2026-10-15T00:00:00Z"}) + "\n")
        pane = self.tmux("display-message", "-p", "-t", "TestPi:TODAY", "#{pane_id}").stdout.strip()
        pid = self.tmux("display-message", "-p", "-t", pane, "#{pane_pid}").stdout.strip()
        for option, value in (("@tmux-pi-file", str(session)), ("@tmux-pi-id", "test-session"),
                              ("@tmux-pi-pid", pid)):
            self.tmux("set-option", "-p", "-t", pane, option, value)
        self.tmux("split-window", "-h", "-t", "TestPi:TODAY", "-c", str(self.root))
        saved = self.script("save")
        self.assertEqual(0, saved.returncode, saved.stderr)
        self.tmux("kill-server")
        restored = self.script("restore", "--layout-only")
        self.assertEqual(0, restored.returncode, restored.stderr)
        self.assertFalse((self.root / "pi.args").exists())
        self.assertIn("0|TODAY|2", self.tmux("list-windows", "-t", "TestPi", "-F",
                                                  "#{window_index}|#{window_name}|#{window_panes}").stdout)

    def test_save_one_session_to_work_folder_and_restore_among_other_sessions(self):
        session = self.root / "conversation.jsonl"
        session.write_text(json.dumps({"type": "session", "version": 3, "cwd": str(self.root),
                                       "id": "test-session", "timestamp": "2026-10-15T00:00:00Z"}) + "\n")
        pane = self.tmux("display-message", "-p", "-t", "TestPi:TODAY", "#{pane_id}").stdout.strip()
        pid = self.tmux("display-message", "-p", "-t", pane, "#{pane_pid}").stdout.strip()
        for option, value in (("@tmux-pi-file", str(session)), ("@tmux-pi-id", "test-session"),
                              ("@tmux-pi-pid", pid)):
            self.tmux("set-option", "-p", "-t", pane, option, value)
        self.tmux("split-window", "-h", "-t", "TestPi:TODAY", "-c", str(self.root))
        self.assertEqual(0, self.script("save").returncode)
        original = Path(self.env["TMUX_PI_STATE"]).read_bytes()
        self.tmux("new-session", "-d", "-s", "OtherLive", "-c", str(self.root),
                  "exec -a pi /opt/homebrew/bin/node -e 'setInterval(() => {}, 1000)'")
        destination = self.root / "Hello Fresh" / ".pi" / "tmux-pi" / "snapshot.json"
        self.assertNotEqual(0, self.script("save").returncode)  # OtherLive is unverified
        self.assertEqual(0, self.script("status", "--session", "TestPi").returncode)
        scoped = self.script("save", "--session", "TestPi", "--file", str(destination))
        self.assertEqual(0, scoped.returncode, scoped.stderr)
        self.assertEqual(original, Path(self.env["TMUX_PI_STATE"]).read_bytes())
        self.assertEqual(0o700, destination.parent.stat().st_mode & 0o777)
        self.assertEqual(0o600, destination.stat().st_mode & 0o777)
        saved = json.loads(destination.read_text())
        self.assertEqual(["TestPi"], [s["name"] for s in saved["sessions"]])
        self.assertEqual(str(session), saved["sessions"][0]["windows"][0]["panes"][0]["session_file"])
        self.tmux("kill-session", "-t", "TestPi")
        self.assertEqual(0, self.script("restore", "--dry-run", "--file", str(destination)).returncode)
        restored = self.script("restore", "--file", str(destination))
        self.assertEqual(0, restored.returncode, restored.stderr)
        self.assertEqual({"OtherLive", "TestPi"}, set(self.tmux("list-sessions", "-F", "#{session_name}").stdout.splitlines()))
        self.assertIn("0|TODAY|2", self.tmux("list-windows", "-t", "TestPi", "-F",
                                                  "#{window_index}|#{window_name}|#{window_panes}").stdout)
        self.assertNotEqual(0, self.script("restore", "--file", str(destination)).returncode)

    def test_restore_inside_tmux_adds_named_windows_to_current_session(self):
        session = self.root / "conversation.jsonl"
        session.write_text(json.dumps({"type": "session", "version": 3, "cwd": str(self.root),
                                       "id": "today-session", "timestamp": "2026-10-15T00:00:00Z"}) + "\n")
        self.tmux("rename-window", "-t", "TestPi:TODAY", "keep")
        current_pane = self.tmux("display-message", "-p", "-t", "TestPi:keep", "#{pane_id}").stdout.strip()
        current_window = self.tmux("display-message", "-p", "-t", current_pane, "#{window_id}").stdout.strip()
        socket_path = self.tmux("display-message", "-p", "-t", current_pane, "#{socket_path}").stdout.strip()
        snapshot = {
            "version": 1,
            "sessions": [{
                "name": "ArchivedPi",
                "windows": [{
                    "index": 0,
                    "name": "TODAY",
                    "layout": "",
                    "active": True,
                    "panes": [{
                        "index": 0,
                        "id": "%999",
                        "cwd": str(self.root),
                        "active": True,
                        "session_file": str(session),
                        "session_id": "today-session",
                    }],
                }],
                "base_index": 0,
                "pane_base_index": 0,
            }],
        }
        state = Path(self.env["TMUX_PI_STATE"])
        state.parent.mkdir(parents=True)
        state.write_text(json.dumps(snapshot))
        self.env.update({"TMUX": f"{socket_path},1,0", "TMUX_PANE": current_pane})

        restored = self.script("restore")

        self.assertEqual(0, restored.returncode, restored.stderr)
        self.assertEqual(["TestPi"], self.tmux("list-sessions", "-F", "#{session_name}").stdout.splitlines())
        windows = self.tmux("list-windows", "-t", "TestPi", "-F", "#{window_name}").stdout.splitlines()
        self.assertEqual({"keep", "TODAY"}, set(windows))
        self.assertEqual(current_window, self.tmux("display-message", "-p", "-t", "TestPi", "#{window_id}").stdout.strip())
        import time
        for _ in range(20):
            if (self.root / "pi.args").exists():
                break
            time.sleep(0.1)
        self.assertEqual(f"--session {session} --name TODAY", (self.root / "pi.args").read_text().strip())
        repeated = self.script("restore")
        self.assertNotEqual(0, repeated.returncode)
        self.assertIn("window names already exist", repeated.stderr)
        self.assertEqual(2, len(self.tmux("list-windows", "-t", "TestPi", "-F", "#{window_id}").stdout.splitlines()))

    def test_work_folder_shortcut_uses_private_snapshot_directory(self):
        session = self.root / "conversation.jsonl"
        session.write_text(json.dumps({"type": "session", "version": 3, "cwd": str(self.root),
                                       "id": "test-session", "timestamp": "2026-10-15T00:00:00Z"}) + "\n")
        pane = self.tmux("display-message", "-p", "-t", "TestPi:TODAY", "#{pane_id}").stdout.strip()
        pid = self.tmux("display-message", "-p", "-t", pane, "#{pane_pid}").stdout.strip()
        for option, value in (("@tmux-pi-file", str(session)), ("@tmux-pi-id", "test-session"),
                              ("@tmux-pi-pid", pid)):
            self.tmux("set-option", "-p", "-t", pane, option, value)
        folder = self.root / "HelloFresh"
        folder.mkdir()
        result = self.script("save", "--session", "TestPi", "--work-folder", str(folder))
        self.assertEqual(0, result.returncode, result.stderr)
        destination = folder / ".pi" / "tmux-pi" / "snapshot.json"
        self.assertTrue(destination.is_file())
        self.assertEqual(0o700, destination.parent.stat().st_mode & 0o777)
        self.assertEqual(0o600, destination.stat().st_mode & 0o777)
        self.assertEqual(0, self.script("restore", "--dry-run", "--work-folder", str(folder)).returncode)
        self.assertFalse(Path(self.env["TMUX_PI_STATE"]).exists())

    def test_refuses_existing_public_destination_directory(self):
        folder = self.root / "public"
        folder.mkdir(mode=0o755)
        folder.chmod(0o755)
        result = self.script("save", "--file", str(folder / "snapshot.json"))
        self.assertNotEqual(0, result.returncode)
        self.assertEqual(0o755, folder.stat().st_mode & 0o777)
        self.assertFalse((folder / "snapshot.json").exists())

    def test_scoped_save_requires_file_and_exact_session_name(self):
        self.assertNotEqual(0, self.script("save", "--session", "TestPi").returncode)
        destination = self.root / "snapshot.json"
        result = self.script("save", "--session", "Test", "--file", str(destination))
        self.assertNotEqual(0, result.returncode)
        self.assertFalse(destination.exists())
        self.assertFalse(Path(self.env["TMUX_PI_STATE"]).exists())

    def test_save_rejects_unverified_node_and_leaves_existing_snapshot(self):
        existing = Path(self.env["TMUX_PI_STATE"])
        existing.parent.mkdir(parents=True)
        existing.write_text("previous good snapshot\n")
        result = self.script("save")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("UNRESOLVED", result.stderr)
        self.assertEqual("previous good snapshot\n", existing.read_text())

    def test_does_not_overwrite_live_sessions(self):
        pane = self.tmux("display-message", "-p", "-t", "TestPi:TODAY", "#{pane_id}").stdout.strip()
        pid = self.tmux("display-message", "-p", "-t", pane, "#{pane_pid}").stdout.strip()
        self.tmux("set-option", "-p", "-t", pane, "@tmux-pi-shell", pid)
        saved = self.script("save")
        self.assertEqual(0, saved.returncode, saved.stderr)
        result = self.script("restore")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("sessions already exist", result.stderr)
        self.assertEqual(1, len(self.tmux("list-sessions", "-F", "#{session_name}").stdout.splitlines()))


if __name__ == "__main__":
    unittest.main()
