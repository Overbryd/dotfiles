#!/usr/bin/env python3
"""Local-first video edit preparation for pi.

Stdlib-only orchestration around ffmpeg, ffprobe, sayneat, Swift Vision, and
Resolve-Free-compatible FCPXML. Originals are read-only by policy.
"""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path.home() / "Library/CloudStorage/Dropbox-Personal/Videos"
MEDIA_EXTENSIONS = {".mkv", ".mov", ".mp4", ".m4v", ".avi", ".webm"}
PRODUCTION_DIRS = (
    "00_manifest",
    "01_analysis",
    "02_transcripts",
    "03_audio",
    "04_selects",
    "05_resolve",
    "06_reviews",
    "07_exports",
)
SKILL_ROOT = Path(__file__).resolve().parents[1]
FACE_SCRIPT = SKILL_ROOT / "scripts" / "face_landmarks.swift"
STILL_FACE_SCRIPT = SKILL_ROOT / "scripts" / "still_faces.swift"
DEFAULT_FILE_JOBS = min(8, max(1, (os.cpu_count() or 2) // 2))


class PrepError(RuntimeError):
    pass


def run(command: list[str], *, capture: bool = True, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=check, text=True, capture_output=capture)


def parallel_map_ordered(function: Any, items: list[Any], jobs: int) -> list[Any]:
    if jobs < 1:
        raise PrepError("jobs must be at least 1")
    if jobs == 1:
        return [function(item) for item in items]
    with ThreadPoolExecutor(max_workers=jobs, thread_name_prefix="video-prep") as executor:
        return list(executor.map(function, items))


def atomic_json(path: Path, data: Any, force: bool = False) -> None:
    ensure_writable(path, force)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def ensure_writable(path: Path, force: bool = False) -> None:
    if path.exists() and not force:
        raise PrepError(f"Refusing to overwrite existing file: {path}")


def originals_root(project: Path) -> Path:
    manifests = sorted(
        (project / "Production" / "00_manifest").glob("project-v*.json"),
        reverse=True,
    )
    manifests.append(project / "Production" / "project.json")
    for manifest in manifests:
        if not manifest.exists():
            continue
        try:
            document = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise PrepError(f"Invalid project manifest {manifest}: {error}") from error
        configured = document.get("originals_root") or document.get("originals")
        if configured:
            return Path(configured).expanduser().resolve()
    return (project / "Originals").resolve()


def ensure_outside_originals(path: Path, project: Path) -> None:
    originals = originals_root(project)
    resolved = path.resolve()
    if resolved == originals or originals in resolved.parents:
        raise PrepError(f"Output may not be inside Originals: {path}")


def project_path(value: str | Path) -> Path:
    path = Path(value).expanduser().resolve()
    return path.parent if path.name == "Originals" else path


def production_path(project: Path, relative: str) -> Path:
    path = Path(relative).expanduser()
    if not path.is_absolute():
        path = project / "Production" / path
    path = path.resolve()
    ensure_outside_originals(path, project)
    production = (project / "Production").resolve()
    if path != production and production not in path.parents:
        raise PrepError(f"Output must remain inside Production: {path}")
    return path


def media_files(project: Path, requested: list[str] | None = None) -> list[Path]:
    originals = originals_root(project)
    if requested:
        files = []
        for value in requested:
            path = Path(value).expanduser()
            if not path.is_absolute():
                path = originals / path
            files.append(path.resolve())
    else:
        files = sorted(path for path in originals.iterdir() if path.is_file() and path.suffix.lower() in MEDIA_EXTENSIONS)
    missing = [str(path) for path in files if not path.exists()]
    if missing:
        raise PrepError(f"Missing media: {', '.join(missing)}")
    if not files:
        raise PrepError(f"No media found in {originals}")
    return files


def contact_sheet_interval(duration: float, requested_interval: float, cells: int) -> float:
    return min(requested_interval, duration / max(1, cells))


def infer_layout(width: int, height: int) -> dict[str, Any]:
    half = height // 2
    if height % 2 == 0 and abs(width / half - 16 / 9) < 0.01:
        return {
            "type": "stacked-vertical",
            "angles": {
                "top": [0, 0, width, half],
                "bottom": [0, half, width, half],
            },
        }
    return {"type": "single"}


def probe_media(path: Path) -> dict[str, Any]:
    result = run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,size,bit_rate:format_tags:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels,channel_layout,color_range,color_space,color_transfer,color_primaries:stream_tags=title,language,timecode",
        "-of", "json", str(path),
    ])
    return json.loads(result.stdout)


def camera_metadata(probe: dict[str, Any]) -> dict[str, Any]:
    tags = probe.get("format", {}).get("tags", {})
    result: dict[str, Any] = {}
    if tags.get("creation_time"):
        result["creation_time_utc"] = tags["creation_time"]
    metadata_xml = tags.get("com.panasonic.Semi-Pro.metadata.xml")
    if not metadata_xml:
        return result
    try:
        root = ET.fromstring(metadata_xml)
    except ET.ParseError:
        return result

    values = {element.tag.rsplit("}", 1)[-1]: element.text for element in root.iter() if element.text}
    fields = {
        "CreationDate": "creation_time_local",
        "StartTimecode": "start_timecode",
        "Manufacturer": "camera_manufacturer",
        "ModelName": "camera_model",
        "CaptureGamma": "capture_gamma",
        "CaptureGamut": "capture_gamut",
    }
    result.update({output: values[source] for source, output in fields.items() if source in values})
    for source, output in (("ISOSensitivity", "iso"), ("BitDepth", "bit_depth")):
        if source in values:
            result[output] = int(values[source])
    return result


def normalized_metadata(path: Path, probe: dict[str, Any] | None = None) -> dict[str, Any]:
    probe = probe or probe_media(path)
    video = next((stream for stream in probe["streams"] if stream.get("codec_type") == "video"), None)
    if not video:
        raise PrepError(f"No video stream: {path}")
    audio = [stream for stream in probe["streams"] if stream.get("codec_type") == "audio"]
    return {
        "width": int(video["width"]),
        "height": int(video["height"]),
        "duration": float(probe["format"]["duration"]),
        "fps": fraction_float(video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"),
        "audio_sources": len(audio),
        "audio_channels": sum(int(stream.get("channels", 0)) for stream in audio),
        "probe": probe,
    }


def fraction_float(value: str) -> float:
    numerator, denominator = value.split("/", 1)
    return float(numerator) / float(denominator) if float(denominator) else 0.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def manifest_hashes(project: Path) -> dict[Path, str]:
    manifest = project / "Production" / "00_manifest" / "sources.json"
    if not manifest.exists():
        return {}
    data = json.loads(manifest.read_text(encoding="utf-8"))
    return {
        Path(record["source"]).resolve(): record["sha256"]
        for record in data.get("sources", [])
        if record.get("source") and record.get("sha256")
    }


def volume_scan(path: Path, ordinal: int, seconds: float) -> dict[str, float | None]:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-t", str(seconds), "-i", str(path),
        "-map", f"0:a:{ordinal}", "-af", "volumedetect", "-f", "null", "-",
    ], check=False)
    text = result.stderr
    mean = re.search(r"mean_volume:\s*(-?[\d.]+) dB", text)
    maximum = re.search(r"max_volume:\s*(-?[\d.]+) dB", text)
    return {
        "mean_db": float(mean.group(1)) if mean else None,
        "max_db": float(maximum.group(1)) if maximum else None,
    }


