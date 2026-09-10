# Edit plan format

Canonical plan is JSON. Source paths may be absolute or relative to `<project>/Originals/`.

```json
{
  "version": 1,
  "name": "Project Name",
  "audio_ordinal": 1,
  "highpass_hz": 70,
  "target_lufs": -16,
  "render_true_peak_dbtp": -2.5,
  "loudness_range_lu": 11,
  "gates": {
    "wide_max": 1,
    "close_max": 1,
    "close_absolute_max": 2,
    "eye_delta_max_px": 24
  },
  "outputs": [
    {
      "name": "Product Longform 16x9 v001",
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "review_file": "06_reviews/product-longform-16x9-v001.mp4",
      "segments": [
        {
          "source": "take-01.mkv",
          "in": 14.558,
          "out": 20.170,
          "shot": "wide",
          "label": "intro",
          "crop": [181, 50, 2400, 1350],
          "reason": "single establishing opener",
          "eye_gate": true
        },
        {
          "source": "take-01.mkv",
          "in": 20.170,
          "out": 31.771,
          "shot": "medium",
          "label": "explanation",
          "crop": [279, 47, 2200, 1238]
        },
        {
          "source": "take-01.mkv",
          "in": 31.771,
          "out": 40.517,
          "shot": "overhead",
          "label": "card handling",
          "crop": [0, 1440, 2560, 1440],
          "reason": "shows referenced product action",
          "eye_gate": false
        },
        {
          "source": "take-01.mkv",
          "in": 40.517,
          "out": 46.735,
          "shot": "close",
          "label": "core benefit",
          "crop": [409, 154, 1920, 1080],
          "reason": "single significant line"
        }
      ]
    }
  ]
}
```

## Fields

Top-level:

- `version`: schema version; currently `1`.
- `name`: project/event name for FCPXML.
- `audio_ordinal`: zero-based FFmpeg audio ordinal selected after inspection.
- `highpass_hz`: review audio high-pass; default 70.
- `target_lufs`: measured two-pass render target; default `-16` LUFS-I.
- `render_true_peak_dbtp`: pre-AAC true-peak target; default `-2.5` dBTP to leave codec headroom for the decoded `-1` dBTP QC gate.
- `loudness_range_lu`: loudness-normalization range target; default `11` LU.
- `gates`: shared static and eye-line rules.
- `outputs`: one or more timelines/renders.

Output:

- `name`: unique timeline name; also selector for `--output`.
- `width`, `height`, `fps`: required output format.
- `review_file`: optional path relative to `Production/`; default generated from name.
- `audio_ordinal`, `highpass_hz`, `target_lufs`, `render_true_peak_dbtp`, `loudness_range_lu`: optional per-output overrides.
- `crf`, `preset`: optional x264 review settings; defaults 18 and medium.
- `gates`: optional output gate overrides.
- `segments`: ordered source-time decisions.

Segment:

- `source`: source path.
- `in`, `out`: seconds in source. FCPXML quantizes to nearest output frame.
- `shot`: `wide`, `medium`, `close`, `overhead`, `detail`, or `other`.
- `crop`: `[x, y, width, height]` in full source pixels, top-left origin.
- `label`: optional readable purpose.
- `reason`: mandatory for close, overhead, and detail shots.
- `eye_gate`: optional. Defaults true except overhead/detail.

## Crop rules

Crop aspect ratio must equal output aspect ratio.

For vertically stacked equal 16:9 feeds at `2560x2880`:

```json
{"top": [0, 0, 2560, 1440], "bottom": [0, 1440, 2560, 1440]}
```

Digital 1080p presenter sizes that avoid close-up upscale from a `2560x1440` angle:

- wide: around `2400x1350`;
- medium: around `2200x1238`;
- close: no smaller than `1920x1080`.

Center each crop from measured face/eye position, not fixed image center. To hold a target eye fraction `t` from top:

```text
crop_y = eye_y_source - t * crop_height
crop_x = eye_x_source - crop_width / 2
```

Clamp to source-angle bounds. For bottom stacked angle, add its vertical offset.

## Gate interpretation

- `wide_max`: maximum count; zero is valid when no clean establishing shot exists.
- `close_max`: normal editorial maximum.
- `close_absolute_max`: hard safety ceiling.
- medium is recurring default; no default maximum.
- reason requirement prevents decorative overhead/close cuts.
- eye gate compares only adjacent eye-bearing shots. Overhead/detail transitions are exempt.

## Multi-source edits

Segments may reference different files and be reordered. Renderer concatenates matching source audio pieces using selected audio ordinal. Verify room tone and continuity manually. FCPXML imports each original asset and repeats the same source ranges. Generated title/end-card clips under `Production/05_resolve/graphics/` may be absolute segment sources; keep them versioned, use an explicit full-frame crop, and disable eye gating for those segments.

## Versioning

Change output and timeline names for every approved revision:

```text
v001_agent
v002_reviewed
v003_color
```

Do not reuse output paths with `--force` merely for convenience.
