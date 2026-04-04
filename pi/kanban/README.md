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

The soft roles are `pi` agents started in tmux panes by the manager.

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

These files may be incomplete.

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

## Helper commands

The manager and backbone should prefer the `kanban` helper commands over ad hoc tmux manipulation.

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
- `PI_BACKBONE_SLEEP_SECONDS` — supervisor sleep between healthchecks
- `PI_BACKBONE_NUDGE_COOLDOWN_SECONDS` — minimum seconds between manager nudges
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

Each `reality-check` run should rebuild fresh context and update at most one findings ticket.

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

- an earlier periodic healthcheck prompt when no managed worker pane remains active and the manager itself has gone idle
- a periodic healthcheck prompt on the normal cooldown
- `/compact`, followed by a periodic healthcheck prompt on repeated idleness
- a periodic healthcheck prompt that explicitly calls out when `reality-check` is due by elapsed time or by completed-ticket count

When `2-planned/`, `3-in_progress/`, and `4-in_review/` are empty and no managed worker pane remains active, the backbone switches to a special file-watch idle mode instead of repeatedly nudging the manager. In that mode it waits for lane-file changes under `0-open/`, `1-to_refine/`, `2-planned/`, `3-in_progress/`, or `4-in_review/` before waking the manager again.

A periodic healthcheck prompt is meant to trigger one bounded reconciliation pass, not an open-ended self-driven loop. That pass may still launch the next clear worker immediately when the previous step just finished and queue state now makes the follow-on action obvious.

The manager must know how to respond to these nudges.

## Agent loop

1. backbone ensures manager exists
2. manager reads `.kanban/` and current repo state
3. manager starts worker panes as needed
4. workers perform scoped work and update tickets
5. manager reconciles pane state with ticket state
6. reviewer acceptance moves tickets to `5-done/`
7. manager checkpoints done tickets
8. manager periodically runs `reality-check` to catch drift and production-readiness gaps
9. backbone restarts the system if it is clearly stuck

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

## Roles

Role instructions live in `.kanban/roles/`.

Fresh agents should read, in order:

1. `.kanban/README.md`
2. the relevant role file in `.kanban/roles/`
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