def source_path(project: Path, value: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = originals_root(project) / path
    return path.resolve()


def normalize_plan_sources(plan: dict[str, Any], project: Path) -> dict[str, Any]:
    normalized = copy.deepcopy(plan)
    for output in normalized.get("outputs", []):
        for segment in output.get("segments", []):
            segment["source"] = str(source_path(project, segment["source"]))
    return normalized


def validate_plan_data(plan: dict[str, Any], *, check_sources: bool = True) -> list[str]:
    errors: list[str] = []
    gates = plan.get("gates", {})
    outputs = plan.get("outputs")
    if not isinstance(outputs, list) or not outputs:
        return ["plan requires non-empty outputs"]

    for output in outputs:
        name = output.get("name", "unnamed")
        segments = output.get("segments", [])
        for key in ("width", "height", "fps"):
            if not isinstance(output.get(key), (int, float)) or output[key] <= 0:
                errors.append(f"{name}: invalid {key}")
        if not segments:
            errors.append(f"{name}: no segments")
            continue

        counts = Counter(segment.get("shot") for segment in segments)
        wide_max = int(output.get("gates", {}).get("wide_max", gates.get("wide_max", 1)))
        close_max = int(output.get("gates", {}).get("close_max", gates.get("close_max", 1)))
        close_absolute_max = int(gates.get("close_absolute_max", 2))
        if counts["wide"] > wide_max:
            errors.append(f"{name}: {counts['wide']} wide shots exceeds max {wide_max}")
        if counts["close"] > close_max:
            errors.append(f"{name}: {counts['close']} close shots exceeds max {close_max}")
        if counts["close"] > close_absolute_max:
            errors.append(f"{name}: close shots exceed absolute max {close_absolute_max}")

        for index, segment in enumerate(segments, 1):
            prefix = f"{name} segment {index}"
            if segment.get("shot") not in {"wide", "medium", "close", "overhead", "detail", "other"}:
                errors.append(f"{prefix}: invalid shot")
            if segment.get("shot") == "close" and not segment.get("reason"):
                errors.append(f"{prefix}: close requires reason")
            if segment.get("shot") in {"overhead", "detail"} and not segment.get("reason"):
                errors.append(f"{prefix}: overhead requires reason")
            if not isinstance(segment.get("in"), (int, float)) or not isinstance(segment.get("out"), (int, float)) or segment.get("out", 0) <= segment.get("in", 0):
                errors.append(f"{prefix}: invalid in/out")
            crop = segment.get("crop")
            if not isinstance(crop, list) or len(crop) != 4 or any(not isinstance(value, (int, float)) for value in crop) or min(crop[2:] or [0]) <= 0:
                errors.append(f"{prefix}: crop must be [x,y,width,height]")
            elif output.get("width") and output.get("height"):
                crop_ratio = crop[2] / crop[3]
                output_ratio = output["width"] / output["height"]
                if abs(crop_ratio - output_ratio) > 0.003:
                    errors.append(f"{prefix}: crop aspect does not match output")
            if check_sources and (not segment.get("source") or not Path(segment["source"]).exists()):
                errors.append(f"{prefix}: source missing")
    return errors


def catalog_row(source: dict[str, Any], transcript: dict[str, Any] | None, transcript_path: str = "") -> dict[str, Any]:
    video = source.get("video", {})
    audio = source.get("audio", [])
    volume = audio[0].get("volume", {}) if audio else {}
    camera = source.get("camera_metadata", {})
    segments = transcript.get("segments", []) if transcript else []
    transcript_end = max((segment.get("end", 0) for segment in segments), default="")
    return {
        "source": Path(source["source"]).name,
        "creation_time_local": camera.get("creation_time_local", ""),
        "creation_time_utc": camera.get("creation_time_utc", ""),
        "start_timecode": camera.get("start_timecode", ""),
        "duration_seconds": source.get("duration", ""),
        "size_bytes": source.get("size", ""),
        "sha256": source.get("sha256", ""),
        "camera_model": camera.get("camera_model", ""),
        "codec": video.get("codec_name", ""),
        "width": video.get("width", ""),
        "height": video.get("height", ""),
        "fps": video.get("avg_frame_rate") or video.get("r_frame_rate", ""),
        "bit_depth": camera.get("bit_depth", ""),
        "capture_gamma": camera.get("capture_gamma", ""),
        "capture_gamut": camera.get("capture_gamut", ""),
        "iso": camera.get("iso", ""),
        "audio_streams": len(audio),
        "audio_mean_db": volume.get("mean_db", ""),
        "audio_max_db": volume.get("max_db", ""),
        "transcript_path": transcript_path,
        "transcript_model": transcript.get("model", "") if transcript else "",
        "transcript_language": transcript.get("language", "") if transcript else "",
        "transcript_diarized": transcript.get("diarized", "") if transcript else "",
        "transcript_audio_ordinal": transcript.get("audio_ordinal_zero_based", "") if transcript else "",
        "transcript_audio_channel": transcript.get("audio_channel_zero_based", "") if transcript else "",
        "transcript_review_status": transcript.get("review_status", "") if transcript else "",
        "transcript_segments": len(segments) if transcript else "",
        "transcript_coverage_end": transcript_end,
        "visual_review_status": "",
        "category": "",
        "session": "",
        "shot_size": "",
        "camera_movement": "",
        "stabilization_need": "",
        "rating": "",
        "color_reference": "",
        "color_group": "",
        "people_confirmed": "",
        "keywords": "",
        "notes": "",
    }


def apply_catalog_rules(row: dict[str, Any], rules: list[dict[str, Any]]) -> dict[str, Any]:
    result = row.copy()
    source = result["source"]
    for rule in rules:
        exact = rule.get("source")
        start = rule.get("from")
        end = rule.get("to")
        matches = source == exact if exact is not None else start is not None and end is not None and start <= source <= end
        if not matches:
            continue
        fields = rule.get("fields", {})
        unknown = set(fields) - set(result)
        if unknown:
            raise PrepError(f"Unknown catalog annotation fields: {', '.join(sorted(unknown))}")
        result.update(fields)
    return result


def crop_to_fcpxml_transform(
    *, source_width: int, source_height: int, output_width: int, output_height: int, crop: list[float]
) -> tuple[float, tuple[float, float]]:
    x, y, width, height = crop
    desired_scale_x = output_width / width
    desired_scale_y = output_height / height
    if abs(desired_scale_x - desired_scale_y) > 0.005:
        raise PrepError("Crop and output aspect ratios differ")
    desired_scale = (desired_scale_x + desired_scale_y) / 2
    conform_scale = min(output_width / source_width, output_height / source_height)
    transform_scale = desired_scale / conform_scale
    crop_center_x = x + width / 2
    crop_center_y = y + height / 2
    position_x = (source_width / 2 - crop_center_x) * desired_scale
    position_y = (crop_center_y - source_height / 2) * desired_scale
    return transform_scale, (position_x, position_y)


def frame(value: float, fps: int) -> int:
    return int(math.floor(value * fps + 0.5))


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower()
    return cleaned or "timeline"


def write_fcpxml(
    plan: dict[str, Any], output: dict[str, Any], destination: Path, metadata: dict[str, dict[str, Any]], force: bool = False
) -> None:
    ensure_writable(destination, force)
    destination.parent.mkdir(parents=True, exist_ok=True)
    fps = int(output["fps"])
    width = int(output["width"])
    height = int(output["height"])

    root = ET.Element("fcpxml", {"version": "1.10"})
    resources = ET.SubElement(root, "resources")
    ET.SubElement(resources, "format", {
        "id": "r1", "name": f"VideoPrep{width}x{height}p{fps}", "width": str(width), "height": str(height),
        "frameDuration": f"1/{fps}s", "colorSpace": "1-1-1 (Rec. 709)",
    })

    sources = list(dict.fromkeys(str(Path(segment["source"]).resolve()) for segment in output["segments"]))
    refs: dict[str, str] = {}
    for index, source in enumerate(sources, 2):
        info = metadata[source]
        format_ref = f"r{index}"
        asset_ref = f"r{index + len(sources)}"
        refs[source] = asset_ref
        ET.SubElement(resources, "format", {
            "id": format_ref, "name": f"Source{info['width']}x{info['height']}", "width": str(info["width"]),
            "height": str(info["height"]), "frameDuration": f"1/{fps}s", "colorSpace": "1-1-1 (Rec. 709)",
        })
        asset = ET.SubElement(resources, "asset", {
            "id": asset_ref, "name": Path(source).stem, "start": "0s",
            "duration": f"{frame(info['duration'], fps)}/{fps}s", "hasVideo": "1",
            "hasAudio": "1" if info.get("audio_sources", 0) else "0", "format": format_ref,
            "audioSources": str(info.get("audio_sources", 0)), "audioChannels": str(info.get("audio_channels", 0)),
            "audioRate": "48000",
        })
        ET.SubElement(asset, "media-rep", {"kind": "original-media", "src": Path(source).as_uri()})

    event = ET.SubElement(root, "event", {"name": plan.get("name", "Video Prep")})
    project = ET.SubElement(event, "project", {"name": output["name"]})
    durations = [max(1, frame(segment["out"], fps) - frame(segment["in"], fps)) for segment in output["segments"]]
    sequence = ET.SubElement(project, "sequence", {
        "format": "r1", "duration": f"{sum(durations)}/{fps}s", "tcStart": "0s", "tcFormat": "NDF",
        "audioLayout": "stereo", "audioRate": "48k",
    })
    spine = ET.SubElement(sequence, "spine")
    offset = 0
    for index, (segment, duration) in enumerate(zip(output["segments"], durations), 1):
        source = str(Path(segment["source"]).resolve())
        item = ET.SubElement(spine, "asset-clip", {
            "ref": refs[source], "name": f"{index:02d} {segment['shot'].upper()} {segment.get('label', '')}".strip(),
            "offset": f"{offset}/{fps}s", "start": f"{frame(segment['in'], fps)}/{fps}s",
            "duration": f"{duration}/{fps}s", "audioRole": "Dialogue",
        })
        info = metadata[source]
        scale, position = crop_to_fcpxml_transform(
            source_width=info["width"], source_height=info["height"], output_width=width, output_height=height,
            crop=segment["crop"],
        )
        ET.SubElement(item, "adjust-transform", {
            "position": f"{position[0]:.1f} {position[1]:.1f}", "scale": f"{scale:.4f} {scale:.4f}",
        })
        if segment.get("reason"):
            ET.SubElement(item, "marker", {
                "start": f"{frame(segment['in'], fps)}/{fps}s", "duration": f"1/{fps}s",
                "value": segment["reason"],
            })
        offset += duration

    ET.indent(root, space="  ")
    body = ET.tostring(root, encoding="unicode")
    destination.write_text('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n' + body + "\n", encoding="utf-8")


def load_plan(path: Path, project: Path) -> dict[str, Any]:
    plan = json.loads(path.read_text(encoding="utf-8"))
    return normalize_plan_sources(plan, project)


def selected_outputs(plan: dict[str, Any], name: str | None) -> list[dict[str, Any]]:
    outputs = plan["outputs"]
    if name is None:
        return outputs
    selected = [output for output in outputs if output["name"] == name]
    if not selected:
        raise PrepError(f"Unknown output: {name}")
    return selected


def ffmpeg_input_map(output: dict[str, Any]) -> tuple[list[Path], dict[str, int]]:
    sources = list(dict.fromkeys(Path(segment["source"]).resolve() for segment in output["segments"]))
    return sources, {str(source): index for index, source in enumerate(sources)}


def audio_concat_filter(output: dict[str, Any], source_indexes: dict[str, int], ordinal: int) -> tuple[list[str], str]:
    counts = Counter(str(Path(segment["source"]).resolve()) for segment in output["segments"])
    positions: defaultdict[str, int] = defaultdict(int)
    filters: list[str] = []
    labels: dict[tuple[str, int], str] = {}
    for source, count in counts.items():
        index = source_indexes[source]
        split_labels = "".join(f"[as{index}_{item}]" for item in range(count))
        filters.append(f"[{index}:a:{ordinal}]asplit={count}{split_labels}")
    result_labels = []
    for index, segment in enumerate(output["segments"]):
        source = str(Path(segment["source"]).resolve())
        occurrence = positions[source]
        positions[source] += 1
        source_index = source_indexes[source]
        label = f"as{source_index}_{occurrence}"
        filters.append(
            f"[{label}]atrim=start={segment['in']}:end={segment['out']},asetpts=PTS-STARTPTS[a{index}]"
        )
        result_labels.append(f"[a{index}]")
    filters.append("".join(result_labels) + f"concat=n={len(result_labels)}:v=0:a=1[acat]")
    return filters, "acat"


def render_audio_targets(output: dict[str, Any], plan: dict[str, Any]) -> tuple[float, float, float]:
    target_lufs = float(output.get("target_lufs", plan.get("target_lufs", -16)))
    true_peak = float(output.get("render_true_peak_dbtp", plan.get("render_true_peak_dbtp", -2.5)))
    loudness_range = float(output.get("loudness_range_lu", plan.get("loudness_range_lu", 11)))
    return target_lufs, true_peak, loudness_range


def measure_loudness(
    sources: list[Path], output: dict[str, Any], ordinal: int, highpass: int,
    target_lufs: float, true_peak: float, loudness_range: float,
) -> dict[str, str]:
    source_indexes = {str(source): index for index, source in enumerate(sources)}
    filters, label = audio_concat_filter(output, source_indexes, ordinal)
    filters.append(
        f"[{label}]highpass=f={highpass},loudnorm=I={target_lufs}:TP={true_peak}:"
        f"LRA={loudness_range}:print_format=json[measure]"
    )
    command = ["ffmpeg", "-hide_banner", "-nostats"]
    for source in sources:
        command += ["-i", str(source)]
    command += ["-filter_complex", ";".join(filters), "-map", "[measure]", "-f", "null", "-"]
    result = run(command, check=False)
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr, re.DOTALL)
    if not matches:
        raise PrepError("Could not parse loudnorm measurement")
    return json.loads(matches[-1])


