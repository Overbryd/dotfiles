# Workflow rationale and session findings

## Proven local stack

- FFmpeg/ffprobe: ingest inspection, stream mapping, source crops, contact sheets, review rendering, loudness, and QC.
- sayneat: local timestamped ASR with source/audio provenance.
- macOS Vision through Swift: face and eye landmarks without another ML install.
- DaVinci Resolve Free: manual FCPXML import, color, captions, audio finishing, and delivery.
- JSON edit plan: canonical, reviewable decision record independent of any NLE.

This hybrid beats pure NLE automation and pure FFmpeg editing. FFmpeg gives deterministic output and easy gates. Resolve gives visual finishing and revision UX. Human review remains editorial authority.

## What worked

### Stacked camera source

A `2560x2880` frame contained two synchronized `2560x1440` feeds: presenter above, overhead below. Splitting by crop avoided multicam synchronization entirely. Final review rendered from original stacked media, avoiding angle-master transcodes.

### External Originals and `pl-videos`

A project may keep immutable camera media in a separate folder while `Production/` lives in a sibling project. `pl-videos` records this as `originals_root` in `Production/00_manifest/project-vNNN.json`. The prep tool now resolves relative source names through that manifest, eliminating absolute `--file` repetition and avoiding media duplication or fragile symlinks.

### Audio mapping

Six stereo tracks existed. Three were active, three silent. Short ASR comparisons showed one active track contained fuller dialogue and lower sampled noise. Volume scan narrowed candidates but transcript evidence selected track. When tracks looked equivalent, decoded PCM hashes proved whether they were actually bit-identical before one ordinal was chosen.

### ASR benchmark

sayneat Whisper Turbo beat Qwen3 ASR on the representative German sample even when Qwen3 received terms such as Blickwinkel and Selbstvertrauen. Qwen distorted or omitted more words. This is project evidence, not a universal model ranking.

sayneat emitted an underlying 30-second warning on a 75-second input, but its wrapper returned multiple segments spanning the full duration. Coverage still needs explicit validation every run.

### Transcript-first content boundary

Transcript exposed a clean product presentation followed by retake planning and technical discussion. Cutting an honest 70-second piece worked better than padding toward an arbitrary 2–4 minute target.

For event recordings, a whole-recording transcript identified talks, Q&A, moderation, breaks, and teardown. Short word-timestamped boundary passes then corrected coarse 20–30-second ASR blocks. This mattered materially: one host presentation appeared to begin around `175s` and end around `501s` in coarse segments, while refined speech boundaries were about `180s` and `481s`.

Inventory every self-contained speaker contribution before labeling it moderation. A host/sponsor presentation can be a valid standalone deliverable even when absent from the public talk programme.

### Shot grammar

Successful pilot used:

- one near-native wide;
- medium as default;
- one close-up on the core benefit;
- overhead only during product handling;
- no forced moving opener where none existed.

This produced restrained visual emphasis instead of random punch-ins.

### Eye gate

Vision landmarks measured direct front-to-front cuts. Per-shot crops aligned eyes within about 3 px at tested boundaries against a 24 px limit. Sampling arbitrary points inside shots varied because the presenter naturally moved; cut-boundary alignment and motion tracking are different problems.

### Branding and delivery

Official press-kit assets worked well when preserved under `Production/01_analysis/brand/` with source URL and hashes. Generated title/end clips under `Production/05_resolve/graphics/` could then participate in the same JSON plan as camera sources. Keeping branding to cards—not a persistent bug—avoided obscuring code and slides.

Approval promotion should copy the exact QC-passed review bytes, verify SHA-256, and write an approval-bound manifest. Video, thumbnail, metadata, chapters, and captions are separate delivery checklist items. In this session the videos were promoted correctly, but thumbnails were initially omitted because no explicit checklist/tool gate existed.

### Rendering/QC

Good settings:

- timeline-specific 1920x1080 or 1080x1920;
- `fps` after concat for exact CFR;
- `-video_track_timescale 30000` at 30 fps;
- x264 CRF 18 review;
- Rec.709 limited-range tags;
- 48 kHz AAC;
- measured two-pass `loudnorm`, followed by measurement of decoded AAC;
- a pre-AAC true-peak target around `-2.5 dBTP`, providing practical headroom for a decoded `-1 dBTP` gate.

Review output passed exact frame rate, clean decode, eye cuts, and roughly -16 LUFS-I.

## What failed or remained limited

### Resolve external API

Installed Resolve was Free (`ManifestLite`), not Studio. Free UI lacked **External scripting using**. External Python connection returned false despite app reaching Ready. Shared API docs describe methods available across editions but do not grant Free external access.

Resolution: FCPXML handoff plus one manual import. Never patch licensing or automate GUI clicks.

### Forced H.264 level

Explicit `-level 4.2` produced an absurd macroblock-rate warning due concat timebase. Omitting forced level and enforcing CFR/timescale let encoder choose correct Level 4.0.

### Loudness and codec peak movement

One-pass normalization missed target by over 1 LU on short review. Measured two-pass normalization brought decoded result within 0.5 LU. A `-1.5 dBTP` pre-AAC target still produced `-0.87 dBTP` after decoding in one long talk. A limiter-only retry worsened the measured inter-sample peak to `-0.61 dBTP`. A measured two-pass retry targeting `-2.5 dBTP` produced `-16.23 LUFS-I` and `-1.84 dBTP`. Measure final decoded AAC; never reason from filter input or sample peaks alone.

### ASR cache mismatch

Calling a lower-level MLX Whisper executable directly used a different Hugging Face cache from the established wrapper and began model hydration. This violated the intended approval gate even though ASR stayed local. Use the configured wrapper, inspect cache readiness explicitly, and ask before invoking any uncached alternative model or executable.

### Scene detection and silence cutters

Locked continuous cameras had few meaningful visual scene changes. Semantic transcript and product actions mattered more. Generic silence deletion risked damaging natural speech and handling rhythm. PySceneDetect/auto-editor were not useful defaults.

### Source limitations

- 8-bit H.264 at low combined bitrate: avoid aggressive grade, denoise, or sharpening.
- Overhead hand sometimes blocked cards: automation can detect timing, not communicative usefulness reliably.
- Front/overhead color mismatch: review render left color untreated; Resolve scope-based finishing needed.
- Portrait crops inherently upscale a narrow source region.
- FCPXML files can be structurally valid while NLE transform interpretation remains visually unverified.

## Agentic discipline

- Keep source hashes and exact source timecodes.
- Keep raw ASR separate from cleaned transcript.
- Make choices inspectable: quote, reason, confidence, rejection reason.
- Agent proposes; human approves story and final watch.
- Render low-cost review before NLE handoff or archive master.
- Version outputs; do not silently overwrite.
- Failed gates remain evidence, not content to rationalize away.
- Prefer one representative pilot before batching.

## Editorial heuristics

### Longform

Use front angle for narrative connection. Cut overhead on an actual product action or explanatory reference. Preserve J/L-cut audio continuity when moving to NLE. Remove false starts, duplicates, setup, and teardown while retaining breaths and intelligible pacing.

### Shortform

Choose one standalone promise/payoff. Start with a truthful subject-complete hook. Rebuild framing from source. Keep face eye line stable, protect caption/UI safe zones, and avoid showing details obscured by hands. Platform maximum length is not a target.

### Color/audio/captions

Preserve Rec.709 unless source proves otherwise. Match cameras before style. Dialogue target around -14 to -16 LUFS-I is a house choice, not official platform law. Keep decoded true peak at or below -1 dBTP. Human-check all captions, especially names, numbers, URLs, prices, and negations.
