#!/usr/bin/env python3
"""Shared Python Playwright runner for Pi browser checks."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

DEFAULT_HOME = Path.home() / ".local" / "share" / "pi-playwright"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="pi-playwright-e2e",
        description="Run a Python Playwright scenario with the shared Pi Playwright install.",
    )
    parser.add_argument("--url", required=True, help="Base URL for page.goto(base_url)")
    parser.add_argument("--scenario", "--script", dest="scenario", required=True, help="Python scenario file")
    parser.add_argument("--out", default=".pi/playwright-runs", help="Artifact root")
    parser.add_argument("--browser", default="chromium", choices=["chromium", "firefox", "webkit"])
    parser.add_argument("--headed", action="store_true", help="Run headed")
    parser.add_argument("--video", choices=["on", "off"], default="on", help="Record video")
    parser.add_argument("--no-video", action="store_true", help="Disable video")
    parser.add_argument("--trace", action="store_true", help="Record Playwright trace zip")
    parser.add_argument("--viewport", default="1280x720", help="Viewport size")
    parser.add_argument("--timeout", type=int, default=30_000, help="Default timeout in milliseconds")
    parser.add_argument("--slow-mo", type=int, default=0, help="Slow motion delay in milliseconds")
    parser.add_argument("--final-screenshot", dest="final_screenshot", action="store_true", default=True)
    parser.add_argument("--no-final-screenshot", dest="final_screenshot", action="store_false")
    parser.add_argument("--open", action="store_true", help="Open artifact directory on macOS after run")
    args = parser.parse_args()

    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if args.slow_mo < 0:
        parser.error("--slow-mo must be non-negative")

    match = re.fullmatch(r"(\d+)x(\d+)", args.viewport.lower())
    if not match:
        parser.error("--viewport must look like 1280x720")
    args.viewport = {"width": int(match.group(1)), "height": int(match.group(2))}
    args.video = args.video == "on" and not args.no_video
    return args


def ensure_playwright_available() -> Any:
    try:
        from playwright.sync_api import expect, sync_playwright
    except ModuleNotFoundError as error:
        home = Path(os.environ.get("PI_PLAYWRIGHT_HOME", DEFAULT_HOME))
        raise SystemExit(
            f"Shared Python Playwright install not found. Run: "
            f"~/dotfiles/.agent/skills/playwright-e2e/scripts/install.sh chromium\n"
            f"Expected virtualenv under: {home / 'venv'}"
        ) from error

    return sync_playwright, expect


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace(":", "-").replace(".", "-").replace("+00-00", "Z")


def sanitize_name(name: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9._-]+", "-", name.strip()).strip("-")
    return sanitized or "screenshot"


def json_safe(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def load_scenario(project_dir: Path, scenario_path: str) -> tuple[Callable[[Any], Any], Path]:
    path = Path(scenario_path)
    absolute_path = path if path.is_absolute() else project_dir / path
    absolute_path = absolute_path.resolve()

    spec = importlib.util.spec_from_file_location("pi_playwright_scenario", absolute_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load scenario: {absolute_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    scenario = getattr(module, "run", None) or getattr(module, "scenario", None)
    if not callable(scenario):
        raise RuntimeError("Scenario must define run(ctx) or scenario(ctx)")

    return scenario, absolute_path


@dataclass
class ScenarioContext:
    page: Any
    context: Any
    browser: Any
    expect: Any
    base_url: str
    project_dir: Path
    artifacts_dir: Path
    screenshots_dir: Path
    summary: dict[str, Any]

    def screenshot(self, name: str, **options: Any) -> str:
        path = self.screenshots_dir / f"{sanitize_name(name)}.png"
        kwargs = {"path": str(path), "full_page": True}
        kwargs.update(options)
        self.page.screenshot(**kwargs)
        self.summary["screenshots"].append(str(path))
        print(f"screenshot: {path}", flush=True)
        return str(path)

    def step(self, name: str, fn: Callable[[], Any]) -> Any:
        print(f"step: {name}", flush=True)
        return fn()


def write_summary(summary: dict[str, Any]) -> None:
    summary["finishedAt"] = datetime.now(timezone.utc).isoformat()
    summary_path = Path(summary["artifactsDir"]) / "summary.json"
    summary["summaryPath"] = str(summary_path)
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def print_summary(summary: dict[str, Any]) -> None:
    print("")
    print(f"Playwright run {summary['status']}")
    print(f"Artifacts: {summary['artifactsDir']}")
    print(f"Summary: {summary['summaryPath']}")

    if summary["screenshots"]:
        print("Screenshots:")
        for path in summary["screenshots"]:
            print(f"- {path}")

    if summary["videos"]:
        print("Videos:")
        for path in summary["videos"]:
            print(f"- {path}")

    if summary.get("trace"):
        print(f"Trace: {summary['trace']}")

    if summary.get("error"):
        print("")
        print(summary["error"].get("stack") or summary["error"].get("message"))


def main() -> int:
    args = parse_args()
    sync_playwright, expect = ensure_playwright_available()

    project_dir = Path.cwd()
    artifact_root = Path(args.out)
    if not artifact_root.is_absolute():
        artifact_root = project_dir / artifact_root

    artifacts_dir = artifact_root / timestamp()
    screenshots_dir = artifacts_dir / "screenshots"
    videos_dir = artifacts_dir / "videos"
    traces_dir = artifacts_dir / "traces"

    screenshots_dir.mkdir(parents=True, exist_ok=True)
    if args.video:
        videos_dir.mkdir(parents=True, exist_ok=True)
    if args.trace:
        traces_dir.mkdir(parents=True, exist_ok=True)

    scenario, scenario_path = load_scenario(project_dir, args.scenario)

    summary: dict[str, Any] = {
        "status": "running",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "projectDir": str(project_dir),
        "baseURL": args.url,
        "browser": args.browser,
        "headed": args.headed,
        "scenario": str(scenario_path),
        "artifactsDir": str(artifacts_dir),
        "screenshots": [],
        "videos": [],
        "trace": None,
        "error": None,
        "result": None,
    }

    exit_code = 0
    browser = None
    context = None
    page = None
    video = None
    playwright_manager = None

    try:
        playwright_manager = sync_playwright().start()
        browser_type = getattr(playwright_manager, args.browser)
        browser = browser_type.launch(headless=not args.headed, slow_mo=args.slow_mo)
        context = browser.new_context(
            base_url=args.url,
            viewport=args.viewport,
            record_video_dir=str(videos_dir) if args.video else None,
            record_video_size=args.viewport if args.video else None,
        )
        context.set_default_timeout(args.timeout)
        context.set_default_navigation_timeout(args.timeout)

        if args.trace:
            context.tracing.start(screenshots=True, snapshots=True, sources=True)

        page = context.new_page()
        video = page.video

        scenario_context = ScenarioContext(
            page=page,
            context=context,
            browser=browser,
            expect=expect,
            base_url=args.url,
            project_dir=project_dir,
            artifacts_dir=artifacts_dir,
            screenshots_dir=screenshots_dir,
            summary=summary,
        )
        summary["result"] = json_safe(scenario(scenario_context))

        if args.final_screenshot:
            scenario_context.screenshot("final")

        summary["status"] = "passed"
    except Exception as error:  # noqa: BLE001 - scenario failures must become artifacts.
        exit_code = 1
        summary["status"] = "failed"
        summary["error"] = {"message": str(error), "stack": traceback.format_exc()}

        if page is not None:
            try:
                failure_context = ScenarioContext(
                    page=page,
                    context=context,
                    browser=browser,
                    expect=expect,
                    base_url=args.url,
                    project_dir=project_dir,
                    artifacts_dir=artifacts_dir,
                    screenshots_dir=screenshots_dir,
                    summary=summary,
                )
                failure_context.screenshot("failure")
            except Exception:
                pass
    finally:
        if context is not None:
            if args.trace:
                trace_path = traces_dir / "trace.zip"
                try:
                    context.tracing.stop(path=str(trace_path))
                    summary["trace"] = str(trace_path)
                except Exception as error:  # noqa: BLE001
                    summary["traceError"] = str(error)

            try:
                context.close()
            except Exception:
                pass

        if video is not None:
            try:
                summary["videos"].append(video.path())
            except Exception as error:  # noqa: BLE001
                summary["videoError"] = str(error)

        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass

        if playwright_manager is not None:
            try:
                playwright_manager.stop()
            except Exception:
                pass

        write_summary(summary)

        if args.open and sys.platform == "darwin":
            subprocess.Popen(["open", str(artifacts_dir)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print_summary(summary)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
