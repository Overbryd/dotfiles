#!/usr/bin/env bash
set -euo pipefail

PI_PLAYWRIGHT_HOME="${PI_PLAYWRIGHT_HOME:-$HOME/.local/share/pi-playwright}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

browsers=("$@")
if [ "${#browsers[@]}" -eq 0 ]; then
  browsers=(chromium)
fi

mkdir -p "$PI_PLAYWRIGHT_HOME"
"$PYTHON_BIN" -m venv "$PI_PLAYWRIGHT_HOME/venv"
"$PI_PLAYWRIGHT_HOME/venv/bin/python" -m pip install --upgrade pip
"$PI_PLAYWRIGHT_HOME/venv/bin/python" -m pip install --upgrade playwright
"$PI_PLAYWRIGHT_HOME/venv/bin/python" -m playwright install "${browsers[@]}"

printf '\nInstalled shared Python Playwright in %s\n' "$PI_PLAYWRIGHT_HOME"
printf 'Python: %s\n' "$PI_PLAYWRIGHT_HOME/venv/bin/python"
printf 'Browsers installed: %s\n' "${browsers[*]}"