def render_output(project: Path, output: dict[str, Any], plan: dict[str, Any], force: bool) -> Path:
    sources, source_indexes = ffmpeg_input_map(output)
    fps = int(output["fps"])
    width = int(output["width"])
    height = int(output["height"])
    ordinal = int(output.get("audio_ordinal", plan.get("audio_ordinal", 0)))
    highpass = int(output.get("highpass_hz", plan.get("highpass_hz", 70)))
    target_lufs, true_peak, loudness_range = render_audio_targets(output, plan)
    loudness = measure_loudness(
        sources, output, ordinal, highpass, target_lufs, true_peak, loudness_range,
    )

    counts = Counter(str(Path(segment["source"]).resolve()) for segment in output["segments"])
    positions: defaultdict[str, int] = defaultdict(int)
    filters: list[str] = []
    for source, count in counts.items():
        index = source_indexes[source]
        video_labels = "".join(f"[vs{index}_{item}]" for item in range(count))
        filters.append(f"[{index}:v]split={count}{video_labels}")
    audio_filters, audio_label = audio_concat_filter(output, source_indexes, ordinal)
    filters += audio_filters

    video_labels = []
    for index, segment in enumerate(output["segments"]):
        source = str(Path(segment["source"]).resolve())
        occurrence = positions[source]
        positions[source] += 1
        source_index = source_indexes[source]
        x, y, crop_width, crop_height = segment["crop"]
        filters.append(
            f"[vs{source_index}_{occurrence}]trim=start={segment['in']}:end={segment['out']},setpts=PTS-STARTPTS,"
            f"crop={crop_width}:{crop_height}:{x}:{y},scale={width}:{height}:flags=lanczos,setsar=1[v{index}]"
        )
        video_labels.append(f"[v{index}]")
    filters.append("".join(video_labels) + f"concat=n={len(video_labels)}:v=1:a=0,fps={fps}[vout]")
    filters.append(
        f"[{audio_label}]highpass=f={highpass},loudnorm=I={target_lufs}:TP={true_peak}:LRA={loudness_range}:"
        f"measured_I={loudness['input_i']}:measured_TP={loudness['input_tp']}:"
        f"measured_LRA={loudness['input_lra']}:measured_thresh={loudness['input_thresh']}:"
        f"offset={loudness['target_offset']}:linear=true,aresample=48000[aout]"
    )

    relative = output.get("review_file", f"06_reviews/{slug(output['name'])}.mp4")
    destination = production_path(project, relative)
    ensure_writable(destination, force)
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-hide_banner", "-stats_period", "30", "-y" if force else "-n"]
    for source in sources:
        command += ["-i", str(source)]
    command += [
        "-filter_complex", ";".join(filters), "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", output.get("preset", "medium"), "-crf", str(output.get("crf", 18)),
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-color_range", "tv", "-colorspace", "bt709",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", "-video_track_timescale", str(fps * 1000), "-shortest", str(destination),
    ]
    run(command, capture=False)
    return destination


def loudness_stats(path: Path) -> dict[str, float]:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0", "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-",
    ], check=False)
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr, re.DOTALL)
    if not matches:
        raise PrepError("Could not measure output loudness")
    data = json.loads(matches[-1])
    return {"lufs_i": float(data["input_i"]), "true_peak_dbtp": float(data["input_tp"]), "lra": float(data["input_lra"])}


def command_doctor(args: argparse.Namespace) -> None:
    tools = {}
    for tool in ("ffmpeg", "ffprobe", "sayneat", "swift", "xmllint"):
        tools[tool] = shutil.which(tool)
    tools["video_root"] = str(Path(args.root).expanduser())
    tools["video_root_exists"] = Path(args.root).expanduser().exists()
    print(json.dumps(tools, indent=2))
    if not all(tools[tool] for tool in ("ffmpeg", "ffprobe", "sayneat")):
        raise PrepError("Required tools missing")


