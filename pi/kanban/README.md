# File-based Kanban for `pi`

This folder is the executable workflow layer for the repo.
It is usually created or refreshed with `kanban setup`.

## Purpose

Use `.kanban/` to track work as tickets moving through explicit lanes.

Use `.plans/` as the long-form reference layer for:

- architecture
- product intent
- data model
- AI runtime direction
- ingestion design
- visual direction
- delivery sequencing

Do **not** copy `.plans/` documents verbatim into tickets.

Instead:

- `.plans/` stays canonical for reference and rationale
- `.kanban/` holds executable tickets derived from those plans
- tickets should link back to the relevant `.plans/*` files

## Hard backbone vs soft roles

This kanban is designed to work with a tmux-based supervisor.

### Hard backbone

The hard backbone is a deterministic shell script started from a tmux pane:

- `kanban backbone`

It is responsible for:

- keeping the project tmux window alive
- ensuring the manager pane exists
- periodically healthchecking the manager
- nudging the manager when it appears idle
- hard-resetting role panes when the system is clearly stuck
- running one-off recovery before restarting orchestration

The backbone is intentionally dumb.
It should not interpret tickets or make product decisions.

### Soft roles

The soft roles are `pi` agents usually started in tmux panes by the manager.

A special exception is the user-owned `operator` session, which is started manually with `kanban operator`.

They are responsible for:

- reading `.kanban/`
- reading relevant `.plans/*`
- doing research, planning, implementation, review, or recovery work
- updating tickets and repo state

Soft roles may be restarted at any time.

## Source of truth

The source of truth is:

1. `.kanban/`
2. git state
3. checkpoint tags
4. recovery notes in `.kanban/runtime/`

Terminal output is **not** the source of truth.
It is only a liveness and debugging signal.

If a role is restarted, it must rebuild context from files and git state, not from memory.

## tmux model

Start the system **inside an existing tmux window** by running:

```bash
kanban backbone
```

The backbone will:

- treat the current pane as the backbone pane
- rename the current window to the project folder name
- title the backbone pane as `<project_name>:backbone`
- enforce at most one backbone pane in that project window
- enable pane border titles for the window
- lock the project window against application-driven tmux title changes so managed pane titles stay stable
- start the manager in a separate pane

### Pane naming

Role panes are titled as:

```text
<project_name>:<role>
```

Examples:

```text
my_project:backbone
my_project:manager
```

Kanban relies on these pane titles for role discovery and recovery. Because interactive `pi` tries to set the terminal title itself, the kanban scripts disable tmux `allow-set-title` for the managed project window and role panes so `pi` cannot overwrite the managed pane titles.

### Uniqueness rule

There must be **at most one active pane per role** in the project window.

The manager should use helper scripts to enforce this.

## Runtime layout

Runtime artifacts live under:

```text
.kanban/runtime/
  sessions/
  state/
  logs/
  recovery/
```

This directory is for ephemeral or generated supervisor state.

Operator chat sessions started with `kanban operator` are stored separately under:

```text
.kanban/runtime/state/operator-sessions/
```

## Operator coordination files

If the system needs something from its operator, it may create and use these files:

- `.kanban/operator-blocker.md` — the single current operator-facing blocker summary
- `.kanban/operator-todo.md` — the clean actionable checklist for operator answers, review, or sign-off

They are optional and should be created or updated only when needed. Keep them short, current, and authoritative.

## Lane model

### `0-open/`
Raw intake.

Use for:

- new prompts
- new ideas
- bugs
- questions
- rough feature requests
- user-owned prerequisites not yet incorporated into active work
- review notes or draft tickets that are still being written

These files may be incomplete.

Priority behavior in `0-open/`:

- a ticket in `0-open/` with no `priority` set is ignored by the manager
- `priority: ignore` also keeps a ticket out of active processing
- `priority: immediate` makes a `0-open/` ticket actionable immediately and gives it the highest pickup priority

### `1-to_refine/`
Research and shaping lane.

Use for tickets that need:

- codebase research
- scope clarification
- splitting
- acceptance criteria
- dependency mapping
- design or architecture discussion

### `2-planned/`
Ready and ordered work.

Only put tickets here when they are refined enough to implement.

Files in this lane must be prefixed with execution order, for example:

- `01-some-ticket.md`
- `01a-follow-on-ticket.md`
- `02-next-ticket.md`

### `3-in_progress/`
Claimed work.

This lane should have very low WIP.
Usually one ticket, occasionally a few.

### `4-in_review/`
Waiting for verification.

Only tickets actively being reviewed belong here.

### `5-done/`
Completed and verified work.

A ticket belongs here only after its acceptance criteria were checked.

## Stable identity

