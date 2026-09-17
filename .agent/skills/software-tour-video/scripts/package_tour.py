#!/usr/bin/env python3
"""Package a browser recording as a phone-friendly MP4 and verify it."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from fractions import Fraction
from pathlib import Path


def command(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        check=True,
        text=True,
        capture_output=capture,
    )


def probe(path: Path) -> dict:
    result = command(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate",
            "-of",
            "json",
            str(path),
        ],
        capture=True,
    )
    return json.loads(result.stdout)


def video_stream(metadata: dict) -> dict:
    streams = [stream for stream in metadata.get("streams", []) if stream.get("codec_type") == "video"]
    if len(streams) != 1:
        raise RuntimeError(f"expected exactly one video stream, got {len(streams)}")
    return streams[0]


def contact_sheet(video: Path, output: Path, metadata: dict, *, force: bool) -> None:
    if output.exists() and not force:
        raise FileExistsError(f"contact sheet exists: {output}")

    output.parent.mkdir(parents=True, exist_ok=True)
    stream = video_stream(metadata)
    duration = float(metadata["format"]["duration"])
    frame_rate = Fraction(stream.get("avg_frame_rate") or "25/1")
    frame_numbers = [max(0, round(duration * float(frame_rate) * point)) for point in (0.1, 0.5, 0.9)]
    selects = "+".join(f"eq(n\\,{number})" for number in frame_numbers)

    command(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y" if force else "-n",
            "-i",
            str(video),
            "-vf",
            f"select={selects},scale=480:-2,tile=3x1",
            "-frames:v",
            "1",
            str(output),
        ]
    )


def package(args: argparse.Namespace) -> dict:
    source = args.input.expanduser().resolve()
    output = args.output.expanduser().resolve()
    contact_path = args.contact_sheet.expanduser().resolve() if args.contact_sheet else None

    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise RuntimeError(f"required tool not found: {tool}")

    if not source.is_file():
        raise FileNotFoundError(source)
    if output.suffix.lower() != ".mp4":
        raise ValueError("output must use the .mp4 extension")
    if output.exists() and not args.force:
        raise FileExistsError(f"output exists: {output}; pass --force only with user approval")
    if contact_path and contact_path.exists() and not args.force:
        raise FileExistsError(
            f"contact sheet exists: {contact_path}; pass --force only with user approval"
        )
    if source == output:
        raise ValueError("input and output must differ")

    output.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(prefix=f".{output.stem}-", suffix=".mp4", dir=output.parent, delete=False)
    temporary = Path(handle.name)
    handle.close()

    try:
        ffmpeg = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-c:v",
            "libx264",
            "-preset",
            args.preset,
            "-crf",
            str(args.crf),
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ]

        if args.keep_audio:
            ffmpeg.extend(["-map", "0:a?", "-c:a", "aac", "-b:a", "160k"])
        else:
            ffmpeg.append("-an")

        ffmpeg.append(str(temporary))
        command(ffmpeg)

        command(["ffmpeg", "-v", "error", "-i", str(temporary), "-f", "null", "-"])
        metadata = probe(temporary)
        stream = video_stream(metadata)
        duration = float(metadata["format"]["duration"])

        if stream.get("codec_name") != "h264":
            raise RuntimeError(f"expected H.264, got {stream.get('codec_name')}")
        if stream.get("pix_fmt") != "yuv420p":
            raise RuntimeError(f"expected yuv420p, got {stream.get('pix_fmt')}")
        if duration <= 1:
            raise RuntimeError(f"video is unexpectedly short: {duration:.3f}s")
        if not stream.get("width") or not stream.get("height"):
            raise RuntimeError("video dimensions missing")

        os.replace(temporary, output)
        metadata = probe(output)

        if contact_path:
            contact_sheet(output, contact_path, metadata, force=args.force)

        return {
            "output": str(output),
            "duration_seconds": round(float(metadata["format"]["duration"]), 3),
            "size_bytes": int(metadata["format"]["size"]),
            "video": video_stream(metadata),
            "contact_sheet": str(contact_path) if contact_path else None,
        }
    finally:
        temporary.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Playwright/WebM or other source recording")
    parser.add_argument("output", type=Path, help="destination .mp4")
    parser.add_argument("--contact-sheet", type=Path, help="write an early/middle/late visual QC sheet")
    parser.add_argument("--crf", type=int, default=20)
    parser.add_argument("--preset", default="medium")
    parser.add_argument("--keep-audio", action="store_true", help="transcode source audio to AAC")
    parser.add_argument("--force", action="store_true", help="replace existing outputs")
    return parser.parse_args()


if __name__ == "__main__":
    try:
        print(json.dumps(package(parse_args()), indent=2))
    except (FileNotFoundError, FileExistsError, RuntimeError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error
