#!/usr/bin/env python3

import os
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

session_name() {
  local arg
  while [[ $# -gt 0 ]]; do
    arg=$1
    shift
    if [[ "$arg" == "-t" ]]; then
      printf '%s\n' "$1"
      return
    fi
  done
}

case "$command" in
  list-sessions)
    [[ -f "$state" ]] || exit 1
    if [[ "${2:-}" == *session_name* ]]; then
      cut -f1 "$state"
    else
      awk -F '\t' '{ print "0\t" $1 }' "$state"
    fi
    ;;
  show-options|display-message)
    name=$(session_name "$@")
    awk -F '\t' -v name="$name" '$1 == name { print $2 }' "$state"
    ;;
  has-session)
    name=$(session_name "$@")
    awk -F '\t' -v name="$name" '$1 == name { found=1 } END { exit !found }' "$state"
    ;;
  new-session)
    name=
    cwd=
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -s) name=$2; shift 2 ;;
        -c) cwd=$2; shift 2 ;;
        *) shift ;;
      esac
    done
    printf '%s\t%s\n' "$name" "$cwd" >> "$state"
    ;;
  set-option)
    name=$(session_name "$@")
    value=${!#}
    tmp=$(mktemp)
    awk -F '\t' -v OFS='\t' -v name="$name" -v value="$value" '$1 == name {$2=value} { print }' "$state" > "$tmp"
    mv "$tmp" "$state"
    ;;
  rename-session)
    old=$(session_name "$@")
    new=
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == "-n" ]]; then
        new=$2
        break
      fi
      shift
    done
    tmp=$(mktemp)
    awk -F '\t' -v OFS='\t' -v old="$old" -v new="$new" '$1 == old {$1=new} { print }' "$state" > "$tmp"
    mv "$tmp" "$state"
    ;;
  switch-client)
    printf '%s\n' "$2" >> "$log"
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

    def run_command(self, command, args=()):
        environment = dict(os.environ)
        environment.update(
            {
                "TMUX_BIN": str(self.fake_tmux),
                "FAKE_TMUX_STATE": str(self.state),
                "FAKE_TMUX_LOG": str(self.log),
                "TMUX": "1",
                "TMS_STATE_DIR": str(self.root / "state"),
            }
        )
        return subprocess.run(
            [str(command), *args],
            cwd=str(self.workdir),
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )

    def sessions(self):
        return [line.split("\t", 1)[0] for line in self.state.read_text().splitlines()]

    def switched_to(self):
        return self.log.read_text().splitlines()[-1]

    def test_tms_prefers_zero_and_uses_numeric_names(self):
        root = str(self.workdir)
        self.state.write_text(f"HelloFresh\t{root}\nHelloFresh1\t{root}\nHelloFresh0\t{root}\n")

        result = self.run_command(TMS, [str(self.workdir)])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("HelloFresh0", self.switched_to())

    def test_tms_normalizes_an_old_unsuffixed_session(self):
        root = str(self.workdir)
        self.state.write_text(f"HelloFresh\t{root}\n")

        result = self.run_command(TMS, [str(self.workdir)])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(["HelloFresh0"], self.sessions())
        self.assertEqual("HelloFresh0", self.switched_to())

    def test_tmn_starts_the_next_numeric_session(self):
        root = str(self.workdir)
        self.state.write_text(f"HelloFresh0\t{root}\n")

        result = self.run_command(TMN)

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("HelloFresh1", self.sessions())
        self.assertEqual("HelloFresh1", self.switched_to())


if __name__ == "__main__":
    unittest.main()