Each ticket has a stable internal ID in YAML frontmatter, for example:

- `KB-0001`
- `KB-0002`

The stable ID is the real identity.

Filename order is only a queue mechanism for `2-planned/`.

## Ticket file format

Use Markdown with minimal YAML frontmatter.

These keys belong in frontmatter:

- `id`
- `type`
- `depends_on`
- `minimum_thinking`

Optional frontmatter key:

- `priority` — `ignore` or `immediate`

Everything else belongs in the Markdown body.

Example:

```md
---
id: KB-0007
type: feature
depends_on:
  - KB-0006
minimum_thinking: high
---

# Split compile-time and runtime config layout

## Summary
...
```

## Filename conventions

Recommended naming:

- `0-open/KB-0002-provide-s3-credentials.md`
- `1-to_refine/KB-0011-onboarding-engine-skeleton.md`
- `2-planned/01-normalize-umbrella-app-boundaries.md`
- `3-in_progress/KB-0007-split-config-layout.md`
- `4-in_review/KB-0007-split-config-layout.md`
- `5-done/KB-0001-reality-check-and-plan-alignment.md`

When moving a planned ticket out of `2-planned/`, switch back to the stable-ID filename.

## Dependencies and blockers

Track dependencies in `depends_on`.

Use:

- ticket IDs like `KB-0007`
- explicit external prerequisites when needed, such as `user:s3_credentials`

If a ticket is blocked, state that clearly in the body as well.

## Movement rules

- Use `git mv` when moving tickets between lanes.
- Update the ticket body when the lane changes.
- If implementation starts, the ticket must move to `3-in_progress/`.
- If review fails, move it back to `3-in_progress/` or `2-planned/`.
- Keep `3-in_progress/` and `4-in_review/` small and current.
- The manager is responsible for continuously moving work forward across `0-open/` -> `1-to_refine/` -> `2-planned/` -> `3-in_progress/` -> `4-in_review/` -> `5-done/`.
- `1-to_refine/` is not a parking lot. When no higher-priority implementation or review work should go first, the manager should launch a real refinement pass.

## Priority rules

Priority is an override on top of the lane system. Tickets still move through the same lanes normally.

Priority order:

1. `priority: immediate` tickets — highest user-requestable priority
2. `reality-check` findings ticket and its derived cleanup stream
3. other normal tickets
4. `priority: ignore` tickets and `0-open/` tickets with no `priority` — not actionable

Execution rules:

- If any immediate tickets exist, the manager should finish the current active pass safely and then keep the system focused on immediate tickets until none remain.
- Immediate tickets should be worked in series, not sprayed across the board speculatively.
- Immediate tickets outrank both normal work and reality-check work.
- Reality-check findings and their cleanup follow-ons outrank other normal work, but do not outrank immediate tickets.
- A due `reality-check` is periodic and non-preemptive: it never justifies stopping a still-useful running pane mid-pass, and should be deferred until a later backbone nudge after that pane reaches a clear stop.
- A ticket with `priority: ignore` is ignored from processing until its priority changes.
- A ticket in `0-open/` with no `priority` is also ignored from processing.
- Outside `0-open/`, a ticket with no `priority` is treated as normal work.

Within a given priority class, the manager should still preserve lane discipline:

1. finish or reconcile active work already in `4-in_review/` and `3-in_progress/`
2. keep `2-planned/` ordered so the next ready ticket is obvious
3. when no clearer higher-priority implementation or review task exists, move the best ticket in `1-to_refine/` forward by starting a `refiner`
4. when the next best actionable work lives in `0-open/`, pull it forward into refinement first

A reality-check child ticket should keep an explicit link back to the active findings ticket, preferably through `depends_on` or direct ticket references in the body.

## Helper commands

The manager and backbone should prefer the `kanban` helper commands over ad hoc tmux manipulation.

Important commands:

- `kanban list-roles` — list active role panes in the project window
- `kanban capture-role <role>` — inspect the latest output from a role pane
- `kanban start-role <role> [ticket]` — launch a role pane for a specific task
- `kanban stop-role <role>` — stop a stale or completed role pane
- `kanban send-role <role> <message>` — send a focused nudge to an existing role pane
- `kanban operator` — start a fresh user-owned operator chat session for this project
- `kanban checkpoint-ticket <ticket>` — create the done-state checkpoint after review acceptance
- `kanban healthcheck-manager` — deterministic health signal used by the backbone
- `kanban recover` / `kanban hard-reset` — recovery tools for bad states

## Pi model and thinking policy

Role launches under `kanban start-role` use these defaults:

- primary provider: `openai-codex`
- fallback provider: `openai`
- default model: `gpt-5.4`

Thinking policy:

