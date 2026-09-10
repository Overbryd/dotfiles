---
name: video-edit-prep
description: Prepares local video projects for transcript-driven 16:9 longform and 9:16 shortform editing using FFmpeg, sayneat, macOS Vision eye-line gates, deterministic review renders, QC, and Resolve-Free-compatible FCPXML. Use for raw recording ingest, stacked camera feeds, audio-track mapping, local German/multilingual ASR, content selects, shot grammar, reframing, review cuts, or NLE handoff.
compatibility: Apple Silicon macOS, Python 3.11+, FFmpeg/ffprobe, sayneat, Swift; DaVinci Resolve Free optional for finishing.
---

# Video edit preparation

Use bundled `scripts/video_prep.py`. Resolve relative paths against this skill directory.

Default video root:

```text
~/Library/CloudStorage/Dropbox-Personal/Videos
```

Read [references/WORKFLOW.md](references/WORKFLOW.md) before first project. Read [references/PLAN.md](references/PLAN.md) before writing an edit plan.

## Boundaries

- Originals immutable. Never write, rename, move, remux, or delete inside `Originals/`.
- Keep generated work under `<project>/Production/`.
- No publishing, uploads, Resolve project deletion, or source replacement.
- Audio and transcription stay local. Network may occur only for missing model downloads after user approval.
- Never publish raw ASR. Check names, numbers, URLs, negations, prices, and unclear words.
- Never infer speaker identity from filename, loudness, or face. Ask or label unknown.
- Never force a wide entrance, overhead cut, close-up, or narrative claim unsupported by source.
- Never use `--force` unless user explicitly approves replacement. Prefer new versions.
- Color and caption styling require visual/human review. Review renders are not final masters.

## Start

Run doctor:

```bash
python3 scripts/video_prep.py doctor
```

Create fresh project:

```bash
python3 scripts/video_prep.py init "YYYY-MM-DD Project Name"
```

This creates:

```text
<Project>/
  Originals/
  Production/
    00_manifest/
    01_analysis/
    02_transcripts/
    03_audio/
    04_selects/
    05_resolve/
    06_reviews/
    07_exports/
```

Ask user to place source media in `Originals/`. Existing project may already follow this layout. When `Production/00_manifest/project-vNNN.json` comes from `pl-videos` and declares an external `originals_root`, all commands resolve relative source names there; do not duplicate, move, or symlink originals merely to satisfy this tool.

## Required workflow

### 1. Inspect before processing

```bash
python3 scripts/video_prep.py inspect "/path/to/Project" --seconds 120 --checksum --jobs 8
python3 scripts/video_prep.py contact-sheet "/path/to/Project" --jobs 8
```

Build an editable metadata catalog when useful:

```bash
python3 scripts/video_prep.py catalog "/path/to/Project" \
  --manifest "00_manifest/sources.json" \
  --output "00_manifest/catalog-v001.csv"
```

The catalog links technical/camera/audio/transcript provenance and leaves editorial fields blank for evidence-based review. Apply auditable range/exact-match JSON annotations in order when a visual pass exists:

```bash
python3 scripts/video_prep.py catalog "/path/to/Project" \
  --manifest "00_manifest/sources-v002.json" \
  --rules "00_manifest/catalog-rules-v001.json" \
  --transcript-label corrected-v001 \
  --transcript-label raw \
  --output "00_manifest/catalog-v002.csv"
```

Repeat `--transcript-label` in priority order. The first existing transcript for each source is linked. A no-speech ASR result is preserved as an empty, provenance-bearing transcript instead of failing a parallel batch.

For a concise people-focused still-photo candidate set, pilot one representative clip before batching:

```bash
python3 scripts/video_prep.py stills "/path/to/Project" \
  --catalog "00_manifest/catalog-v002.csv" \
  --output-manifest "01_analysis/still-candidates/stills-candidates-v001.json" \
  --version v001 --sample-interval 1 --max-samples 120 --per-clip 2 --jobs 4
```

This samples rather than dumping frames, uses local Vision face-capture quality plus FFmpeg blur/luma metrics, rejects an absolute blur ceiling, suppresses perceptual near-duplicates, and extracts only ranked candidates at native resolution. Face detection prioritizes review but never identifies a person. Preserve the manifest, source hashes, exact timestamps, and machine-review status; human approval remains mandatory.

