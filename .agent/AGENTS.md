# General

- On existing code bases research the code for the given task for the planning phase.
- On fresh code bases properly architect the software, scope its requirements and dependencies. If uncertain, ask.
- Remove excessive commentary after an implementation phase.
- Rule of three: Only generalize or optimize code if there are three occurences of the same or similar thing.

## Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, research or ask. Name what is confusing. Ask.

## Test first

Before implementing:

Think about how to test the code you are abou to write.
Let the test fail, check for your expected error, then implement the code, and make the test pass.
Rinse and repeat, refactor once you are done.

- Try to write one test at a time, not the whole suite.
- Once you run all tests and steps, run the whole suite.
- If you encounter problems with your tests and setup, go back one round and adjust your thinking.

## Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/aliases/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- The test: Every changed line should trace directly to the user's request.

## Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

# CLI tools on this system

- You cannot use `brew install` on my system, it will fail and is locked down behind password. Always ask the user for that.
- There is a Postgres database running 24/7 on the machine. You may use it with default user and password for all my projects, with one database per project. `psql` is available for it with `-hlocalhost`.
- `exa` can be used to perform ultra fast searches, returning one url per line.
- `curl` is installed, with an alias `hurl` to only query for response headers. Especially useful for API queries and in combination with `jq`.
- `jq` is installed, useful to filter, transform and work with JSON or NDJSON outputs.
- `yaml-to-json` converst YAML to JSON. You can use that in a pipe with `jq` for querying.
- `json-to-yaml` converts JSON to YAML.

More custom tools are in `~/.bin`.

# Elixir

- Use `mix format` after an implementation phase.
- Use `mix compile --warnings-as-errors` after an implementation phase.
- Tests in `test/` follow the same folder structure as in `lib/` for unit tests
- Unit tests have one `describe "..."` per function under test, e.g. `describe "function_name/1"`
- A unit test file may be followed with a subfolder of the same name, to implement more extensive testing scenarios per file.
- Integration tests, if any, are in `e2e/` and provide one test per feature.
- Use standard library calls, avoid creating wrapper functions.
- Use Ecto embedded schemas to build structs that need to be casted from external data (e.g. JSON, NDJSON, YAML, params, etc.)
- When control flow is needed, prefer pattern matching `with`, `case` and `cond` over `if`.
- Prefer function overloading with pattern matching over control flow to simplify function bodies.
- Inline variable definitions into pipe chains whenever possible; avoid intermediate assignments.
- Prefer pipe chains with `then/2` or `tap/2` at the end over assigning intermediate variables for return tuples.
- Prefer "Let it crash" semantics over defensive runtime checks, especially for code paths we control.
- Reserve runtime checks for user input at the outmost layer (Context, Controller or LiveView).
- Use `alias` at the top of the module instead of fully qualified module names.
- When processing data we control ourselves, prefer to "let it crash" semantics over defensive error handling.

