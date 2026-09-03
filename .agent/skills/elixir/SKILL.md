---
name: elixir
description: Elixir, Phoenix, Ecto, and Mix coding conventions. Use when editing .ex or .exs files.
---

# Elixir conventions

Use when editing `*.ex` or `*.exs`.

## Verification

- Run `mix format` after implementation.
- Run `mix compile --warnings-as-errors` after implementation.
- Unit tests in `test/` mirror `lib/`; integration tests live in `e2e/`.
- Use one `describe "function/arity"` per function under test.
- Prefer exact assertions with useful failure messages.

## Design

- Prefer standard library. Avoid wrapper helpers.
- Use Ecto embedded schemas for casting external data.
- Prefer pattern matching, multi-clause functions, `with`, `case`, and `cond` over type-switch branching.
- Prefer pipelines and direct expressions over temporary variables.
- Inline variables into pipes when clear; use `then/2` or `tap/2` at pipe ends when useful.
- For controlled code, let it crash. Validate runtime input at outer boundaries.
- Keep aliases at module top. Avoid `_ = ...` when result is unused.
- For trees and recursion, prefer one public entry point plus recursive private clauses.
- Avoid semantic-light private helpers: trivial passthroughs, env getters, direct delegates, one-line queries, simple formatters, or one-line booleans unless reused or needed for pattern matching/recursion.
- Good helper names describe data or action: `reload/1`, `children_of/1`, `fields/1`, `expected_summary/1`.