Generate a whole-clip dialogue-review plan from non-empty transcript links, optionally excluding categories already covered by another stringout:

```bash
python3 scripts/video_prep.py catalog-stringout "/path/to/Project" \
  --catalog "00_manifest/catalog-v002.csv" \
  --exclude-category interview \
  --output "04_selects/event-dialogue-stringout-v001.json" \
  --name "Event Dialogue Search Stringout v001"
```

Validate and convert that plan to FCPXML. This is review organization, not a story edit.

Inspect every stream and representative frames. Determine:

- source dimensions, frame rate, codec, color tags, duration;
- single camera versus vertically stacked feeds;
- active, silent, duplicate, mixed, and isolated audio tracks;
- actual language, participants, terminology, target channels, and desired lengths;
- whether cloud placeholders became locally hydrated.

Volume proves activity, not identity. Listen to or transcribe short samples from plausible tracks before selecting one.

### 2. Benchmark ASR

Use short extracts under `/tmp`. Compare sayneat Whisper against Qwen3 with terminology hints when names/products matter. Pick by transcript evidence, not model reputation. Check model cache readiness first. Never invoke a lower-level ASR executable with a different cache configuration: it may silently hydrate another multi-gigabyte model. Ask before any missing model download.

Strong baseline:

```bash
python3 scripts/video_prep.py transcribe "/path/to/Project" \
  --audio-ordinal 1 \
  --language de \
  --model whisper
```

Audio ordinal is zero-based FFmpeg `0:a:N`. It must come from current-project inspection; never copy ordinal `1` blindly from another project. For a stereo stream with isolated or differently placed microphones, add `--audio-channel 0` (left) or `--audio-channel 1` (right); preserve channel metadata and verify the mapping from audio evidence rather than faces or assumed identities. File inspection and contact sheets default to bounded parallelism. Transcription defaults to one model process; benchmark `--jobs 2` or higher on representative clips before batching because additional ML processes can reduce throughput or exhaust unified memory.

Validate transcript duration, long gaps, repeated hallucinations, and source SHA-256. Preserve raw JSON. Treat `--diarize` as a pilot, not truth: check label consistency, overlap, duplicate fragments, and false-language output on one representative file before batching or mapping anonymous labels to confirmed people.

Create a transcript-version/state inventory before correction or publication work:

```bash
python3 scripts/video_prep.py transcript-inventory "/path/to/Project" \
  --output "00_manifest/transcripts-v001.csv"
```

It records machine transcription versus translation, source/channel provenance, gap/overlap indicators, and distinct human-correction/publication states.

Create review-only SRT from one or more versioned JSON transcripts without changing cue timing:

```bash
python3 scripts/video_prep.py subtitles "/path/to/Project" \
  --transcript "02_transcripts/take-01-en-machine-v001.json" \
  --output-dir "02_transcripts/subtitles-machine"
```

These are navigation derivatives. Re-segment for readable subtitle duration/line length only after transcript and translation correction.

### 3. Build content inventory before timeline

Review transcript plus contact sheets. Produce timestamped candidates with:

- exact source and in/out;
- exact quote;
- topic, hook, setup, payoff;
- visual action and preferred shot;
- target format;
- confidence and rejection reason.

Separate completed delivery from false starts, rehearsal, crew direction, technical talk, and teardown. For event recordings, inventory every self-contained presentation—including host or sponsor presentations—before classifying surrounding speech as moderation. Refine every retained start/end and every moderation removal with short, word-timestamped boundary passes; whole-recording ASR segments may be too coarse. Do not pad weak material to hit requested length. State when only a shorter honest cut exists.

### 4. Apply shot grammar

Default learned baseline:

- wide: at most one; opener only when composition/movement earns it;
- medium: recurring default coverage, not limited to two appearances;
- close: one significant line normally; absolute maximum two distinct peaks;
- overhead/detail: only when hands/product action adds information;
- no synthetic camera angles;
- direct face-shot transitions must pass eye-line gate;
- overhead/detail shots are eye-gate exempt;
- portrait edit is rebuilt from source selects, never cropped from flattened longform.