- `reviewer`, `refiner`, and `reality-check` always run at `xhigh`
- `manager`, `planner`, and `recovery` default to `high`
- other roles default to `medium`
- non-review/refine/reality-check roles are capped at `high`
- a ticket may raise the minimum required level through `minimum_thinking`

Fallback policy:

- use `gpt-5.4 [openai-codex]` by default
- only switch a role to `gpt-5.4 [openai]` when Codex is actually rate-limited
- when a deliberate fallback is needed, restart that role with `kanban start-role ... --provider openai`

### Main commands

- `kanban setup` — create or refresh the project-local `.kanban/` skeleton
- `kanban backbone` — start the hard supervisor loop in the current tmux window
- `kanban operator [--pane|--window]` — start a fresh user-owned operator session for this project
- `kanban start-role <role> [ticket] [--provider <name>] [--thinking <level>]` — start a role pane if it does not already exist
- `kanban stop-role <role>` — stop a role pane
- `kanban list-roles` — list active role panes in the project window
- `kanban capture-role <role>` — capture pane output for a role
- `kanban send-role <role> <message>` — send a prompt or command into a role pane
- `kanban healthcheck-manager` — classify manager health from deterministic tmux history and pane signals
- `kanban hard-reset` — kill all role panes in the project window
- `kanban recover` — run one-off recovery in print mode
- `kanban checkpoint-ticket <ticket>` — create a checkpoint commit/tag after a ticket is done

### Useful environment knobs

- `PI_KANBAN_PRIMARY_PROVIDER` — default provider for new role launches
- `PI_KANBAN_FALLBACK_PROVIDER` — provider to use only on deliberate rate-limit fallback restarts
- `PI_KANBAN_DEFAULT_MODEL` — default model for new role launches
- `PI_KANBAN_REALITY_CHECK_INTERVAL_SECONDS` — elapsed-time threshold for requiring a `reality-check` run, default `7200`
- `PI_KANBAN_REALITY_CHECK_TICKET_INTERVAL` — completed-ticket threshold for requiring a `reality-check` run, default `3`
- `PI_BACKBONE_SLEEP_SECONDS` — supervisor sleep between healthchecks, default `10`
- `PI_BACKBONE_STALE_NUDGE_COOLDOWN_SECONDS` — minimum seconds between stale-pane-triggered early nudges, default `120`
- `PI_BACKBONE_NUDGE_COOLDOWN_SECONDS` — fallback periodic nudge interval when the manager remains idle, default `1800`
- `PI_BACKBONE_STALE_PANE_LINES` — pane lines sampled for stale-pane detection, default `100`
- `PI_BACKBONE_STALE_PANE_CONSECUTIVE_CHECKS` — unchanged consecutive checks required before a managed pane is considered stale, default `6`
- `PI_BACKBONE_MANAGER_COMPACT_IDLE_COUNT` — minimum consecutive idle healthchecks before backbone may send `/compact`, default `8`
- `PI_BACKBONE_MANAGER_COMPACT_COOLDOWN_SECONDS` — minimum seconds between backbone-issued manager `/compact` commands, default `1800`
- `PI_KANBAN_SEND_ROLE_TIMEOUT_SECONDS` — timeout for backbone manager nudges sent through `kanban send-role`, default `10`
- `PI_BACKBONE_MAX_RUNTIME_SECONDS` — maximum supervisor runtime before clean exit
- `PI_BACKBONE_HEALTH_LINES` — manager pane lines captured for healthchecks
- `PI_BACKBONE_STUCK_SUSPICION_SECONDS` — sustained suspicion window before hard reset
- `PI_BACKBONE_RECOVERY_TIMEOUT_SECONDS` — timeout for one-off recovery
- `PI_BACKBONE_RECOVERY_PROVIDER` / `PI_BACKBONE_RECOVERY_MODEL` — optional provider/model override for recovery

## Checkpoints

Done-state recovery is based on **commits plus tags**.

### Rule

When a ticket is accepted and moved to `5-done/`, the manager should run:

```bash
kanban checkpoint-ticket <path-to-done-ticket>
```

### What this does

The checkpoint script will:

- create a git commit if the worktree is dirty
- create a historical done tag for that ticket
- update the moving tag `kanban/last-known-good`

### Why

This gives recovery a clear, boring, inspectable rollback point.

## Reality-check cadence

The broader `reality-check` role is used to catch drift, half-finished work, excessive mocks or stubs, and other signs that the system is becoming less real than it should be.

The manager should ensure `reality-check` runs at least once every 2 hours or after 3 checkpointed tickets, whichever comes first.

A due `reality-check` is periodic and non-preemptive: if useful implementation, review, or refinement work is already running, the manager should not stop that pane just to satisfy the cadence. Instead, the manager should defer the `reality-check` launch until a later backbone nudge after the active pane reaches a clear stop.

