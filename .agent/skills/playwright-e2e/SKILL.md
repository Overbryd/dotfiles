---
name: playwright-e2e
description: Run browser end-to-end checks against local or remote web servers using a shared global Python Playwright install. Use for Playwright, browser automation, e2e tests, screenshots, videos, traces, visual smoke tests, and verifying web UI behavior without installing Playwright into the project.
---

# Playwright E2E

Use this skill to run real browser checks from any project with the shared Python `pi-playwright-e2e` runner.

## Rules

- Do not install Playwright into the project for one-off Pi checks.
- Do not run `npm init playwright`, `npm install playwright`, `npm install @playwright/test`, or `npx playwright` in the project unless the user explicitly asks for project-local Playwright.
- Do not add Python Playwright dependencies to the project for one-off Pi checks.
- Use the global runner: `pi-playwright-e2e`.
- Write scenarios in Python.
- The project decides whether a local server must be started. Inspect project docs/scripts first, or use the URL the user gives.
- For remote targets, never start a local server unless the user asks.
- Save artifacts under `.pi/playwright-runs/` by default. Do not commit them unless asked.

## One-time setup

If `pi-playwright-e2e` says Playwright is missing, run:

```bash
~/dotfiles/.agent/skills/playwright-e2e/scripts/install.sh chromium
```

Install more browsers only when needed:

```bash
~/dotfiles/.agent/skills/playwright-e2e/scripts/install.sh chromium firefox webkit
```

This creates a dedicated Python virtualenv in `~/.local/share/pi-playwright/venv`, installs the `playwright` Python package there, and installs browsers into Playwright's shared browser cache. It does not install anything into the current project.

## Workflow

1. Determine target URL.
   - If user gave URL, use it.
   - If local server needed, inspect project scripts/docs, start existing server command, and wait until reachable.
2. Write a small Python scenario file, usually under `.pi/playwright-scenarios/<name>.py`.
3. Run `pi-playwright-e2e --url <url> --scenario <file>`.
4. Read `summary.json`; inspect screenshots with `read` when useful; report video/trace paths to user.

## Scenario file format

Scenario files define `run(ctx)` or `scenario(ctx)`. They receive Playwright objects from the global runner, so they do not import Playwright.

```python
def run(ctx):
    ctx.step("open app", lambda: ctx.page.goto(ctx.base_url))

    def check_title():
        ctx.expect(ctx.page).to_have_title("My App")

    ctx.step("check title", check_title)
    ctx.screenshot("home")
```

Available `ctx` fields:

- `ctx.page`, `ctx.context`, `ctx.browser` - Playwright objects.
- `ctx.expect` - Python Playwright expect function.
- `ctx.base_url` - URL from `--url`.
- `ctx.project_dir` - directory where Pi was invoked.
- `ctx.artifacts_dir` - per-run artifact directory.
- `ctx.screenshot(name, **options)` - saves PNG under `screenshots/`; defaults to full page.
- `ctx.step(name, fn)` - logs a named step and runs `fn`.

## Runner examples

Basic run with video and final screenshot:

```bash
pi-playwright-e2e --url http://localhost:3000 --scenario .pi/playwright-scenarios/smoke.py
```

Run headed:

```bash
pi-playwright-e2e --headed --url http://localhost:3000 --scenario .pi/playwright-scenarios/smoke.py
```

Record trace too:

```bash
pi-playwright-e2e --trace --url http://localhost:3000 --scenario .pi/playwright-scenarios/smoke.py
```

Disable video when user only wants screenshots:

```bash
pi-playwright-e2e --no-video --url http://localhost:3000 --scenario .pi/playwright-scenarios/smoke.py
```

Open artifact folder on macOS:

```bash
pi-playwright-e2e --open --url http://localhost:3000 --scenario .pi/playwright-scenarios/smoke.py
```

## Good test style

- Prefer role and label locators: `get_by_role`, `get_by_label`, `get_by_text`.
- Avoid brittle CSS selectors unless needed.
- Use web-first assertions: `ctx.expect(locator).to_be_visible()`.
- Avoid fixed sleeps. Wait for URL, role, text, response, or network condition.
- Keep one-off scenarios small and explicit.
- On failure, use the failure screenshot, video, and trace before changing code.

## Artifact policy

- Default output: `.pi/playwright-runs/<timestamp>/`.
- Runner writes `summary.json` with status, URL, screenshots, videos, trace, and error.
- Videos are WebM files under `videos/`.
- Traces are zip files; inspect with Playwright trace viewer outside Pi if needed.
- Screenshots can be read directly by Pi's `read` tool.
