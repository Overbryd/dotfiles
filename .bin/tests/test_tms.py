#!/usr/bin/env python3

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


TMS = Path(__file__).resolve().parents[1] / "tms"
TMN = Path(__file__).resolve().parents[1] / "tmn"

FAKE_TMUX = r'''#!/bin/bash
set -u
state=$FAKE_TMUX_STATE
log=$FAKE_TMUX_LOG
command=${1:-}
shift || true

clean_target() {
  local target=${1#=}
  printf '%s\n' "${target%:}"
}

target_arg() {
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "-t" ]]; then
      clean_target "$2"
      return
    fi
    shift
  done
}

field() {
  local name=$1 column=$2
  awk -F '\t' -v name="$name" -v column="$column" '$1 == name { print $column; exit }' "$state" 2>/dev/null
}

case "$command" in
  list-sessions)
    [[ -f "$state" ]] || exit 1
    format=${!#}
    if [[ "$format" == *session_activity* ]]; then
      awk -F '\t' '{ print "0\t" $1 }' "$state"
    else
      cut -f1 "$state"
    fi
    ;;
  show-options)
    name=$(target_arg "$@")
    [[ -n "$name" ]] || name=${FAKE_TMUX_CURRENT:-}
    option=${!#}
    case "$option" in
      @tms-root) field "$name" 2 ;;
      @tms-role) field "$name" 5 ;;
      @tms-project) field "$name" 6 ;;
      @tms-view) field "$name" 7 ;;
    esac
    ;;
  display-message)
    name=$(target_arg "$@")
    format=${!#}
    if [[ "$format" == '#S' ]]; then
      printf '%s\n' "${FAKE_TMUX_CURRENT:-}"
    elif [[ "$format" == *session_attached* ]]; then
      field "$name" 4
    else
      field "$name" 2
    fi
    ;;
  has-session)
    name=$(target_arg "$@")
    awk -F '\t' -v name="$name" '$1 == name { found=1 } END { exit !found }' "$state" 2>/dev/null
    ;;
  new-session)
    name=
    cwd=
    group=
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -s) name=$2; shift 2 ;;
        -c) cwd=$2; shift 2 ;;
        -t) group=$(clean_target "$2"); shift 2 ;;
        *) shift ;;
      esac
    done
    touch "$state"
    if [[ -n "$group" ]]; then
      cwd=$(field "$group" 2)
      existing_group=$(field "$group" 3)
      [[ -n "$existing_group" ]] && group=$existing_group
      tmp=$(mktemp)
      awk -F '\t' -v OFS='\t' -v anchor="$group" '$1 == anchor && $3 == "" {$3=anchor} { print }' "$state" > "$tmp"
      mv "$tmp" "$state"
    fi
    printf '%s\t%s\t%s\t0\t\t\t\n' "$name" "$cwd" "$group" >> "$state"
    ;;
  set-option)
    name=$(target_arg "$@")
    option=${@: -2:1}
    value=${!#}
    case "$option" in
      @tms-root) column=2 ;;
      @tms-role) column=5 ;;
      @tms-project) column=6 ;;
      @tms-view) column=7 ;;
      *) exit 0 ;;
    esac
    tmp=$(mktemp)
    awk -F '\t' -v OFS='\t' -v name="$name" -v column="$column" -v value="$value" \
      '$1 == name {$column=value} { print }' "$state" > "$tmp"
    mv "$tmp" "$state"
    ;;
  rename-session)
    old=$(target_arg "$@")
    new=
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == "-n" ]]; then new=$2; break; fi
      shift
    done
    tmp=$(mktemp)
    awk -F '\t' -v OFS='\t' -v old="$old" -v new="$new" \
      '$1 == old {$1=new} $3 == old {$3=new} { print }' "$state" > "$tmp"
    mv "$tmp" "$state"
    ;;
  switch-client)
    target=$(target_arg "$@")
    printf '%s\n' "$target" >> "$log"
    ;;
  refresh-client)
    ;;
  *)
    printf 'unsupported fake tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
'''


class TmsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.workdir = self.root / "HelloFresh"
        self.workdir.mkdir()
        self.state = self.root / "tmux.state"
        self.log = self.root / "tmux.log"
        self.fake_tmux = self.root / "tmux"
        self.fake_tmux.write_text(FAKE_TMUX)
        self.fake_tmux.chmod(0o755)

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_command(self, command=TMS, args=(), env=None):
        environment = dict(os.environ)
        environment.update(
            {
                "TMUX_BIN": str(self.fake_tmux),
                "FAKE_TMUX_STATE": str(self.state),
                "FAKE_TMUX_LOG": str(self.log),
                "FAKE_TMUX_CURRENT": "terminal",
                "TMUX": "1",
                "TMS_VIEW": "ms1-local",
                "TMS_STATE_DIR": str(self.root / "recent"),
            }
        )
        if env:
            environment.update(env)
        return subprocess.run(
            [str(command), *args],
            cwd=str(self.workdir),
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )

    def rows(self):
        if not self.state.exists():
            return {}
        rows = {}
        for line in self.state.read_text().splitlines():
            fields = line.split("\t")
            fields.extend([""] * (7 - len(fields)))
            rows[fields[0]] = fields
        return rows

    def switched_to(self):
        return self.log.read_text().splitlines()[-1]

    def test_creates_stable_project_anchor_and_grouped_local_view(self):
        result = self.run_command(args=[str(self.workdir)])

        self.assertEqual(0, result.returncode, result.stderr)
        rows = self.rows()
        self.assertEqual({"HelloFresh", "HelloFresh/ms1-local"}, set(rows))
        self.assertEqual("anchor", rows["HelloFresh"][4])
        self.assertEqual("HelloFresh", rows["HelloFresh/ms1-local"][2])
        self.assertEqual("view", rows["HelloFresh/ms1-local"][4])
        self.assertEqual("ms1-local", rows["HelloFresh/ms1-local"][6])
        self.assertEqual("HelloFresh/ms1-local", self.switched_to())

    def test_second_attached_client_gets_an_independent_numbered_view(self):
        first = self.run_command(args=[str(self.workdir)])
        self.assertEqual(0, first.returncode, first.stderr)
        rows = self.rows()
        rows["HelloFresh/ms1-local"][3] = "1"
        self.state.write_text("\n".join("\t".join(row) for row in rows.values()) + "\n")

        result = self.run_command(args=[str(self.workdir)])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("HelloFresh/ms1-local-2", self.rows())
        self.assertEqual("HelloFresh/ms1-local-2", self.switched_to())

    def test_switching_projects_keeps_this_clients_view_identity(self):
        other = self.root / "Other"
        other.mkdir()
        self.state.write_text(
            f"Other\t{other}\tOther\t0\tanchor\tOther\t\n"
            f"Other/ms1-local-2\t{other}\tOther\t1\tview\tOther\tms1-local-2\n"
        )

        result = self.run_command(
            args=[str(self.workdir)], env={"FAKE_TMUX_CURRENT": "Other/ms1-local-2"}
        )

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("HelloFresh/ms1-local-2", self.rows())
        self.assertEqual("HelloFresh/ms1-local-2", self.switched_to())

    def test_migrates_one_legacy_project_session_without_losing_it(self):
        self.state.write_text(f"HelloFresh0\t{self.workdir}\t\t0\t\t\t\n")

        result = self.run_command(args=[str(self.workdir)])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual({"HelloFresh", "HelloFresh/ms1-local"}, set(self.rows()))

    def test_refuses_to_merge_multiple_legacy_sessions(self):
        self.state.write_text(
            f"HelloFresh0\t{self.workdir}\t\t0\t\t\t\n"
            f"HelloFresh1\t{self.workdir}\t\t0\t\t\t\n"
        )

        result = self.run_command(args=[str(self.workdir)])

        self.assertEqual(1, result.returncode)
        self.assertIn("refusing to merge live sessions", result.stderr)
        self.assertEqual({"HelloFresh0", "HelloFresh1"}, set(self.rows()))

    def test_tmn_forces_another_view_not_another_project(self):
        first = self.run_command(args=[str(self.workdir)])
        self.assertEqual(0, first.returncode, first.stderr)

        result = self.run_command(command=TMN)

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("HelloFresh/ms1-local-2", self.rows())
        self.assertEqual("HelloFresh/ms1-local-2", self.switched_to())


@unittest.skipUnless(shutil.which("tmux"), "tmux is not installed")
class TmuxGroupBehaviorTest(unittest.TestCase):
    def test_grouped_views_share_windows_but_select_them_independently(self):
        socket = f"tms-test-{os.getpid()}"

        def tmux(*args):
            return subprocess.run(
                ["tmux", "-L", socket, "-f", "/dev/null", *args],
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            ).stdout.strip()

        try:
            tmux("new-session", "-d", "-s", "HelloFresh", "-n", "editor")
            tmux("new-window", "-d", "-t", "=HelloFresh:", "-n", "logs")
            tmux("new-session", "-d", "-s", "HelloFresh/ms1-local", "-t", "=HelloFresh")
            tmux("new-session", "-d", "-s", "HelloFresh/mba1-wssh", "-t", "=HelloFresh")
            tmux("select-window", "-t", "=HelloFresh/ms1-local:editor")
            tmux("select-window", "-t", "=HelloFresh/mba1-wssh:logs")

            self.assertEqual(
                "editor",
                tmux("display-message", "-p", "-t", "=HelloFresh/ms1-local:", "#{window_name}"),
            )
            self.assertEqual(
                "logs",
                tmux("display-message", "-p", "-t", "=HelloFresh/mba1-wssh:", "#{window_name}"),
            )
            self.assertEqual(
                tmux("list-windows", "-t", "=HelloFresh", "-F", "#{window_id}"),
                tmux("list-windows", "-t", "=HelloFresh/ms1-local", "-F", "#{window_id}"),
            )
        finally:
            subprocess.run(["tmux", "-L", socket, "kill-server"], stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    unittest.main()
