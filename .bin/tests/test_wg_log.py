#!/usr/bin/env python3

import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


WG_LOG = Path(__file__).resolve().parents[1] / "wg-log"
HEADER_SIZE = 8
ENTRY_SIZE = 520
SLOTS = 2048


def build_log(path, entries, index):
    """Write a WireGuard ring log with entries placed as the app would wrap them."""

    data = bytearray(HEADER_SIZE + SLOTS * ENTRY_SIZE)
    struct.pack_into("<Q", data, 0, index)

    first_slot = (index - len(entries)) % SLOTS
    for position, (timestamp_ns, message) in enumerate(entries):
        slot = (first_slot + position) % SLOTS
        offset = HEADER_SIZE + slot * ENTRY_SIZE
        struct.pack_into("<Q", data, offset, timestamp_ns)
        encoded = message.encode("utf8")[:511]
        data[offset + 8 : offset + 8 + len(encoded)] = encoded

    path.write_bytes(bytes(data))


class WgLogTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log = Path(self.temp_dir.name) / "tunnel-log.bin"

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_wg_log(self, args=()):
        return subprocess.run(
            [sys.executable, str(WG_LOG), "--file", str(self.log), *args],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )

    def test_prints_wrapped_ring_in_chronological_order(self):
        base = 1_700_000_000_000_000_000
        entries = [(base + step * 1_000_000_000, "line {}".format(step)) for step in range(5)]
        # index past one full wrap, so the newest entries sit before the oldest in the file
        build_log(self.log, entries, index=SLOTS + 3)

        result = self.run_wg_log()

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(
            ["line 0", "line 1", "line 2", "line 3", "line 4"],
            [line.split(" ", 2)[2] for line in result.stdout.splitlines()],
        )

    def test_collapses_repeated_messages(self):
        base = 1_700_000_000_000_000_000
        entries = [(base, "Sending handshake initiation")]
        entries += [(base + step * 1_000_000, "Failed to send: broken pipe") for step in range(1, 4)]
        build_log(self.log, entries, index=len(entries))

        result = self.run_wg_log(["--collapse"])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(2, len(result.stdout.splitlines()))
        self.assertIn("[x3 until", result.stdout)

    def test_errors_filter_keeps_lifecycle_and_send_failures(self):
        base = 1_700_000_000_000_000_000
        entries = [
            (base, "[NET] Routine: encryption worker 8 - started"),
            (base + 1, "[NET] UDP bind has been updated"),
            (base + 2, "[NET] peer(x) - Failed to send handshake initiation: sendto: broken pipe"),
        ]
        build_log(self.log, entries, index=len(entries))

        result = self.run_wg_log(["--errors"])

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertNotIn("encryption worker", result.stdout)
        self.assertIn("UDP bind has been updated", result.stdout)
        self.assertIn("broken pipe", result.stdout)

    def test_missing_log_fails_clearly(self):
        result = self.run_wg_log()

        self.assertEqual(1, result.returncode)
        self.assertIn("no tunnel log at", result.stderr)


if __name__ == "__main__":
    unittest.main()