def command_init(args: argparse.Namespace) -> None:
    root = Path(args.root).expanduser().resolve()
    project = (root / args.name).resolve()
    if root not in project.parents:
        raise PrepError("Project must be a child of video root")
    (project / "Originals").mkdir(parents=True, exist_ok=True)
    for directory in PRODUCTION_DIRS:
        (project / "Production" / directory).mkdir(parents=True, exist_ok=True)
    config = project / "Production" / "project.json"
    if not config.exists():
        atomic_json(config, {
            "version": 1,
            "name": args.name,
            "project": str(project),
            "originals": str(project / "Originals"),
            "production": str(project / "Production"),
            "defaults": {"language": None, "audio_ordinal": None, "fps": 30},
        })
    print(project)


def command_inspect(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    known_hashes = manifest_hashes(project)

    def inspect_one(path: Path) -> dict[str, Any]:
        probe = probe_media(path)
        info = normalized_metadata(path, probe)
        audio = [stream for stream in probe["streams"] if stream.get("codec_type") == "audio"]
        record = {
            "source": str(path), "size": int(probe["format"]["size"]), "duration": info["duration"],
            "video": next(stream for stream in probe["streams"] if stream.get("codec_type") == "video"),
            "layout_suggestion": infer_layout(info["width"], info["height"]),
            "audio": [dict(stream, ordinal=index, volume=volume_scan(path, index, args.seconds)) for index, stream in enumerate(audio)],
            "camera_metadata": camera_metadata(probe),
        }
        if args.checksum:
            record["sha256"] = known_hashes[path] if path in known_hashes else sha256(path)
        return record

    records = parallel_map_ordered(inspect_one, media_files(project, args.file), args.jobs)
    destination = production_path(project, args.output)
    atomic_json(destination, {"version": 1, "sample_seconds": args.seconds, "sources": records}, args.force)
    print(destination)


def transcription_hint_args(model: str, terms: str | None) -> list[str]:
    if terms and model != "qwen3":
        raise PrepError("--terms is only supported by qwen3 transcription")
    return ["--terms", terms] if terms else []


def diarization_args(diarize: bool, speakers: int | None) -> list[str]:
    if speakers is not None and not diarize:
        raise PrepError("--speakers requires --diarize")
    return ["--diarize", *(["--speakers", str(speakers)] if speakers is not None else [])] if diarize else []


def mono_audio_args(channel: int | None) -> list[str]:
    channel_filter = ["-af", f"pan=mono|c0=c{channel}"] if channel is not None else []
    return [*channel_filter, "-ac", "1"]


def srt_timestamp(seconds: float) -> str:
    milliseconds = round(float(seconds) * 1000)
    if milliseconds < 0:
        raise PrepError("Subtitle timestamps cannot be negative")
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def transcript_to_srt(transcript: dict[str, Any]) -> str:
    blocks = []
    for segment in transcript.get("segments", []):
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        start = float(segment["start"])
        end = float(segment["end"])
        if end < start:
            raise PrepError(f"Subtitle segment ends before it starts: {start}–{end}")
        blocks.append(f"{len(blocks) + 1}\n{srt_timestamp(start)} --> {srt_timestamp(end)}\n{text}")
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def transcript_inventory_row(path: Path, transcript: dict[str, Any]) -> dict[str, Any]:
    segments = sorted(transcript.get("segments", []), key=lambda segment: (float(segment["start"]), float(segment["end"])))
    gap_count = overlap_count = 0
    max_gap = 0.0
    covered_until: float | None = None
    for segment in segments:
        start = float(segment["start"])
        end = float(segment["end"])
        if covered_until is not None:
            if start > covered_until:
                gap_count += 1
                max_gap = max(max_gap, start - covered_until)
            elif start < covered_until:
                overlap_count += 1
        covered_until = end if covered_until is None else max(covered_until, end)
    derivative_type = transcript.get("derivative_type", "")
    workflow_state = "machine_translation" if derivative_type else "machine_transcription"
    return {
        "file": path.name,
        "source": Path(transcript.get("source", "")).name,
        "source_sha256": transcript.get("source_sha256", ""),
        "workflow_state": workflow_state,
        "model": transcript.get("model", ""),
        "language": transcript.get("language", ""),
        "derivative_type": derivative_type,
        "translation_source": transcript.get("translation_source", ""),
        "audio_ordinal_zero_based": transcript.get("audio_ordinal_zero_based", ""),
        "audio_channel_zero_based": transcript.get("audio_channel_zero_based", ""),
        "diarized": transcript.get("diarized", ""),
        "requested_speakers": transcript.get("requested_speakers", ""),
        "terms_supplied": bool(transcript.get("terms")),
        "duration_seconds": transcript.get("duration", ""),
        "segment_count": len(segments),
        "coverage_start": min((float(segment["start"]) for segment in segments), default=""),
        "coverage_end": max((float(segment["end"]) for segment in segments), default=""),
        "gap_count": gap_count,
        "max_gap_seconds": round(max_gap, 6),
        "overlap_count": overlap_count,
        "review_status": transcript.get("review_status", ""),
        "human_correction": "not_started",
        "publication_approval": "not_approved",
    }


def empty_transcript(model: str, language: str, duration: float) -> dict[str, Any]:
    return {
        "model": model,
        "language": language,
        "duration": duration,
        "sample_rate": 16000,
        "diarized": False,
        "segments": [],
        "recognition_status": "no speech detected",
    }


def command_transcribe(args: argparse.Namespace) -> None:
    transcription_hint_args(args.model, args.terms)
    project = project_path(args.project)
    destination_dir = project / "Production" / "02_transcripts"
    destination_dir.mkdir(parents=True, exist_ok=True)
    paths = media_files(project, args.file)
    known_hashes = manifest_hashes(project)
    output_label = args.output_label or "raw"
    if not re.fullmatch(r"[A-Za-z0-9._-]+", output_label):
        raise PrepError("output label may contain only letters, numbers, dot, underscore, and hyphen")
    for path in paths:
        ensure_writable(destination_dir / f"{path.stem}-{output_label}.json", args.force)

    def transcribe_one(path: Path) -> Path:
        destination = destination_dir / f"{path.stem}-{output_label}.json"
        with tempfile.TemporaryDirectory(prefix="video-prep-asr-") as directory:
            audio = Path(directory) / f"{path.stem}.wav"
            run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-map", f"0:a:{args.audio_ordinal}",
                *mono_audio_args(args.audio_channel), "-ar", "16000", "-c:a", "pcm_s16le", str(audio), "-y",
            ], capture=False)
            temporary = Path(directory) / "raw.json"
            command = [
                "sayneat", "--transcribe", "--transcribe-model", args.model, "--transcript-format", "json",
                "--language", args.language, "-o", str(temporary), str(audio),
            ]
            command[1:1] = diarization_args(args.diarize, args.speakers)
            command[1:1] = transcription_hint_args(args.model, args.terms)
            result = run(command, check=False)
            if result.returncode == 0:
                transcript = json.loads(temporary.read_text(encoding="utf-8"))
            elif "returned no text" in (result.stdout + result.stderr).lower():
                transcript = empty_transcript(args.model, args.language, normalized_metadata(path)["duration"])
            else:
                raise subprocess.CalledProcessError(result.returncode, command, result.stdout, result.stderr)
        transcript.update({
            "source": str(path), "source_sha256": known_hashes[path] if path in known_hashes else sha256(path), "audio_ordinal_zero_based": args.audio_ordinal,
            "audio_channel_zero_based": args.audio_channel,
            "review_status": "raw machine transcript; not publication-ready",
        })
        atomic_json(destination, transcript, args.force)
        return destination

    for destination in parallel_map_ordered(transcribe_one, paths, args.jobs):
        print(destination)