If user gives different grammar, encode it in plan gates.

### 5. Write and validate plan

Store canonical plans in `Production/04_selects/`. Follow [references/PLAN.md](references/PLAN.md).

```bash
python3 scripts/video_prep.py validate-plan "/path/to/Project" "/path/to/plan.json"
```

Fix all failures before render.

### 6. Render review

```bash
python3 scripts/video_prep.py render "/path/to/Project" "/path/to/plan.json"
```

Renderer uses:

- source-time trims;
- explicit crops and Lanczos scaling;
- exact CFR after concat;
- Rec.709 tags;
- x264 CRF review encoding without forced H.264 level;
- chosen embedded audio ordinal;
- high-pass and measured two-pass EBU loudness normalization, defaulting to `-16 LUFS-I` and `-2.5 dBTP` before AAC to leave codec headroom for the decoded `-1 dBTP` gate.

Do not add captions or strong color treatment to first framing review. Keep review purpose narrow.

### 7. Run gates

```bash
python3 scripts/video_prep.py qc "/path/to/review.mp4" --width 1920 --height 1080 --fps 30
python3 scripts/video_prep.py eye-gate "/path/to/Project" "/path/to/plan.json" "/path/to/review.mp4" --output "Timeline Name"
```

QC requires clean decode, exact CFR, expected dimensions/fps, loudness near `-16 LUFS-I`, and decoded true peak no higher than `-1 dBTP` by default.

Eye gate measures frames immediately before/after direct face-shot cuts with macOS Vision. Default tolerance: 24 px at 1080p, scaled by output height. Missing eyes fail. Review intra-shot head movement separately; static cut alignment does not equal motion tracking.

Always watch full review. Automated checks cannot judge rhythm, sincerity, card obstruction, awkward gestures, or color mismatch.

### 8. Approval, versioning, Resolve Free handoff

User approves story/framing first. Keep failed versions as audit trail when useful; never call them final.

After approval, promote the exact QC-passed review bytes rather than re-encoding. Include an approved thumbnail when available:

```bash
python3 scripts/video_prep.py promote "/path/to/Project" \
  --review "06_reviews/talk-v003.mp4" \
  --qc-report "00_manifest/qc-talk-v003.json" \
  --output "07_exports/talk.mp4" \
  --thumbnail "05_resolve/graphics/talk-thumbnail.png" \
  --thumbnail-output "07_exports/talk-thumbnail.png" \
  --approved-by "user" \
  --manifest "00_manifest/delivery-talk-v001.json"
```

`qc --report` hashes the reviewed media. `promote` requires every recorded QC check to pass, verifies the report path and SHA-256 against the selected review, copies atomically, verifies the copied bytes, and writes an approval-bound delivery manifest. It never uploads.

Generate source-linked FCPXML:

```bash
python3 scripts/video_prep.py fcpxml "/path/to/Project" "/path/to/plan.json"
```

Resolve Free import:

1. **File → Import → Timeline**.
2. Enable automatic source import and sizing information.
3. Compare imported timeline against approved review.
4. Keep selected embedded audio track; disable others.
5. If first transform differs, fix generator/plan once. Do not hand-repair every clip.

Resolve Free has no external scripting setting/API. Do not attempt license bypass or brittle GUI automation. FCPXML is baseline interchange. FCPXML well-formedness does not prove Resolve interpreted every transform; visual comparison is mandatory.

### 9. Finish

After imported timeline matches review:

- grade front/overhead using scopes; preserve Rec.709 SDR;
- use mild corrections on compressed 8-bit H.264;
- clean audio sparingly; preserve room tone;
- correct captions and safe zones;
- longform: separate SRT where supported;
- shortform: burned captions plus clean version when useful;
- render new review, rerun QC, then full human watch;
- place only approved delivery files in `07_exports/`;
- make the delivery checklist explicit: video, thumbnail, title/description metadata, chapters, and captions are separate assets; never assume a title card is also an exported thumbnail.

## Useful commands

```bash
python3 scripts/video_prep.py --help
python3 scripts/video_prep.py render --help
python3 scripts/video_prep.py qc --help
```

Run skill tests after changing scripts:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```
