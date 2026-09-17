---
name: software-tour-video
description: Creates slow, captioned local software change-tour videos with Playwright, packages them as phone-compatible H.264 MP4 files, performs visual/decode QC, and places them in Dropbox Videos. Use when a user asks for walkthrough, demo, release, issue, or feature videos to watch on a phone or sync through Dropbox.
compatibility: macOS or Linux with pi-playwright-e2e, Chromium, FFmpeg/ffprobe; Dropbox optional.
---

# Software change-tour videos

Create concise visual tours from verified local behavior and implementation evidence. Use the shared `playwright-e2e` skill/runner; never install Playwright into the target project for a one-off tour.

## Defaults

- One video per issue/topic, ordered as requested.
- Slow, silent, captioned presentation unless narration is explicitly requested.
- Landscape `1440x900`, large type, high contrast, H.264/yuv420p MP4.
- Six to ten seconds per explanatory card; longer for dense UI.
- Destination:
  1. `~/Dropbox/Videos/` when present;
  2. otherwise `~/Library/CloudStorage/Dropbox-Personal/Videos/` when present;
  3. otherwise ask for a destination.
- Put related files in `YYYY-MM-DD <Project> <Topic> Tour/` and prefix filenames with viewing order.

## Safety and truthfulness

- Default to local environments. Never mutate production to stage a demo.
- Prefer synthetic, namespaced demo records over customer or personal data.
- Do not expose real passwords, tokens, internal URLs, customer names, or private records in frames.
- If local demo data is needed, write repeatable setup and cleanup, record identifiers, and verify cleanup afterward.
- Explanatory diagrams may summarize backend behavior, but must match reviewed code/tests. Do not present a mock as live application behavior.
- Production/release claims require actual pipeline and deployed-system evidence.
- Preserve the project's pre-existing worktree state. Keep scenarios/artifacts ignored or under `.pi/`/`/tmp`.
- Do not claim Dropbox sync completed. Report that files were placed there; sync state belongs to the Dropbox client.

## Plan the tour

For each topic, classify the material:

- **Visible UI change:** record the real local app and representative state.
- **Backend/race/security/infrastructure change:** use readable animated cards or flow diagrams derived from code and tests.
- **Mixed change:** start with the problem, show real UI, then explain invisible safeguards.

Tell a small story:

1. problem or former behavior;
2. changed behavior;
3. why it matters;
4. verification/release result.

Avoid a long code diff scroll. Show implementation details only when they explain behavior better than a diagram.

## Prepare local application state

1. Inspect project start, database, seed, authentication, and E2E conventions.
2. Reuse one local server for all related recordings.
3. Create the minimum synthetic data needed for visible acceptance criteria.
4. Assert the target page/state before editorial pauses.
5. Record setup/cleanup commands and stop the server after recording.

Never reset a developer database merely for a tour. Use namespaced rows plus cleanup, or a project-approved isolated database.

## Write Playwright scenarios

Store one-off scenarios under `.pi/playwright-scenarios/` or `.pi/video-tour/`.

Use semantic locators and web-first assertions for behavior. Fixed waits are acceptable only after assertions, to make captions readable.

Recommended run:

```bash
pi-playwright-e2e \
  --url http://127.0.0.1:6001 \
  --scenario .pi/video-tour/issue-123.py \
  --out /tmp/project-video-tour-123 \
  --viewport 1440x900 \
  --slow-mo 450 \
  --timeout 20000 \
  --final-screenshot
```

### Visual rules

- Main title: about 52–64 px; body: 24–30 px; UI callout: at least 20 px.
- Keep captions inside generous phone-safe margins.
- Use fixed bottom callouts over UI; do not cover the changed element.
- Highlight the real changed element with an outline/shadow, not a misleading replacement.
- Limit cards to one idea and four short bullets.
- Use the user's language unless project terminology requires otherwise.
- Static first cards can be omitted by browser video optimization. Trigger a DOM update or subtle CSS animation before the opening wait so the title is captured.
- Never rely on native hover tooltips as the only explanation; add visible captions.

Read `summary.json` after every run. A failed scenario can still produce a video; never publish that artifact as the final tour.

## Package for phone and Dropbox

Playwright emits WebM. Convert and validate with the bundled script:

```bash
python3 scripts/package_tour.py \
  /tmp/run/videos/page.webm \
  "~/Dropbox/Videos/YYYY-MM-DD Project Tour/01 - Issue 123.mp4" \
  --contact-sheet /tmp/issue-123-contact.png
```

Paths containing `~` are expanded by the script when not shell-quoted as a literal. Prefer `$HOME/...` in shell commands.

The packager:

- creates H.264/yuv420p MP4 with `faststart`;
- drops audio by default, or converts it to AAC with `--keep-audio`;
- writes atomically;
- refuses overwrite unless `--force` was explicitly approved;
- decodes the complete result and validates codec, pixel format, dimensions, and duration;
- optionally creates a 10%/50%/90% contact sheet.

## Required QC

For every final video:

1. Playwright summary says passed.
2. Inspect final screenshot and contact sheet with the image reader.
3. Confirm opening, changed behavior, and ending are all present.
4. Decode the entire MP4 without errors (the packager does this).
5. Confirm H.264, yuv420p, dimensions, duration, and reasonable size from packager output.
6. Verify filenames sort in requested order.
7. Verify demo data removed, local server stopped, and project worktree preserved.
8. Confirm Dropbox client is running when Dropbox delivery was requested, but do not overstate sync completion.

## Report

Return the destination folder, filenames, durations, whether videos are silent/captioned or narrated, and QC result. Mention cleanup. Keep raw browser artifacts outside Dropbox unless the user asks for them.
