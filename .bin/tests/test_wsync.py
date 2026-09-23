import importlib.machinery
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


wsync = importlib.machinery.SourceFileLoader("wsync", str(Path(__file__).parents[1] / "wsync")).load_module()


class RunRsyncPreviewTest(unittest.TestCase):
    def test_replaces_invalid_utf8_in_rsync_output(self):
        preview = wsync.run_rsync_preview(
            [
                sys.executable,
                "-c",
                "import sys; sys.stdout.buffer.write(b'bad\\xe2name\\n')",
            ]
        )

        self.assertTrue(preview.available)
        self.assertEqual(["bad\ufffdname"], preview.changed_lines)


class BuildPlainChunksTest(unittest.TestCase):
    def test_force_git_chunk_explains_why_it_cannot_be_applied(self):
        config = wsync.Config(
            config_home=Path("/tmp/wsync-config"),
            config_path=Path("/tmp/wsync-config/config.toml"),
            profiles_dir=Path("/tmp/wsync-config/profiles"),
            data={},
            parser_name="tomllib",
        )

        chunk = wsync.build_plain_chunks(
            action="pull",
            root=wsync.RootSpec(path=Path("/tmp/workspace"), source="test"),
            config=config,
            ssh_host=None,
            rsync_path="/usr/bin/rsync",
            rsync_version=None,
            work_dir=Path("/tmp"),
            force_git=True,
            force_git_reason="requested by --force-git",
        )[0]

        self.assertFalse(chunk.applyable)
        self.assertEqual("peer host is unconfigured", chunk.apply_error)
        self.assertIn("apply error = peer host is unconfigured", chunk.render())


class MissingPeerConfigurationTest(unittest.TestCase):
    def setUp(self):
        self.config = wsync.Config(
            config_home=Path("/tmp/wsync-config"),
            config_path=Path("/tmp/wsync-config/config.toml"),
            profiles_dir=Path("/tmp/wsync-config/profiles"),
            data={"machines": {"ms1": {"ssh_host": "10.10.10.4"}}},
            parser_name="tomllib",
        )

    def test_sync_fails_before_planning_when_current_host_has_no_ssh_host(self):
        with mock.patch.object(wsync.Config, "load", return_value=self.config), mock.patch.object(
            wsync, "current_hostname", return_value="mba1"
        ), mock.patch.object(wsync, "resolve_target") as resolve_target:
            with self.assertRaisesRegex(wsync.UserError, r"No SSH peer configured for host mba1"):
                wsync.main(["pull"])

        resolve_target.assert_not_called()

    def test_doctor_fails_when_peer_is_unconfigured(self):
        with tempfile.TemporaryDirectory() as state_home, mock.patch.dict(
            wsync.os.environ, {"WSYNC_STATE_HOME": state_home}
        ), mock.patch.object(wsync, "current_hostname", return_value="mba1"), mock.patch(
            "builtins.print"
        ):
            self.assertEqual(1, wsync.run_doctor(self.config))


class SelectedApplyErrorsTest(unittest.TestCase):
    def test_returns_reason_for_selected_blocked_chunk(self):
        plan = wsync.Plan(
            run_id="test",
            action="pull",
            target_label="workspace",
            plan_path=Path("/tmp/plan.txt"),
            chunks=[
                wsync.PlanChunk(
                    chunk_type="plain-dir",
                    path=Path("/tmp/workspace"),
                    direction="pull",
                    summary="Force-sync directory including Git metadata",
                    chunk_id="chunk-0001",
                    apply_error="peer host is unconfigured",
                )
            ],
        )

        self.assertEqual(
            ["peer host is unconfigured"],
            wsync.selected_apply_errors(plan, ["chunk-0001"]),
        )


class ProgressOutputTest(unittest.TestCase):
    def setUp(self):
        self.config = wsync.Config(
            config_home=Path("/tmp/wsync-config"),
            config_path=Path("/tmp/wsync-config/config.toml"),
            profiles_dir=Path("/tmp/wsync-config/profiles"),
            data={},
            parser_name="tomllib",
        )

    def build_plain_chunks_with_progress(self, enabled):
        stderr = io.StringIO()
        with mock.patch.object(wsync, "progress_enabled", return_value=enabled), mock.patch.object(
            wsync.sys, "stderr", stderr
        ):
            wsync.build_plain_chunks(
                action="pull",
                root=wsync.RootSpec(path=Path("/tmp/workspace"), source="test"),
                config=self.config,
                ssh_host=None,
                rsync_path="/usr/bin/rsync",
                rsync_version=None,
                work_dir=Path("/tmp"),
                force_git=True,
                force_git_reason="requested by --force-git",
            )
        return stderr.getvalue()

    def test_plan_phase_reports_steps_on_a_terminal(self):
        self.assertIn("rsync dry-run for /tmp/workspace", self.build_plain_chunks_with_progress(True))

    def test_plan_phase_stays_quiet_without_a_terminal(self):
        self.assertEqual("", self.build_plain_chunks_with_progress(False))

    def test_apply_streams_item_counter_and_still_logs_output(self):
        script = "print('sending incremental file list'); print('>f+++++++++ one.txt'); print('>f+++++++++ two.txt')"
        with tempfile.TemporaryDirectory() as work_dir:
            log_path = Path(work_dir) / "run.log"
            chunk = wsync.PlanChunk(
                chunk_type="plain-dir",
                path=Path(work_dir),
                direction="push",
                summary="Sync plain directory",
                chunk_id="chunk-0001",
                metadata={"apply_command": [sys.executable, "-c", script]},
            )
            stderr = io.StringIO()
            with mock.patch.object(wsync, "progress_enabled", return_value=True), mock.patch.object(
                wsync.sys, "stderr", stderr
            ):
                ok, detail = wsync.apply_rsync_chunk(chunk, log_path)

            self.assertTrue(ok)
            self.assertEqual("applied (2 changed line(s))", detail)
            self.assertIn("transferred 1 item(s)", stderr.getvalue())
            self.assertIn("transferred 2 item(s)", stderr.getvalue())
            self.assertIn(">f+++++++++ two.txt", log_path.read_text())


class SendResumeOffsetTest(unittest.TestCase):
    def test_aligns_partial_remote_size_down_to_chunk_boundary(self):
        chunk = wsync.SEND_CHUNK_BYTES

        self.assertEqual(0, wsync.send_resume_offset(0))
        self.assertEqual(0, wsync.send_resume_offset(chunk - 1))
        self.assertEqual(chunk, wsync.send_resume_offset(chunk))
        self.assertEqual(3 * chunk, wsync.send_resume_offset(3 * chunk + 17))


class ParseCliSendTest(unittest.TestCase):
    def test_send_takes_a_file_and_optional_remote_dir(self):
        command = wsync.parse_cli(["send", "clip.mov"])
        self.assertEqual("send", command.action)
        self.assertEqual("clip.mov", command.target)
        self.assertIsNone(command.dest)

        with_dest = wsync.parse_cli(["send", "clip.mov", "~/transfer"])
        self.assertEqual("~/transfer", with_dest.dest)

    def test_send_rejects_missing_file_and_force_git(self):
        with self.assertRaises(wsync.UserError):
            wsync.parse_cli(["send"])
        with self.assertRaises(wsync.UserError):
            wsync.parse_cli(["send", "clip.mov", "--force-git"])


if __name__ == "__main__":
    unittest.main()
