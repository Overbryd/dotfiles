#!/usr/bin/env python3

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "tmux" / "plugins" / "fzf-window-switcher" / "bin" / "fzf-window-switcher"

FAKE_TMUX = r'''#!/bin/bash
set -eu
command=$1
shift
printf '%s %s\n' "$command" "$*" >> "$FAKE_TMUX_LOG"

target_arg() {
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "-t" ]]; then printf '%s\n' "$2"; return; fi
    shift
  done
}

case "$command" in
  display-message)
    format=${!#}
    case "$format" in
      '#S') printf '%s\n' 'dotfiles/mba1-wssh' ;;
      '#{window_id}') printf '%s\n' '@dot1' ;;
      *) exit 1 ;;
    esac
    ;;
  show-options)
    target=$(target_arg "$@")
    option=${!#}
    [[ -n "$target" ]] || target='dotfiles/mba1-wssh'
    case "$target:$option" in
      'dotfiles/mba1-wssh:@tms-project') printf '%s\n' dotfiles ;;
      'dotfiles/mba1-wssh:@tms-role') printf '%s\n' view ;;
      'HelloFresh:@tms-project') printf '%s\n' HelloFresh ;;
      'HelloFresh:@tms-role') printf '%s\n' anchor ;;
      'HelloFresh:@tms-root') printf '%s\n' /work/HelloFresh ;;
      'dotfiles:@tms-project') printf '%s\n' dotfiles ;;
      'dotfiles:@tms-role') printf '%s\n' anchor ;;
      'dotfiles:@tms-root') printf '%s\n' /projects/dotfiles ;;
      'Legacy:@tms-role'|'Legacy:@tms-project'|'Legacy:@tms-root') ;;
    esac
    ;;
  list-sessions)
    cat <<'EOF'
HelloFresh
HelloFresh/mba1-wssh
dotfiles
dotfiles/mba1-wssh
Legacy
EOF
    ;;
  list-windows)
    target=$(target_arg "$@")
    case "$target" in
      '=HelloFresh') printf '%s\n' '@hf1|TODAY' '@hf2|logs' ;;
      '=HelloFresh/mba1-wssh') printf '%s\n' '@hf1|TODAY' '@hf2|logs' ;;
      '=dotfiles') printf '%s\n' '@dot1|bash' ;;
      '=dotfiles/mba1-wssh') printf '%s\n' '@dot1|bash' ;;
      '=Legacy') printf '%s\n' '@legacy1|server' ;;
      *) exit 1 ;;
    esac
    ;;
  select-window|switch-client)
    ;;
  *)
    printf 'unsupported fake tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
'''

FAKE_FZF = r'''#!/bin/bash
set -eu
cat > "$FAKE_FZF_INPUT"
if [[ -n "${FAKE_FZF_SELECT:-}" ]]; then
  grep -F "$FAKE_FZF_SELECT" "$FAKE_FZF_INPUT" | head -n 1
fi
'''

FAKE_TMS = r'''#!/bin/bash
set -eu
printf '%s\n' "$*" >> "$FAKE_TMS_LOG"
'''


class FzfWindowSwitcherTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.tmux_log = self.root / "tmux.log"
        self.tms_log = self.root / "tms.log"
        self.fzf_input = self.root / "fzf.input"
        self.fake_tmux = self.make_executable("tmux", FAKE_TMUX)
        self.fake_fzf = self.make_executable("fzf", FAKE_FZF)
        self.fake_tms = self.make_executable("tms", FAKE_TMS)

    def make_executable(self, name, content):
        path = self.root / name
        path.write_text(content)
        path.chmod(0o755)
        return path

    def run_switcher(self, selection=""):
        env = {
            **os.environ,
            "TMUX_CMD": str(self.fake_tmux),
            "FZF_BIN": str(self.fake_fzf),
            "TMS_BIN": str(self.fake_tms),
            "FAKE_TMUX_LOG": str(self.tmux_log),
            "FAKE_TMS_LOG": str(self.tms_log),
            "FAKE_FZF_INPUT": str(self.fzf_input),
            "FAKE_FZF_SELECT": selection,
        }
        return subprocess.run([str(SCRIPT)], env=env, text=True, capture_output=True, timeout=20)

    def test_lists_all_project_and_standalone_windows_without_grouped_view_duplicates(self):
        result = self.run_switcher()

        self.assertEqual(0, result.returncode, result.stderr)
        choices = self.fzf_input.read_text()
        self.assertEqual(1, choices.count("HelloFresh/TODAY"))
        self.assertEqual(1, choices.count("HelloFresh/logs"))
        self.assertEqual(1, choices.count("dotfiles/bash"))
        self.assertEqual(1, choices.count("Legacy/server"))

    def test_cross_project_selection_uses_tms_then_selects_the_window(self):
        result = self.run_switcher("HelloFresh/TODAY")

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("/work/HelloFresh", self.tms_log.read_text().strip())
        self.assertIn("select-window -t @hf1", self.tmux_log.read_text())

    def test_standalone_session_selection_switches_client_then_window(self):
        result = self.run_switcher("Legacy/server")

        self.assertEqual(0, result.returncode, result.stderr)
        commands = self.tmux_log.read_text()
        self.assertIn("switch-client -t =Legacy", commands)
        self.assertIn("select-window -t @legacy1", commands)
        self.assertFalse(self.tms_log.exists())


if __name__ == "__main__":
    unittest.main()
