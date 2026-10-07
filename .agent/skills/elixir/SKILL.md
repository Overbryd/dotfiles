---
name: elixir
description: Elixir research, testing, and run conventions. Read before editing .ex/.exs files or adding Hex dependencies.
---

# Elixir

## Research

- Deps source first: `deps/<pkg>` = locked version. Guides, README, often native source. Hexdocs may lag.
- Newer releases: `mix hex.info <pkg>`. How past changes were made: upstream `git log -S`.
- Before `deps.get`: compare `elixir:` in `mix.exs` with `elixir --version`.
- Repo `AGENTS.md` conventions beat this skill.

## Tests

- `test/` mirrors `lib/`; integration in `e2e/`.
- One `describe "function/arity"` per function. Exact assertions.
- Tests must not open windows or start the full app: alias `test: "test --no-start"`; `start_supervised!` what the test needs.

## Running apps

- User may run the app already. Own instance: `MIX_BUILD_PATH=/private/tmp/<name>`; `/tmp` breaks relative `priv` symlinks on macOS.

## Design

- Prefer standard library. Avoid wrapper helpers.
- Inline variables into pipes when clear; use `then/2` or `tap/2` at pipe ends when useful.
- For controlled code, let it crash. Validate runtime input at outer boundaries.
- For trees and recursion, prefer one public entry point plus recursive private clauses.
- Casting external data: Ecto embedded schemas.
- No semantic-light private helpers: passthroughs, env getters, delegates, one-line queries/formatters/booleans. Unless reused or needed for matching/recursion.
