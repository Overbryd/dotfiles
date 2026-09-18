---
name: transcribe
description: Transcribes local audio or video with sayneat, including timestamps, terminology hints, and optional anonymous speaker turns.
compatibility: sayneat CLI.
disable-model-invocation: true
---

# Local transcription with sayneat

Always invoke `sayneat` directly. Never build, use, or improve a parallel transcription wrapper here. ASR fixes and features belong in `sayneat`.

## Transcribe

Robust default:

```bash
sayneat --transcribe \
  --language de \
  --transcript-format markdown \
  --out transcript.md \
  "/path/to/recording.mkv"
```

Machine-readable output:

```bash
sayneat --transcribe \
  --language de \
  --transcript-format json \
  --out transcript.json \
  "/path/to/recording.mkv"
```

Use Qwen3 when terminology hints improve a representative sample:

```bash
sayneat --transcribe \
  --transcribe-model qwen3 \
  --language de \
  --terms 'product name,person name,acronym' \
  --transcript-format markdown \
  --out transcript.md \
  "/path/to/recording.mkv"
```

Prefer `--terms-file FILE` for longer lists. Compare Whisper and Qwen3 on a short representative extract when accuracy matters; choose from evidence, not reputation.

Optional anonymous speaker turns:

```bash
sayneat --transcribe \
  --language de \
  --diarize \
  --speakers 2 \
  --transcript-format markdown \
  --out transcript.md \
  "/path/to/recording.mkv"
```

Diarization labels turns, not identities. Never infer identity from filename, face, channel, or loudness. Ask or retain anonymous labels.

## Rules

- Keep transcription local. Do not upload recordings to external ASR services.
- Ask before `sayneat --setup` or any missing model download.
- Use a new output path unless replacement was explicitly requested.
- Preserve machine-readable output for audit or later cleanup.
- Never publish raw ASR as authoritative.
- Check names, numbers, URLs, negations, decisions, and unclear passages against audio.
- Mark unresolved audio explicitly; never invent missing words.
- For legal, contractual, medical, or security-critical use, require human review.

## Discover current options

`sayneat` owns its models, caches, flags, and implementation:

```bash
sayneat --help
sayneat --models
sayneat --setup
```

When a needed capability is absent or broken, report it against `sayneat`; do not add local transcription machinery to this skill.