Each `reality-check` run should rebuild fresh context, start from a fresh session without resuming old role-chat history, and update at most one findings ticket.

If `reality-check` produces or updates a findings ticket, the manager should treat that findings ticket and its linked cleanup follow-ons as the highest-priority refinement/planning/implementation stream ahead of unrelated normal work until the cleanup run has been properly shaped and advanced.

However, `priority: immediate` still outranks both the findings ticket and its cleanup follow-ons.

## Recovery

A hard reset means:

1. kill all role panes in the project window
2. run one-off recovery in non-interactive `pi` print mode
3. restart the manager from scratch

Recovery should prefer the last known good checkpoint tag over guesswork.

## Healthchecks

The backbone healthchecks the manager periodically.

### Outcomes

- `working` — manager output is changing or clearly progressing
- `idle` — manager looks alive but inactive enough to need a nudge
- `suspect` — manager tail contains repeated error-like signals, but not long enough yet to justify a hard reset
- `stuck` — manager looks blocked by sustained error-like failure and should be hard-reset
- `missing` — manager pane is gone
- `restart` — manager session looks corrupted enough that hard reset is safer

The healthcheck is deterministic. It relies on tmux history movement, manager pane identity, and pane stability signals. Error-like output only escalates to `stuck` after a sustained suspicion window, which defaults to 15 minutes.

### Nudge behavior

If the manager appears idle, the backbone may send:

- an earlier periodic healthcheck prompt when all backbone-managed panes appear stale by repeated unchanged pane-output fingerprints
- a fallback periodic healthcheck prompt only after the manager has gone un-nudged for the normal cooldown
- a less-frequent `/compact`, followed by a periodic healthcheck prompt only after extended repeated idleness and subject to a separate compact cooldown
- a periodic healthcheck prompt that explicitly calls out when `reality-check` is due by elapsed time or by completed-ticket count

When there is no processable ticket left in `0-open/`, `1-to_refine/`, `2-planned/`, `3-in_progress/`, or `4-in_review/` and no managed worker pane remains active, the backbone switches to a special file-watch idle mode instead of repeatedly nudging the manager. In that mode it watches lane state changes, including priority changes that make a previously ignored ticket actionable, before waking the manager again.

A periodic healthcheck prompt is meant to trigger one bounded reconciliation pass, not an open-ended self-driven loop. That pass may still launch the next clear worker immediately when the previous step just finished and queue state now makes the follow-on action obvious.

To reduce interference, the backbone samples managed pane output frequently and suppresses repeated defer logs. If any managed pane is still changing, the backbone defers the early nudge; if all managed panes stay unchanged for the configured stale-window checks, it nudges the manager early once and then waits for fresh pane activity before repeating that early nudge.

If `reality-check` becomes due while a still-useful worker pane is already running, the manager should defer launching `reality-check` until a later backbone nudge rather than stopping the active pane just to satisfy the cadence.

The manager must know how to respond to these nudges.

## Agent loop

1. backbone ensures manager exists
2. manager reads `.kanban/` and current repo state
3. manager sets priorities and keeps tickets moving across the lane flow
4. manager starts worker panes as needed
5. workers perform scoped work and update tickets
6. manager reconciles pane state with ticket state
7. reviewer acceptance moves tickets to `5-done/`
8. manager checkpoints done tickets
9. manager periodically runs `reality-check` to catch drift and production-readiness gaps
10. backbone restarts the system if it is clearly stuck

## Role lifecycle guidance

### Long-lived

- `manager`

### Usually semi-transient

- `implementer`
- `reviewer`
- `refiner`
- `planner`
- `reality-check`

### Usually transient

- `generic_intake`
- `rewriter`
- `discussant`
- `decider`
- `recovery`

### User-owned manual assistant

- `operator` — started manually with `kanban operator`; not a backbone-managed worker

## Roles

Built-in role instructions are loaded from the kanban install, normally `/usr/local/dotfiles/pi/kanban/roles/`.

Project-local `.kanban/roles/` may override a built-in role when a file with the same role name exists there, and may also define additional custom roles.

Fresh agents should read, in order:

1. `.kanban/README.md`
2. the relevant built-in or project-local override role file supplied with the launch
3. the ticket they are acting on
4. the referenced `.plans/*` files

## Template

Start new tickets from `.kanban/templates/ticket.md`.

## Initial seeding policy

The initial kanban was derived from `.plans/`.

That means:

- near-term executable work starts in `2-planned/`
- larger or later work starts in `1-to_refine/`
- completed planning/preflight work is recorded in `5-done/`
- external user-owned prerequisites can live in `0-open/` until supplied