def command_transcript_inventory(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    directory = project / "Production" / "02_transcripts"
    rows = [transcript_inventory_row(path, json.loads(path.read_text(encoding="utf-8"))) for path in sorted(directory.glob("*.json"))]
    if not rows:
        raise PrepError(f"No transcript JSON files in: {directory}")
    destination = production_path(project, args.output)
    ensure_writable(destination, args.force)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(destination)
    print(destination)


def command_subtitles(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    destination_dir = production_path(project, args.output_dir)
    paths = [production_path(project, value) for value in args.transcript]
    destinations = [destination_dir / f"{path.stem}.srt" for path in paths]
    for destination in destinations:
        ensure_writable(destination, args.force)
    destination_dir.mkdir(parents=True, exist_ok=True)
    for path, destination in zip(paths, destinations):
        transcript = json.loads(path.read_text(encoding="utf-8"))
        temporary = destination.with_name(f".{destination.name}.tmp")
        temporary.write_text(transcript_to_srt(transcript), encoding="utf-8")
        temporary.replace(destination)
        print(destination)


def still_sample_interval(duration: float, minimum_interval: float, max_samples: int) -> float:
    if minimum_interval <= 0:
        raise PrepError("still sample interval must be positive")
    if max_samples < 1:
        raise PrepError("still max samples must be at least 1")
    return max(minimum_interval, duration / max_samples)


def parse_frame_metrics(text: str) -> list[dict[str, float]]:
    frames = []
    for block in re.split(r"(?=frame:\d+)", text):
        frame_match = re.search(r"frame:(\d+)", block)
        timestamp_match = re.search(r"pts_time:([-\d.]+)", block)
        if not frame_match or not timestamp_match:
            continue
        values = {
            key: float(value)
            for key, value in re.findall(r"lavfi\.([A-Za-z0-9_.]+)=([-\d.]+)", block)
        }
        frames.append({
            "sample_index": int(frame_match.group(1)),
            "timestamp_seconds": float(timestamp_match.group(1)),
            "blur": values.get("blur", math.inf),
            "luma_average": values.get("signalstats.YAVG", 0.0),
            "luma_low": values.get("signalstats.YLOW", 0.0),
            "luma_high": values.get("signalstats.YHIGH", 0.0),
        })
    return frames


def pgm_average_hash(path: Path) -> str:
    data = path.read_bytes()
    match = re.match(rb"P5\s+(\d+)\s+(\d+)\s+(\d+)\s", data)
    if not match:
        raise PrepError(f"Invalid binary PGM: {path}")
    width, height, maximum = map(int, match.groups())
    pixels = data[match.end():]
    if (width, height, maximum, len(pixels)) != (16, 16, 255, 256):
        raise PrepError(f"Unexpected PGM dimensions/depth: {path}")
    reduced = [
        sum(pixels[(row * 2 + dy) * 16 + column * 2 + dx] for dy in range(2) for dx in range(2)) / 4
        for row in range(8)
        for column in range(8)
    ]
    average = sum(reduced) / len(reduced)
    bits = sum((value >= average) << index for index, value in enumerate(reduced))
    return f"{bits:016x}"


def perceptual_hash_distance(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def rank_still_candidates(
    candidates: list[dict[str, Any]],
    max_count: int,
    allow_no_face: bool,
    minimum_separation: float = 3.0,
    duplicate_distance: int = 6,
    absolute_blur_max: float = 7.0,
) -> list[dict[str, Any]]:
    candidates = [candidate for candidate in candidates if candidate["blur"] <= absolute_blur_max]
    if max_count < 1 or not candidates:
        return []
    face_candidates = [candidate for candidate in candidates if candidate["face_count"] > 0]
    pool = face_candidates or (candidates if allow_no_face else [])
    if not pool:
        return []
    finite_blurs = [candidate["blur"] for candidate in pool if math.isfinite(candidate["blur"])]
    minimum_blur = min(finite_blurs, default=0.0)
    worst_blur = max(finite_blurs, default=minimum_blur)
    blur_span = worst_blur - minimum_blur

    ranked = []
    for candidate in pool:
        sharpness = 1.0 if blur_span == 0 else 1.0 - (candidate["blur"] - minimum_blur) / blur_span
        exposure_penalty = min(12.0, abs(candidate["luma_average"] - 112.0) / 10.0)
        face_bonus = 100.0 if candidate["face_count"] else 0.0
        score = (
            face_bonus
            + 60.0 * candidate["best_face_quality"]
            + 2.0 * min(candidate["face_count"], 6)
            + 18.0 * math.sqrt(candidate["total_face_area"])
            + 25.0 * sharpness
            - exposure_penalty
        )
        ranked.append(dict(candidate, sharpness_score=round(sharpness, 6), automated_score=round(score, 6)))

    selected = []
    for candidate in sorted(ranked, key=lambda item: (-item["automated_score"], item["timestamp_seconds"])):
        if any(
            abs(candidate["timestamp_seconds"] - other["timestamp_seconds"]) < minimum_separation
            or perceptual_hash_distance(candidate["perceptual_hash"], other["perceptual_hash"]) <= duplicate_distance
            for other in selected
        ):
            continue
        selected.append(candidate)
        if len(selected) == max_count:
            break
    return selected


def deduplicate_adjacent_stills(
    candidates: list[dict[str, Any]], source_window: int = 3, duplicate_distance: int = 4
) -> list[dict[str, Any]]:
    accepted = []
    for candidate in sorted(candidates, key=lambda item: -item["automated_score"]):
        duplicate = any(
            abs(candidate["source_index"] - other["source_index"]) <= source_window
            and perceptual_hash_distance(candidate["perceptual_hash"], other["perceptual_hash"]) <= duplicate_distance
            for other in accepted
        )
        if not duplicate:
            accepted.append(candidate)
    return sorted(accepted, key=lambda item: (item["source_index"], item["timestamp_seconds"]))


def command_stills(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    destination = production_path(project, args.output_manifest)
    ensure_writable(destination, args.force)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", args.version):
        raise PrepError("still version may contain only letters, numbers, dot, underscore, and hyphen")
    if not STILL_FACE_SCRIPT.exists() or not shutil.which("swiftc"):
        raise PrepError("Swift Vision still-face detector unavailable")

    catalog_path = production_path(project, args.catalog)
    with catalog_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    requested = {path.name for path in media_files(project, args.file)} if args.file else None
    rows = [row for row in rows if requested is None or row["source"] in requested]
    if not rows:
        raise PrepError("No catalog rows matched the requested still extraction")
    source_indices = {row["source"]: index for index, row in enumerate(rows)}
    people_fallback_categories = {
        "arrivals_networking", "open_space_marketplace", "session_broll", "facilitated_game",
        "tabletop_session", "group_exercise", "discussion_session", "interview",
        "closing_context", "session_transition",
    }

    with tempfile.TemporaryDirectory(prefix="video-prep-stills-") as working_directory:
        detector = Path(working_directory) / "still_faces"
        run(["swiftc", str(STILL_FACE_SCRIPT), "-o", str(detector)], capture=False)

        def analyze_one(row: dict[str, str]) -> dict[str, Any]:
            source = (originals_root(project) / row["source"]).resolve()
            duration = float(row["duration_seconds"])
            interval = still_sample_interval(duration, args.sample_interval, args.max_samples)
            with tempfile.TemporaryDirectory(prefix=f"still-{source.stem}-") as directory:
                temporary = Path(directory)
                previews = temporary / "preview"
                hashes = temporary / "hash"
                previews.mkdir()
                hashes.mkdir()
                metrics_path = temporary / "metrics.txt"
                filter_graph = (
                    f"[0:v]fps=1/{interval:.9f},split=2[p][h];"
                    f"[p]scale={args.thumb_width}:-2,blurdetect=block_width=32:block_height=32:block_pct=80,"
                    f"signalstats,metadata=print:file={metrics_path}[pout];"
                    "[h]scale=16:16,format=gray[hout]"
                )
                run([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(source),
                    "-filter_complex", filter_graph,
                    "-map", "[pout]", "-q:v", "3", str(previews / "%06d.jpg"),
                    "-map", "[hout]", "-c:v", "pgm", str(hashes / "%06d.pgm"), "-y",
                ], capture=False)
                preview_paths = sorted(previews.glob("*.jpg"))
                detected = run([str(detector), *map(str, preview_paths)])
                faces = {
                    int(Path(item["path"]).stem) - 1: item
                    for item in map(json.loads, detected.stdout.splitlines())
                }
                frames = parse_frame_metrics(metrics_path.read_text(encoding="utf-8"))
                candidates = []
                for frame in frames:
                    index = frame["sample_index"]
                    face = faces.get(index, {})
                    hash_path = hashes / f"{index + 1:06d}.pgm"
                    if not hash_path.exists():
                        continue
                    candidates.append({
                        **frame,
                        "perceptual_hash": pgm_average_hash(hash_path),
                        "face_count": int(face.get("faceCount", 0)),
                        "largest_face_area": float(face.get("largestFaceArea", 0.0)),
                        "total_face_area": float(face.get("totalFaceArea", 0.0)),
                        "best_face_quality": float(face.get("bestFaceQuality") or 0.0),
                        "best_face_confidence": float(face.get("bestFaceConfidence") or 0.0),
                    })
                selected = rank_still_candidates(
                    candidates,
                    args.per_clip,
                    row.get("category", "") in people_fallback_categories,
                    absolute_blur_max=args.max_blur,
                )
                return {
                    "source": row["source"],
                    "source_sha256": row["sha256"],
                    "source_index": source_indices[row["source"]],
                    "category": row.get("category", ""),
                    "session": row.get("session", ""),
                    "width": int(row["width"]),
                    "height": int(row["height"]),
                    "bit_depth": int(row["bit_depth"]),
                    "duration_seconds": duration,
                    "sample_interval_seconds": interval,
                    "sampled_frames": len(candidates),
                    "face_frames": sum(candidate["face_count"] > 0 for candidate in candidates),
                    "selected": selected,
                }

        analyses = parallel_map_ordered(analyze_one, rows, args.jobs)

    candidates = [
        {**candidate, **{key: analysis[key] for key in (
            "source", "source_sha256", "source_index", "category", "session", "width", "height", "bit_depth"
        )}}
        for analysis in analyses
        for candidate in analysis["selected"]
    ]
    selected = deduplicate_adjacent_stills(candidates)
    counts: dict[str, int] = defaultdict(int)
    output_directory = destination.parent
    outputs = []
    for candidate in selected:
        counts[candidate["source"]] += 1
        rank = counts[candidate["source"]]
        timestamp_ms = round(candidate["timestamp_seconds"] * 1000)
        filename = f"{Path(candidate['source']).stem}-t{timestamp_ms:09d}-c{rank:02d}-{args.version}.png"
        output = output_directory / filename
        ensure_writable(output, args.force)
        outputs.append((candidate, output, rank))

    output_directory.mkdir(parents=True, exist_ok=True)

    def extract_one(item: tuple[dict[str, Any], Path, int]) -> dict[str, Any]:
        candidate, output, rank = item
        source = (originals_root(project) / candidate["source"]).resolve()
        temporary = output.with_name(f".{output.name}.tmp.png")
        pixel_format = "rgb48le" if candidate["bit_depth"] > 8 else "rgb24"
        command = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{candidate['timestamp_seconds']:.6f}",
            "-i", str(source), "-map", "0:v:0", "-frames:v", "1", "-vf", f"format={pixel_format}",
            "-c:v", "png", "-compression_level", "6", str(temporary), "-y",
        ]
        try:
            run(command, capture=False)
            temporary.replace(output)
        finally:
            temporary.unlink(missing_ok=True)
        provenance_command = [*command[:-2], str(output)]
        relative = str(output.relative_to(project / "Production"))
        return {
            "source": candidate["source"],
            "source_sha256": candidate["source_sha256"],
            "timestamp_seconds": round(candidate["timestamp_seconds"], 6),
            "output": relative,
            "width": candidate["width"],
            "height": candidate["height"],
            "source_bit_depth": candidate["bit_depth"],
            "output_pixel_format": pixel_format,
            "candidate_rank_within_clip": rank,
            "category": candidate["category"],
            "session": candidate["session"],
            "face_count": candidate["face_count"],
            "largest_face_area": round(candidate["largest_face_area"], 8),
            "total_face_area": round(candidate["total_face_area"], 8),
            "best_face_quality": round(candidate["best_face_quality"], 8),
            "best_face_confidence": round(candidate["best_face_confidence"], 8),
            "blur_metric": round(candidate["blur"], 8),
            "sharpness_score_within_clip": candidate["sharpness_score"],
            "luma_average": round(candidate["luma_average"], 6),
            "perceptual_hash_64": candidate["perceptual_hash"],
            "automated_score": candidate["automated_score"],
            "duplicate_of": None,
            "review_status": "machine candidate; human review pending",
            "extraction_command": provenance_command,
        }

    records = parallel_map_ordered(extract_one, outputs, args.jobs)
    manifest = {
        "protocol": "sgsc-still-candidates/v1",
        "version": args.version,
        "project": str(project),
        "catalog": str(catalog_path.relative_to(project / "Production")),
        "selection_policy": {
            "people_focus": True,
            "identity_inference": False,
            "sample_interval_minimum_seconds": args.sample_interval,
            "max_samples_per_clip": args.max_samples,
            "max_candidates_per_clip_before_cross_clip_deduplication": args.per_clip,
            "absolute_blur_metric_max": args.max_blur,
            "within_clip_minimum_separation_seconds": 3.0,
            "within_clip_duplicate_hash_distance_max": 6,
            "adjacent_source_window": 3,
            "adjacent_duplicate_hash_distance_max": 4,
            "full_resolution_source_native": True,
            "creative_grade_applied": False,
            "sharpening_or_ai_reconstruction_applied": False,
        },
        "summary": {
            "clips_analyzed": len(analyses),
            "sampled_frames": sum(item["sampled_frames"] for item in analyses),
            "frames_with_detected_faces": sum(item["face_frames"] for item in analyses),
            "clips_with_detected_faces": sum(item["face_frames"] > 0 for item in analyses),
            "per_clip_candidates_before_cross_clip_deduplication": len(candidates),
            "candidate_outputs": len(records),
        },
        "candidates": records,
    }
    atomic_json(destination, manifest, args.force)
    for _candidate, output, _rank in outputs:
        print(output)
    print(destination)


def command_contact_sheet(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    destination_dir = project / "Production" / "01_analysis"
    destination_dir.mkdir(parents=True, exist_ok=True)
    paths = media_files(project, args.file)
    for path in paths:
        ensure_writable(destination_dir / f"{path.stem}-contact.jpg", args.force)

    def contact_sheet_one(path: Path) -> Path:
        info = normalized_metadata(path)
        layout = infer_layout(info["width"], info["height"])
        interval = contact_sheet_interval(info["duration"], args.interval, args.columns * args.rows)
        if layout["type"] == "stacked-vertical":
            top = layout["angles"]["top"]
            bottom = layout["angles"]["bottom"]
            filters = (
                f"[0:v]crop={top[2]}:{top[3]}:{top[0]}:{top[1]},scale={args.thumb_width}:-2[top];"
                f"[0:v]crop={bottom[2]}:{bottom[3]}:{bottom[0]}:{bottom[1]},scale={args.thumb_width}:-2[bottom];"
                f"[top][bottom]hstack,fps=1/{interval},tile={args.columns}x{args.rows}:padding=3:margin=3,format=yuvj420p"
            )
        else:
            filters = f"scale={args.thumb_width}:-2,fps=1/{interval},tile={args.columns}x{args.rows}:padding=3:margin=3,format=yuvj420p"
        destination = destination_dir / f"{path.stem}-contact.jpg"
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-filter_complex", filters,
            "-frames:v", "1", str(destination), "-y" if args.force else "-n",
        ], capture=False)
        return destination

    for destination in parallel_map_ordered(contact_sheet_one, paths, args.jobs):
        print(destination)


def catalog_stringout_plan(rows: list[dict[str, str]], name: str, fps: int, excluded_categories: set[str]) -> dict[str, Any]:
    segments = []
    for row in rows:
        if not row.get("transcript_path") or int(row.get("transcript_segments") or 0) == 0 or row.get("category") in excluded_categories:
            continue
        width = int(row["width"])
        height = int(row["height"])
        label = " — ".join(value for value in (row["source"], row.get("category", ""), row.get("session", "")) if value)
        segments.append({
            "source": row["source"],
            "in": 0.0,
            "out": float(row["duration_seconds"]),
            "shot": "medium",
            "crop": [0, 0, width, height],
            "label": label,
        })
    if not segments:
        raise PrepError("No catalog rows matched the stringout filters")
    return {
        "version": 1,
        "name": name,
        "audio_ordinal": 0,
        "outputs": [{"name": name, "width": 1920, "height": 1080, "fps": fps, "segments": segments}],
    }


def transcript_path_for(project: Path, stem: str, labels: list[str]) -> Path | None:
    directory = project / "Production" / "02_transcripts"
    return next((directory / f"{stem}-{label}.json" for label in labels if (directory / f"{stem}-{label}.json").exists()), None)


def command_catalog(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    manifest_path = production_path(project, args.manifest)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rules = []
    if args.rules:
        rules_path = production_path(project, args.rules)
        rules_document = json.loads(rules_path.read_text(encoding="utf-8"))
        rules = rules_document.get("rules", rules_document) if isinstance(rules_document, dict) else rules_document
        if not isinstance(rules, list):
            raise PrepError("Catalog rules must be a JSON list or an object containing a rules list")
    rows = []
    transcript_labels = args.transcript_label or ["raw"]
    for source in manifest.get("sources", []):
        stem = Path(source["source"]).stem
        transcript_path = transcript_path_for(project, stem, transcript_labels)
        transcript = json.loads(transcript_path.read_text(encoding="utf-8")) if transcript_path else None
        relative_transcript = str(transcript_path.relative_to(project / "Production")) if transcript_path else ""
        rows.append(apply_catalog_rules(catalog_row(source, transcript, relative_transcript), rules))
    if not rows:
        raise PrepError(f"No sources in manifest: {manifest_path}")
    destination = production_path(project, args.output)
    ensure_writable(destination, args.force)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(destination)
    print(destination)


def command_catalog_stringout(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    catalog_path = production_path(project, args.catalog)
    with catalog_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    plan = catalog_stringout_plan(rows, args.name, args.fps, set(args.exclude_category or []))
    destination = production_path(project, args.output)
    atomic_json(destination, plan, args.force)
    print(destination)


def command_validate_plan(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    plan = load_plan(Path(args.plan), project)
    errors = validate_plan_data(plan)
    print(json.dumps({"valid": not errors, "errors": errors}, indent=2))
    if errors:
        raise PrepError("Plan validation failed")


def command_render(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    plan = load_plan(Path(args.plan), project)
    errors = validate_plan_data(plan)
    if errors:
        raise PrepError("Plan validation failed:\n" + "\n".join(errors))
    for output in selected_outputs(plan, args.output):
        print(render_output(project, output, plan, args.force))


def command_fcpxml(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    plan = load_plan(Path(args.plan), project)
    errors = validate_plan_data(plan)
    if errors:
        raise PrepError("Plan validation failed:\n" + "\n".join(errors))
    for output in selected_outputs(plan, args.output):
        sources = {str(Path(segment["source"]).resolve()) for segment in output["segments"]}
        metadata = {source: normalized_metadata(Path(source)) for source in sources}
        destination = production_path(project, f"05_resolve/{slug(output['name'])}.fcpxml")
        write_fcpxml(plan, output, destination, metadata, args.force)
        ET.parse(destination)
        print(destination)


def command_qc(args: argparse.Namespace) -> None:
    path = Path(args.media).expanduser().resolve()
    probe = probe_media(path)
    info = normalized_metadata(path, probe)
    video = next(stream for stream in probe["streams"] if stream.get("codec_type") == "video")
    decode = run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"], check=False)
    loudness = loudness_stats(path)
    checks = {
        "decode": decode.returncode == 0 and not decode.stderr.strip(),
        "cfr": video.get("r_frame_rate") == video.get("avg_frame_rate"),
        "width": args.width is None or info["width"] == args.width,
        "height": args.height is None or info["height"] == args.height,
        "fps": args.fps is None or abs(info["fps"] - args.fps) < 0.001,
        "loudness": abs(loudness["lufs_i"] - args.target_lufs) <= args.lufs_tolerance,
        "true_peak": loudness["true_peak_dbtp"] <= args.true_peak_max,
    }
    report = {"media": str(path), "media_sha256": sha256(path), "checks": checks, "loudness": loudness, "probe": probe}
    if args.report:
        atomic_json(Path(args.report).expanduser().resolve(), report, args.force)
    print(json.dumps(report, indent=2))
    if not all(checks.values()):
        raise PrepError("QC failed")


def export_path(project: Path, relative: str) -> Path:
    path = production_path(project, relative)
    exports = (project / "Production" / "07_exports").resolve()
    if path != exports and exports not in path.parents:
        raise PrepError(f"Delivery output must remain inside 07_exports: {path}")
    return path


def atomic_copy(source: Path, destination: Path, force: bool = False) -> str:
    ensure_writable(destination, force)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        shutil.copy2(source, temporary)
        source_hash = sha256(source)
        if sha256(temporary) != source_hash:
            raise PrepError(f"Copied file hash mismatch: {destination}")
        temporary.replace(destination)
        return source_hash
    finally:
        temporary.unlink(missing_ok=True)


def command_promote(args: argparse.Namespace) -> None:
    project = project_path(args.project)
    review = production_path(project, args.review)
    qc_path = production_path(project, args.qc_report)
    destination = export_path(project, args.output)
    manifest = production_path(
        project,
        args.manifest or f"00_manifest/delivery-{slug(destination.stem)}.json",
    )
    approved_by = args.approved_by.strip()
    if not approved_by:
        raise PrepError("--approved-by must not be empty")
    if not review.is_file():
        raise PrepError(f"Review file does not exist: {review}")
    if not qc_path.is_file():
        raise PrepError(f"QC report does not exist: {qc_path}")

    qc = json.loads(qc_path.read_text(encoding="utf-8"))
    checks = qc.get("checks")
    if not isinstance(checks, dict) or not checks or not all(checks.values()):
        raise PrepError("QC report does not pass every recorded check")
    if Path(qc.get("media", "")).expanduser().resolve() != review:
        raise PrepError("QC report media does not match review")
    review_hash = sha256(review)
    if qc.get("media_sha256") != review_hash:
        raise PrepError("QC report hash does not match review")

    if bool(args.thumbnail) != bool(args.thumbnail_output):
        raise PrepError("--thumbnail and --thumbnail-output must be supplied together")
    thumbnail = production_path(project, args.thumbnail) if args.thumbnail else None
    thumbnail_destination = export_path(project, args.thumbnail_output) if args.thumbnail_output else None
    if thumbnail and not thumbnail.is_file():
        raise PrepError(f"Thumbnail does not exist: {thumbnail}")

    ensure_writable(destination, args.force)
    ensure_writable(manifest, args.force)
    if thumbnail_destination:
        ensure_writable(thumbnail_destination, args.force)

    export_hash = atomic_copy(review, destination, args.force)
    thumbnail_hash = atomic_copy(thumbnail, thumbnail_destination, args.force) if thumbnail and thumbnail_destination else None
    production = (project / "Production").resolve()
    delivery = {
        "protocol": "video-edit-prep/delivery/v1",
        "approval": {
            "approved_by": approved_by,
            "approved_at": args.approved_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        },
        "review": str(review.relative_to(production)),
        "qc_report": str(qc_path.relative_to(production)),
        "export": str(destination.relative_to(production)),
        "export_sha256": export_hash,
    }
    if thumbnail and thumbnail_destination and thumbnail_hash:
        delivery.update({
            "thumbnail": str(thumbnail_destination.relative_to(production)),
            "thumbnail_sha256": thumbnail_hash,
        })
    atomic_json(manifest, delivery, args.force)
    print(json.dumps(delivery, ensure_ascii=False, indent=2))


def command_eye_gate(args: argparse.Namespace) -> None:
    if not FACE_SCRIPT.exists() or not shutil.which("swift"):
        raise PrepError("Swift Vision face detector unavailable")
    project = project_path(args.project)
    plan = load_plan(Path(args.plan), project)
    output = selected_outputs(plan, args.output)[0]
    media = Path(args.media).expanduser().resolve()
    fps = float(output["fps"])
    height = int(output["height"])
    tolerance = float(output.get("gates", {}).get("eye_delta_max_px", plan.get("gates", {}).get("eye_delta_max_px", 24))) * height / 1080
    boundaries = []
    elapsed = 0.0
    segments = output["segments"]
    for left, right in zip(segments, segments[1:]):
        elapsed += left["out"] - left["in"]
        left_has_eyes = left.get("eye_gate", left.get("shot") not in {"overhead", "detail"})
        right_has_eyes = right.get("eye_gate", right.get("shot") not in {"overhead", "detail"})
        if left_has_eyes and right_has_eyes:
            boundaries.append((elapsed, left["shot"], right["shot"]))

    results = []
    with tempfile.TemporaryDirectory(prefix="video-prep-eyes-") as directory:
        images = []
        metadata = []
        for index, (boundary, left, right) in enumerate(boundaries):
            delta = max(0.01, 0.6 / fps)
            for side, timestamp in (("before", max(0, boundary - delta)), ("after", boundary + delta)):
                image = Path(directory) / f"{index:03d}-{side}.jpg"
                run([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{timestamp:.6f}", "-i", str(media),
                    "-frames:v", "1", str(image), "-y",
                ], capture=False)
                images.append(image)
                metadata.append((index, side, boundary, left, right))
        if images:
            detected = run(["swift", str(FACE_SCRIPT), *map(str, images)])
            rows = [json.loads(line) for line in detected.stdout.splitlines() if line.strip()]
            grouped: defaultdict[int, dict[str, Any]] = defaultdict(dict)
            for row, item in zip(rows, metadata):
                index, side, boundary, left, right = item
                grouped[index].update({"boundary": boundary, "from": left, "to": right})
                grouped[index][side] = None if row.get("eyeY") is None else (1 - row["eyeY"]) * height
            for index in sorted(grouped):
                result = grouped[index]
                if result.get("before") is None or result.get("after") is None:
                    result.update({"delta": None, "pass": False, "error": "face/eyes not detected"})
                else:
                    difference = abs(result["before"] - result["after"])
                    result.update({"delta": difference, "pass": difference <= tolerance})
                results.append(result)

    report = {"media": str(media), "output": output["name"], "tolerance_px": tolerance, "cuts": results, "pass": all(item["pass"] for item in results)}
    if args.report:
        atomic_json(Path(args.report).expanduser().resolve(), report, args.force)
    print(json.dumps(report, indent=2))
    if not report["pass"]:
        raise PrepError("Eye gate failed")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    subparsers = result.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor")
    doctor.add_argument("--root", default=str(DEFAULT_ROOT))
    doctor.set_defaults(func=command_doctor)

    init = subparsers.add_parser("init")
    init.add_argument("name")
    init.add_argument("--root", default=str(DEFAULT_ROOT))
    init.set_defaults(func=command_init)

    inspect = subparsers.add_parser("inspect")
    inspect.add_argument("project")
    inspect.add_argument("--file", action="append")
    inspect.add_argument("--seconds", type=float, default=120)
    inspect.add_argument("--checksum", action="store_true")
    inspect.add_argument("--output", default="00_manifest/sources.json")
    inspect.add_argument("--jobs", type=int, default=DEFAULT_FILE_JOBS, help=f"parallel files (default: {DEFAULT_FILE_JOBS})")
    inspect.add_argument("--force", action="store_true")
    inspect.set_defaults(func=command_inspect)

    transcribe = subparsers.add_parser("transcribe")
    transcribe.add_argument("project")
    transcribe.add_argument("--file", action="append")
    transcribe.add_argument("--audio-ordinal", type=int, required=True)
    transcribe.add_argument("--audio-channel", type=int, choices=(0, 1), help="optional left/right channel within a stereo stream")
    transcribe.add_argument("--language", required=True)
    transcribe.add_argument("--model", choices=("whisper", "qwen3", "sensevoice"), default="whisper")
    transcribe.add_argument("--terms")
    transcribe.add_argument("--diarize", action="store_true", help="estimate anonymous speaker turns locally")
    transcribe.add_argument("--speakers", type=int, help="exact speaker count; requires --diarize")
    transcribe.add_argument("--output-label", help="version label in <clip>-<label>.json (default: raw)")
    transcribe.add_argument("--jobs", type=int, default=1, help="parallel model processes (default: 1; tune for memory/throughput)")
    transcribe.add_argument("--force", action="store_true")
    transcribe.set_defaults(func=command_transcribe)

    transcript_inventory = subparsers.add_parser("transcript-inventory")
    transcript_inventory.add_argument("project")
    transcript_inventory.add_argument("--output", default="00_manifest/transcripts.csv")
    transcript_inventory.add_argument("--force", action="store_true")
    transcript_inventory.set_defaults(func=command_transcript_inventory)

    subtitles = subparsers.add_parser("subtitles")
    subtitles.add_argument("project")
    subtitles.add_argument("--transcript", action="append", required=True, help="production-relative transcript JSON; repeat as needed")
    subtitles.add_argument("--output-dir", default="02_transcripts/subtitles-machine")
    subtitles.add_argument("--force", action="store_true")
    subtitles.set_defaults(func=command_subtitles)

    sheets = subparsers.add_parser("contact-sheet")
    sheets.add_argument("project")
    sheets.add_argument("--file", action="append")
    sheets.add_argument("--interval", type=float, default=15)
    sheets.add_argument("--columns", type=int, default=5)
    sheets.add_argument("--rows", type=int, default=10)
    sheets.add_argument("--thumb-width", type=int, default=480)
    sheets.add_argument("--jobs", type=int, default=DEFAULT_FILE_JOBS, help=f"parallel files (default: {DEFAULT_FILE_JOBS})")
    sheets.add_argument("--force", action="store_true")
    sheets.set_defaults(func=command_contact_sheet)

    stills = subparsers.add_parser("stills")
    stills.add_argument("project")
    stills.add_argument("--file", action="append")
    stills.add_argument("--catalog", default="00_manifest/catalog.csv")
    stills.add_argument("--output-manifest", default="01_analysis/still-candidates/stills-candidates-v001.json")
    stills.add_argument("--version", default="v001")
    stills.add_argument("--sample-interval", type=float, default=1.0)
    stills.add_argument("--max-samples", type=int, default=120)
    stills.add_argument("--per-clip", type=int, default=2)
    stills.add_argument("--max-blur", type=float, default=7.0, help="absolute FFmpeg blur ceiling (lower is sharper; default: 7.0)")
    stills.add_argument("--thumb-width", type=int, default=960)
    stills.add_argument("--jobs", type=int, default=4, help="parallel FFmpeg/Vision jobs (default: 4)")
    stills.add_argument("--force", action="store_true")
    stills.set_defaults(func=command_stills)

    catalog = subparsers.add_parser("catalog")
    catalog.add_argument("project")
    catalog.add_argument("--manifest", default="00_manifest/sources.json")
    catalog.add_argument("--output", default="00_manifest/catalog.csv")
    catalog.add_argument("--rules", help="production-relative JSON annotation rules applied in order")
    catalog.add_argument("--transcript-label", action="append", help="preferred transcript filename label; repeat in priority order (default: raw)")
    catalog.add_argument("--force", action="store_true")
    catalog.set_defaults(func=command_catalog)

    stringout = subparsers.add_parser("catalog-stringout")
    stringout.add_argument("project")
    stringout.add_argument("--catalog", default="00_manifest/catalog.csv")
    stringout.add_argument("--output", default="04_selects/catalog-stringout.json")
    stringout.add_argument("--name", default="Catalog Dialogue Stringout")
    stringout.add_argument("--fps", type=int, default=25)
    stringout.add_argument("--exclude-category", action="append")
    stringout.add_argument("--force", action="store_true")
    stringout.set_defaults(func=command_catalog_stringout)

    validate = subparsers.add_parser("validate-plan")
    validate.add_argument("project")
    validate.add_argument("plan")
    validate.set_defaults(func=command_validate_plan)

    render = subparsers.add_parser("render")
    render.add_argument("project")
    render.add_argument("plan")
    render.add_argument("--output")
    render.add_argument("--force", action="store_true")
    render.set_defaults(func=command_render)

    fcpxml = subparsers.add_parser("fcpxml")
    fcpxml.add_argument("project")
    fcpxml.add_argument("plan")
    fcpxml.add_argument("--output")
    fcpxml.add_argument("--force", action="store_true")
    fcpxml.set_defaults(func=command_fcpxml)

    qc = subparsers.add_parser("qc")
    qc.add_argument("media")
    qc.add_argument("--width", type=int)
    qc.add_argument("--height", type=int)
    qc.add_argument("--fps", type=float)
    qc.add_argument("--target-lufs", type=float, default=-16)
    qc.add_argument("--lufs-tolerance", type=float, default=0.5)
    qc.add_argument("--true-peak-max", type=float, default=-1.0)
    qc.add_argument("--report")
    qc.add_argument("--force", action="store_true")
    qc.set_defaults(func=command_qc)

    promote = subparsers.add_parser("promote")
    promote.add_argument("project")
    promote.add_argument("--review", required=True, help="production-relative approved review media")
    promote.add_argument("--qc-report", required=True, help="production-relative passing QC JSON")
    promote.add_argument("--output", required=True, help="production-relative path under 07_exports")
    promote.add_argument("--thumbnail", help="optional production-relative thumbnail")
    promote.add_argument("--thumbnail-output", help="required 07_exports path when --thumbnail is used")
    promote.add_argument("--approved-by", required=True)
    promote.add_argument("--approved-at", help="ISO-8601 approval time; defaults to current UTC")
    promote.add_argument("--manifest", help="production-relative delivery manifest path")
    promote.add_argument("--force", action="store_true")
    promote.set_defaults(func=command_promote)

    eyes = subparsers.add_parser("eye-gate")
    eyes.add_argument("project")
    eyes.add_argument("plan")
    eyes.add_argument("media")
    eyes.add_argument("--output", required=True)
    eyes.add_argument("--report")
    eyes.add_argument("--force", action="store_true")
    eyes.set_defaults(func=command_eye_gate)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        args.func(args)
        return 0
    except (PrepError, subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
