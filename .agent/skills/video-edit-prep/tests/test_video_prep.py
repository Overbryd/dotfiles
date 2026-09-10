import io
import json
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
import xml.etree.ElementTree as ET
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_ROOT / "scripts"))

import video_prep


class VideoPrepTest(unittest.TestCase):
    def test_infer_vertical_stack_of_two_16x9_feeds(self):
        self.assertEqual(
            video_prep.infer_layout(2560, 2880),
            {
                "type": "stacked-vertical",
                "angles": {
                    "top": [0, 0, 2560, 1440],
                    "bottom": [0, 1440, 2560, 1440],
                },
            },
        )

    def test_does_not_guess_stack_for_unrelated_shape(self):
        self.assertEqual(video_prep.infer_layout(1920, 1080), {"type": "single"})

    def test_parallel_map_preserves_input_order(self):
        def delayed(value):
            time.sleep(0.01 * (4 - value))
            return value * 2

        self.assertEqual(video_prep.parallel_map_ordered(delayed, [1, 2, 3], jobs=3), [2, 4, 6])

    def test_parallel_map_rejects_invalid_job_count(self):
        with self.assertRaisesRegex(video_prep.PrepError, "jobs must be at least 1"):
            video_prep.parallel_map_ordered(str, [1], jobs=0)

    def test_contact_sheet_interval_fills_short_clip_and_caps_long_clip_sampling(self):
        self.assertAlmostEqual(video_prep.contact_sheet_interval(1.0, 15, 50), 0.02)
        self.assertEqual(video_prep.contact_sheet_interval(1000, 15, 50), 15)

    def test_still_sample_interval_caps_work_without_undersampling_short_clips(self):
        self.assertEqual(video_prep.still_sample_interval(10, 1.0, 120), 1.0)
        self.assertEqual(video_prep.still_sample_interval(240, 1.0, 120), 2.0)
        with self.assertRaises(video_prep.PrepError):
            video_prep.still_sample_interval(10, 0, 120)

    def test_frame_metrics_and_pgm_hash_are_deterministic(self):
        metrics = "frame:0    pts:0 pts_time:1.5\nlavfi.blur=5.25\nlavfi.signalstats.YAVG=101.5\n"
        self.assertEqual(
            video_prep.parse_frame_metrics(metrics),
            [{
                "sample_index": 0,
                "timestamp_seconds": 1.5,
                "blur": 5.25,
                "luma_average": 101.5,
                "luma_low": 0.0,
                "luma_high": 0.0,
            }],
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "hash.pgm"
            path.write_bytes(b"P5\n16 16\n255\n" + bytes(range(256)))
            self.assertEqual(video_prep.pgm_average_hash(path), "ffffffff00000000")

    def test_still_ranking_prioritizes_people_and_rejects_near_duplicates(self):
        base = {
            "blur": 5.0, "luma_average": 112.0, "total_face_area": 0.04,
            "best_face_quality": 0.5, "best_face_confidence": 0.9,
            "largest_face_area": 0.04,
        }
        candidates = [
            dict(base, timestamp_seconds=0.0, face_count=0, perceptual_hash="0000000000000000"),
            dict(base, timestamp_seconds=4.0, face_count=1, perceptual_hash="ffffffffffffffff"),
            dict(base, timestamp_seconds=8.0, face_count=1, perceptual_hash="fffffffffffffffe"),
            dict(base, timestamp_seconds=12.0, face_count=3, blur=8.0, best_face_quality=1.0, perceptual_hash="aaaaaaaaaaaaaaaa"),
        ]

        selected = video_prep.rank_still_candidates(candidates, 2, allow_no_face=True)

        self.assertEqual([item["timestamp_seconds"] for item in selected], [4.0])

    def test_media_files_and_source_path_use_pl_videos_external_originals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = root / "project"
            external = root / "camera-originals"
            external.mkdir()
            source = external / "talk.mkv"
            source.touch()
            manifest = project / "Production" / "00_manifest" / "project-v001.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({
                "protocol": "pl-videos/project/v1",
                "originals_root": str(external),
            }))

            self.assertEqual(video_prep.originals_root(project), external.resolve())
            self.assertEqual(video_prep.media_files(project), [source.resolve()])
            self.assertEqual(video_prep.source_path(project, "talk.mkv"), source.resolve())

    def test_render_audio_defaults_reserve_headroom_for_aac(self):
        self.assertEqual(video_prep.render_audio_targets({}, {}), (-16.0, -2.5, 11.0))
        self.assertEqual(
            video_prep.render_audio_targets(
                {"target_lufs": -15, "render_true_peak_dbtp": -2.2, "loudness_range_lu": 9},
                {},
            ),
            (-15.0, -2.2, 9.0),
        )

    def test_manifest_hashes_are_keyed_by_resolved_source(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            source = project / "Originals" / "clip.mov"
            source.parent.mkdir()
            source.touch()
            manifest = project / "Production" / "00_manifest" / "sources.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(json.dumps({"sources": [{"source": str(source), "sha256": "abc123"}]}))

            self.assertEqual(video_prep.manifest_hashes(project), {source.resolve(): "abc123"})

    def test_extracts_panasonic_camera_metadata(self):
        xml = """<ClipMain xmlns="urn:test"><ClipContent><EssenceList><Video><BitDepth>8</BitDepth><StartTimecode>01:02:03:04</StartTimecode></Video></EssenceList><ClipMetadata><Access><CreationDate>2026-09-05T10:01:09+02:00</CreationDate></Access><Device><Manufacturer>Panasonic</Manufacturer><ModelName>DC-GH7</ModelName></Device></ClipMetadata></ClipContent><UserArea><AcquisitionMetadata><CameraUnitMetadata><ISOSensitivity>640</ISOSensitivity><Gamma><CaptureGamma>CINELIKE_D2</CaptureGamma></Gamma><Gamut><CaptureGamut>BT.709</CaptureGamut></Gamut></CameraUnitMetadata></AcquisitionMetadata></UserArea></ClipMain>"""
        probe = {"format": {"tags": {"creation_time": "2026-09-05T08:01:09Z", "com.panasonic.Semi-Pro.metadata.xml": xml}}}

        self.assertEqual(
            video_prep.camera_metadata(probe),
            {
                "creation_time_utc": "2026-09-05T08:01:09Z",
                "creation_time_local": "2026-09-05T10:01:09+02:00",
                "start_timecode": "01:02:03:04",
                "camera_manufacturer": "Panasonic",
                "camera_model": "DC-GH7",
                "iso": 640,
                "capture_gamma": "CINELIKE_D2",
                "capture_gamut": "BT.709",
                "bit_depth": 8,
            },
        )

    def test_promote_copies_only_qc_passed_review_and_optional_thumbnail(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            production = project / "Production"
            review = production / "06_reviews" / "talk.mp4"
            thumbnail = production / "05_resolve" / "talk-thumbnail.png"
            qc_report = production / "00_manifest" / "qc-talk.json"
            review.parent.mkdir(parents=True)
            thumbnail.parent.mkdir(parents=True)
            qc_report.parent.mkdir(parents=True)
            review.write_bytes(b"approved review")
            thumbnail.write_bytes(b"thumbnail")
            qc_report.write_text(json.dumps({
                "media": str(review.resolve()),
                "media_sha256": video_prep.sha256(review),
                "checks": {"decode": True, "cfr": True, "loudness": True, "true_peak": True},
            }))
            args = SimpleNamespace(
                project=str(project),
                review="06_reviews/talk.mp4",
                output="07_exports/talk.mp4",
                qc_report="00_manifest/qc-talk.json",
                thumbnail="05_resolve/talk-thumbnail.png",
                thumbnail_output="07_exports/talk-thumbnail.png",
                approved_by="user",
                approved_at="2026-09-09T12:00:00Z",
                manifest="00_manifest/delivery-talk-v001.json",
                force=False,
            )

            with redirect_stdout(io.StringIO()):
                video_prep.command_promote(args)

            exported = production / "07_exports" / "talk.mp4"
            exported_thumbnail = production / "07_exports" / "talk-thumbnail.png"
            delivery = json.loads((production / "00_manifest" / "delivery-talk-v001.json").read_text())
            self.assertEqual(exported.read_bytes(), review.read_bytes())
            self.assertEqual(exported_thumbnail.read_bytes(), thumbnail.read_bytes())
            self.assertEqual(delivery["export_sha256"], video_prep.sha256(review))
            self.assertEqual(delivery["thumbnail_sha256"], video_prep.sha256(thumbnail))
            self.assertEqual(delivery["approval"]["approved_by"], "user")

    def test_promote_rejects_failed_or_mismatched_qc(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            production = project / "Production"
            review = production / "06_reviews" / "talk.mp4"
            qc_report = production / "00_manifest" / "qc-talk.json"
            review.parent.mkdir(parents=True)
            qc_report.parent.mkdir(parents=True)
            review.write_bytes(b"review")
            qc_report.write_text(json.dumps({
                "media": str(review.resolve()),
                "media_sha256": video_prep.sha256(review),
                "checks": {"decode": True, "true_peak": False},
            }))
            args = SimpleNamespace(
                project=str(project), review="06_reviews/talk.mp4", output="07_exports/talk.mp4",
                qc_report="00_manifest/qc-talk.json", thumbnail=None, thumbnail_output=None,
                approved_by="user", approved_at="2026-09-09T12:00:00Z",
                manifest="00_manifest/delivery-talk-v001.json", force=False,
            )

            with self.assertRaisesRegex(video_prep.PrepError, "QC report does not pass"):
                video_prep.command_promote(args)

    def test_crop_to_fcpxml_transform_accounts_for_spatial_conform(self):
        scale, position = video_prep.crop_to_fcpxml_transform(
            source_width=2560,
            source_height=2880,
            output_width=1920,
            output_height=1080,
            crop=[0, 1440, 2560, 1440],
        )
        self.assertAlmostEqual(scale, 2.0, places=4)
        self.assertAlmostEqual(position[0], 0.0, places=4)
        self.assertAlmostEqual(position[1], 540.0, places=4)

    def test_static_gates_require_reason_for_close_and_overhead(self):
        plan = {
            "gates": {"wide_max": 1, "close_max": 1},
            "outputs": [
                {
                    "name": "bad",
                    "width": 1920,
                    "height": 1080,
                    "fps": 30,
                    "segments": [
                        {"source": "a.mkv", "in": 0, "out": 1, "shot": "close", "crop": [0, 0, 1920, 1080]},
                        {"source": "a.mkv", "in": 1, "out": 2, "shot": "overhead", "crop": [0, 1080, 1920, 1080]},
                    ],
                }
            ],
        }
        errors = video_prep.validate_plan_data(plan, check_sources=False)
        self.assertIn("bad segment 1: close requires reason", errors)
        self.assertIn("bad segment 2: overhead requires reason", errors)

    def test_static_gates_allow_medium_as_default_and_one_close(self):
        plan = {
            "gates": {"wide_max": 1, "close_max": 1},
            "outputs": [
                {
                    "name": "good",
                    "width": 1920,
                    "height": 1080,
                    "fps": 30,
                    "segments": [
                        {"source": "a.mkv", "in": 0, "out": 1, "shot": "wide", "crop": [0, 0, 1920, 1080]},
                        {"source": "a.mkv", "in": 1, "out": 2, "shot": "medium", "crop": [0, 0, 1920, 1080]},
                        {"source": "a.mkv", "in": 2, "out": 3, "shot": "medium", "crop": [0, 0, 1920, 1080]},
                        {"source": "a.mkv", "in": 3, "out": 4, "shot": "close", "reason": "decisive line", "crop": [0, 0, 1920, 1080]},
                    ],
                }
            ],
        }
        self.assertEqual(video_prep.validate_plan_data(plan, check_sources=False), [])

    def test_catalog_row_links_camera_audio_and_transcript_metadata(self):
        source = {"source": "/project/Originals/a.mov", "size": 123, "duration": 2.5, "sha256": "hash", "video": {"codec_name": "h264", "width": 3840, "height": 2160, "avg_frame_rate": "50/1"}, "audio": [{"volume": {"mean_db": -20.0, "max_db": -1.0}}], "camera_metadata": {"creation_time_local": "2026-09-05T09:00:00+02:00", "start_timecode": "01:00:00:00", "camera_model": "DC-GH7", "iso": 640, "capture_gamma": "CINELIKE_D2", "capture_gamut": "BT.709", "bit_depth": 8}}
        transcript = {"model": "qwen3", "language": "en", "diarized": False, "audio_ordinal_zero_based": 0, "audio_channel_zero_based": 1, "review_status": "raw machine transcript; not publication-ready"}

        row = video_prep.catalog_row(source, transcript, "02_transcripts/a-raw.json")

        self.assertEqual(row["source"], "a.mov")
        self.assertEqual(row["audio_max_db"], -1.0)
        self.assertEqual(row["transcript_model"], "qwen3")
        self.assertEqual(row["transcript_audio_channel"], 1)
        self.assertEqual(row["transcript_review_status"], "raw machine transcript; not publication-ready")
        self.assertEqual(row["category"], "")
        self.assertEqual(row["rating"], "")

    def test_catalog_rules_apply_in_order_and_reject_unknown_fields(self):
        row = {"source": "P1010200.MOV", "category": "", "rating": ""}
        rules = [
            {"from": "P1010190.MOV", "to": "P1010210.MOV", "fields": {"category": "event"}},
            {"source": "P1010200.MOV", "fields": {"rating": "4"}},
        ]

        self.assertEqual(video_prep.apply_catalog_rules(row, rules), {"source": "P1010200.MOV", "category": "event", "rating": "4"})
        with self.assertRaises(video_prep.PrepError):
            video_prep.apply_catalog_rules(row, [{"source": "P1010200.MOV", "fields": {"unknown": "x"}}])

    def test_transcript_path_uses_first_existing_label(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            transcripts = root / "Production" / "02_transcripts"
            transcripts.mkdir(parents=True)
            (transcripts / "P1010200-raw.json").write_text("{}")

            path = video_prep.transcript_path_for(root, "P1010200", ["corrected-v001", "raw"])

            self.assertEqual(path.name, "P1010200-raw.json")

    def test_transcript_inventory_row_records_machine_state_and_timing_defects(self):
        transcript = {
            "source": "/source/A.MOV", "source_sha256": "abc", "model": "qwen3", "language": "en", "duration": 10,
            "segments": [{"start": 0, "end": 4, "text": "a"}, {"start": 3, "end": 5, "text": "b"}, {"start": 7, "end": 10, "text": "c"}],
            "review_status": "raw machine transcript; not publication-ready",
        }

        row = video_prep.transcript_inventory_row(Path("A-raw.json"), transcript)

        self.assertEqual(row["workflow_state"], "machine_transcription")
        self.assertEqual(row["gap_count"], 1)
        self.assertEqual(row["overlap_count"], 1)
        self.assertEqual(row["publication_approval"], "not_approved")

    def test_catalog_stringout_skips_empty_transcripts_and_excluded_categories(self):
        rows = [
            {"source": "A.MOV", "duration_seconds": "2.5", "width": "3840", "height": "2160", "category": "event", "session": "one", "transcript_path": "a.json", "transcript_segments": "1"},
            {"source": "B.MOV", "duration_seconds": "3", "width": "3840", "height": "2160", "category": "event", "session": "two", "transcript_path": "b.json", "transcript_segments": "0"},
            {"source": "C.MOV", "duration_seconds": "4", "width": "3840", "height": "2160", "category": "interview", "session": "three", "transcript_path": "c.json", "transcript_segments": "2"},
        ]

        plan = video_prep.catalog_stringout_plan(rows, "Dialogue", 25, {"interview"})

        self.assertEqual([segment["source"] for segment in plan["outputs"][0]["segments"]], ["A.MOV"])
        self.assertEqual(plan["outputs"][0]["segments"][0]["crop"], [0, 0, 3840, 2160])

    def test_transcript_to_srt_formats_timestamps_and_text(self):
        transcript = {"segments": [{"start": 1.2, "end": 62.3456, "text": " Hello world. "}]}

        self.assertEqual(
            video_prep.transcript_to_srt(transcript),
            "1\n00:00:01,200 --> 00:01:02,346\nHello world.\n",
        )

    def test_transcription_terms_require_qwen3(self):
        self.assertEqual(video_prep.transcription_hint_args("qwen3", "RubyLLM,HiFuMi"), ["--terms", "RubyLLM,HiFuMi"])
        self.assertEqual(video_prep.transcription_hint_args("whisper", None), [])
        with self.assertRaisesRegex(video_prep.PrepError, "only supported by qwen3"):
            video_prep.transcription_hint_args("whisper", "RubyLLM")

    def test_diarization_args_require_diarize_for_speaker_count(self):
        self.assertEqual(video_prep.diarization_args(False, None), [])
        self.assertEqual(video_prep.diarization_args(True, 2), ["--diarize", "--speakers", "2"])
        with self.assertRaises(video_prep.PrepError):
            video_prep.diarization_args(False, 2)

    def test_mono_audio_args_selects_optional_stereo_channel(self):
        self.assertEqual(video_prep.mono_audio_args(None), ["-ac", "1"])
        self.assertEqual(video_prep.mono_audio_args(0), ["-af", "pan=mono|c0=c0", "-ac", "1"])
        self.assertEqual(video_prep.mono_audio_args(1), ["-af", "pan=mono|c0=c1", "-ac", "1"])

    def test_empty_transcript_marks_no_speech_without_fabricating_text(self):
        transcript = video_prep.empty_transcript("qwen3", "auto", 12.5)

        self.assertEqual(transcript["segments"], [])
        self.assertEqual(transcript["duration"], 12.5)
        self.assertEqual(transcript["recognition_status"], "no speech detected")

    def test_fcpxml_offsets_are_contiguous_and_match_sequence_duration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.mkv"
            source.touch()
            plan = {
                "name": "Test",
                "gates": {"wide_max": 1, "close_max": 1},
                "outputs": [
                    {
                        "name": "timeline",
                        "width": 1920,
                        "height": 1080,
                        "fps": 30,
                        "segments": [
                            {"source": str(source), "in": 1.01, "out": 2.01, "shot": "medium", "crop": [0, 0, 1920, 1080]},
                            {"source": str(source), "in": 4.0, "out": 5.5, "shot": "close", "reason": "peak", "crop": [0, 0, 1920, 1080]},
                        ],
                    }
                ],
            }
            metadata = {str(source.resolve()): {"width": 1920, "height": 1080, "duration": 10, "audio_sources": 1, "audio_channels": 2}}
            destination = root / "timeline.fcpxml"
            video_prep.write_fcpxml(plan, plan["outputs"][0], destination, metadata)

            tree = ET.parse(destination)
            sequence = tree.find(".//sequence")
            clips = tree.findall(".//spine/asset-clip")
            self.assertEqual(sequence.attrib["duration"], "75/30s")
            self.assertEqual(clips[0].attrib["offset"], "0/30s")
            self.assertEqual(clips[1].attrib["offset"], "30/30s")
            self.assertEqual(clips[1].attrib["duration"], "45/30s")


if __name__ == "__main__":
    unittest.main()
