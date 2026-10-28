import os
from pathlib import Path
import subprocess
import tempfile
import unittest


PI = Path(__file__).resolve().parents[1] / 'pi'


class PiVideoSkillsTests(unittest.TestCase):
    def run_pi(self, cwd, video_root):
        with tempfile.TemporaryDirectory() as temporary:
            fork_root = Path(temporary)
            cli = fork_root / 'packages/coding-agent/dist/cli.js'
            cli.parent.mkdir(parents=True)
            cli.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n')
            cli.chmod(0o755)
            return subprocess.run(
                [str(PI), '--print', 'test'], cwd=cwd,
                env={**os.environ, 'PI_FORK_ROOT': str(fork_root), 'PI_VIDEO_SKILLS_ROOT': str(video_root)},
                capture_output=True, text=True, check=True,
            ).stdout.splitlines()

    def test_loads_video_skills_only_under_video_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            videos = root / 'Videos'
            nested = videos / 'event/Production'
            elsewhere = root / 'Code'
            nested.mkdir(parents=True)
            elsewhere.mkdir()

            expected_skills = [
                str(Path.home() / '.agents/skills'),
                str(Path.home() / '.pi/agent/skills/software-tour-video'),
                str(Path.home() / '.pi/agent/skills/video-edit-prep'),
                str(Path.home() / '.pi/agent/skills/transcribe'),
                str(videos / '.pi/skills'),
            ]
            self.assertEqual(self.run_pi(nested, videos), [
                *sum((['--skill', skill] for skill in expected_skills), []), '--print', 'test',
            ])
            self.assertEqual(self.run_pi(elsewhere, videos), ['--print', 'test'])


if __name__ == '__main__':
    unittest.main()
