# File-based Kanban for `pi`

This folder is execution layer for repo. `kanban setup` usually creates or refreshes it.

Use `.kanban/RUNTIME.md` for short startup contract.
Use this `README.md` for deeper reference.

## Purpose

Use `.kanban/` for tickets moving through clear lanes.

Use `.plans/` as long-form reference layer for:

- architecture
- product intent
- data model
- AI runtime direction
- ingestion design
- visual direction
- delivery sequencing

Do **not** paste `.plans/` docs into tickets.

Instead:

- `.plans/` stays canonical for reference and rationale
- `.kanban/` holds executable tickets derived from those plans
- tickets should link back to relevant `.plans/*` files

## Hard backbone vs soft roles

This kanban works with tmux-based supervisor.

### Hard backbone

Hard backbone is deterministic shell script started from tmux pane:

- `kanban backbone`

Backbone does this:

- keep project tmux window alive
- ensure manager pane exists
- healthcheck manager on cadence
- nudge manager when manager looks idle
- hard-reset role panes when system is clearly stuck
- run one-off recovery before orchestration restart

Backbone stays dumb. Backbone must not interpret tickets or make product calls.

### Soft roles

Soft roles are `pi` agents, usually started in tmux panes by manager.

Exception:

- user-owned `operator` session starts manually with `kanban operator`

Soft roles do this:

- read `.kanban/`
- read relevant `.plans/*`
- do research, planning, implementation, review, or recovery
- update tickets and repo state

Soft roles may restart any time.

## Source of truth

Source of truth, in order:

1. `.kanban/`
2. git state
3. checkpoint tags
4. recovery notes in `.kanban/runtime/`

Terminal output is **not** source of truth. Only liveness and debug signal.

After restart, role must rebuild context from files and git state, not memory.

## tmux model

Start system **inside existing tmux window**:

```bash
kanban backbone
```

Backbone will:

- treat current pane as backbone pane
- rename current window to project folder name
- title backbone pane as `<project_name>:backbone`
- enforce at most one backbone pane in project window
- enable pane border titles for window
- lock project window against app-driven tmux title changes so managed pane titles stay stable
- start manager in separate pane

### Pane naming

Role panes use this title shape:

```text
<project_name>:<role>
```

Examples:

```text
my_project:backbone
my_project:manager
```

Kanban uses these titles for role discovery and recovery. Interactive `pi` tries to set terminal title itself, so kanban scripts disable tmux `allow-set-title` for managed project window and role panes. `pi` must not overwrite managed pane titles.

### Uniqueness rule

At most one active pane per role in project window.

Manager should enforce this with helper scripts.

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

Operator chat sessions started with `kanban operator` live under:

```text
.kanban/runtime/state/operator-sessions/
```

## Operator coordination files

If system needs something from operator, system may use:

- `.kanban/operator-blocker.md` — single current operator-facing blocker summary
- `.kanban/operator-todo.md` — clean actionable checklist for operator answers, review, or sign-off

`kanban setup` seeds both files. Keep both short, current, authoritative.

## Lane model

### `0-open/`

Raw intake.

Use for:

- new prompts
- new ideas
- bugs
- questions
- rough feature requests
- user-owned prerequisites not yet folded into active work
- review notes or draft tickets still being written

Files here may be incomplete.

Priority behavior in `0-open/`:

- ticket with no `priority` is ignored by manager
- `priority: ignore` also keeps ticket out of active processing
- `priority: immediate` makes `0-open/` ticket actionable now and gives highest pickup priority

### `1-to_refine/`

Research and shaping lane.

Use for tickets needing:

- codebase research
- scope clarification
- splitting
- acceptance criteria
- dependency mapping
- design or architecture discussion

### `2-planned/`

Ready and ordered work.

Put ticket here only when refined enough to implement.

Files in this lane must use order prefixes, for example:

- `01-some-ticket.md`
- `01a-follow-on-ticket.md`
- `02-next-ticket.md`

### `3-in_progress/`

Claimed work.

Keep WIP very low. Usually one ticket. Sometimes few.

### `4-in_review/`

Waiting for verification.

Only tickets under active review belong here.

### `5-done/`

Completed and verified work.

Ticket belongs here only after acceptance criteria were checked.

## Stable identity

Each ticket has stable internal YAML ID, for example:

- `KB-0001`
- `KB-0002`

Stable ID is real identity.

Filename order is only queue mechanism for `2-planned/`.

## Ticket file format

Use Markdown with minimal YAML frontmatter.

Required frontmatter keys:

- `id`
- `type`
- `depends_on`
- `minimum_thinking`
- `operator_review_required`
- `operator_review_status`
- `plan_version`
- `approved_plan_version`

Optional frontmatter key:

- `priority` — `ignore` or `immediate`

Everything else belongs in Markdown body.

Recommended meaning:

- `operator_review_required: true` once refiner produced ready implementation plan
- `operator_review_status: pending` while waiting for user/operator plan approval
- `plan_version` increments when implementation plan changes materially
- `approved_plan_version` must match `plan_version` before unattended implementation starts

Example:

```md
---
id: KB-0007
type: feature
depends_on:
  - KB-0006
minimum_thinking: low
operator_review_required: true
operator_review_status: pending
plan_version: 2
approved_plan_version:
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

When moving planned ticket out of `2-planned/`, switch back to stable-ID filename.

## Dependencies and blockers

Track dependencies in `depends_on`.

Use:

- ticket IDs like `KB-0007`
- explicit external prerequisites when needed, like `user:s3_credentials`

If ticket is blocked, say so in body too.

## Movement rules

- move tickets between lanes
- update ticket body when lane changes
- if implementation starts, ticket must move to `3-in_progress/`
- if review fails, move ticket back to `3-in_progress/` or `2-planned/`
- worker claim like "moved to review" counts only after ticket file actually lands in `4-in_review/`
- if `4-in_review/` has work and no reviewer runs, manager should start or restart `reviewer` before unrelated new work
- keep `3-in_progress/` and `4-in_review/` small and current
- manager owns steady forward motion across `0-open/ -> 1-to_refine/ -> 2-planned/ -> 3-in_progress/ -> 4-in_review/ -> 5-done/`
- `1-to_refine/` is not parking lot; when no higher-priority implementation or review should go first, manager should launch real refinement pass
- every ticket entering `2-planned/` should carry concise implementation plan and explicit operator-review state
- manager must not hand ticket from `2-planned/` to `implementer` until operator review is approved for current `plan_version`

## Operator review gate

Ticket is blocked for unattended implementation when all are true:

- `operator_review_required: true`
- `operator_review_status` is not `approved`
- or `approved_plan_version` does not equal `plan_version`

Normal refinement handoff into `2-planned/`:

- set `operator_review_required: true`
- set `operator_review_status: pending`
- increment `plan_version`
- clear or update `approved_plan_version`
- update `.kanban/operator-blocker.md`
- update `.kanban/operator-todo.md`

Backbone and manager should treat ticket-file approval change as wake signal. Do not infer approval from pane output.

## Priority rules

Priority is override on top of lane system. Tickets still move through same lanes.

Priority order:

1. `priority: immediate` tickets — highest user-requestable priority
2. `reality-check` findings ticket and derived cleanup stream
3. other normal tickets
4. `priority: ignore` tickets and `0-open/` tickets with no `priority` — not actionable

Execution rules:

- if any immediate ticket exists, manager should finish current active pass safely, then keep system focused on immediate tickets until none remain
- work immediate tickets in series, not speculative swarm
- immediate tickets outrank normal work and reality-check work
- reality-check findings and cleanup follow-ons outrank other normal work, but not immediate tickets
- due `reality-check` is periodic and non-preemptive; never stop still-useful running pane mid-pass for cadence alone
- ticket with `priority: ignore` stays ignored until priority changes
- ticket in `0-open/` with no `priority` stays ignored
- outside `0-open/`, ticket with no `priority` is normal work

Inside given priority class, manager should still keep lane discipline:

1. finish or reconcile active work already in `4-in_review/` and `3-in_progress/`
2. keep `2-planned/` ordered so next ready ticket is obvious
3. when no clearer higher-priority implementation or review task exists, move best ticket in `1-to_refine/` forward by starting `refiner`
4. when next best actionable work lives in `0-open/`, pull it forward into refinement first

Reality-check child ticket should keep explicit link back to active findings ticket, preferably through `depends_on` or direct ticket refs in body.

## Helper commands

Manager and backbone should prefer `kanban` helper commands over ad hoc tmux work.

Important commands:

- `kanban list-roles` — list active role panes in project window
- `kanban capture-role <role>` — inspect latest output from role pane
- `kanban start-role <role> [ticket]` — launch role pane for specific task
- `kanban stop-role <role>` — stop stale or completed role pane
- `kanban send-role <role> <message>` — send focused nudge to existing role pane
- `kanban operator` — start fresh user-owned operator chat session for project
- `kanban checkpoint-ticket <ticket>` — create done-state checkpoint after review acceptance
- `kanban healthcheck-manager` — deterministic health signal used by backbone
- `kanban recover` / `kanban hard-reset` — recovery tools for bad states

## Pi model and thinking policy

Role launches under `kanban start-role` use these defaults:

- primary provider: `openai-codex`
- fallback provider: `openai`
- default model: `gpt-5.4`

Thinking policy:

- default to low-cost execution; raise depth only when ticket truly needs it
- `manager`, `planner`, `implementer`, and `generic_intake` default to `off`
- `discussant`, `rewriter`, and `decider` default to `minimal`
- `refiner`, `reviewer`, and `reality-check` default to `high`
- `recovery` defaults to `medium`
- non-review/refine/reality-check roles are capped at `high`
- ticket may raise floor through `minimum_thinking`

Fallback policy:

- use `gpt-5.4 [openai-codex]` by default
- switch role to `gpt-5.4 [openai]` only when Codex is actually rate-limited
- when deliberate fallback is needed, restart role with `kanban start-role ... --provider openai`

### Main commands

- `kanban setup` — create or refresh project-local `.kanban/` skeleton
- `kanban backbone` — start hard supervisor loop in current tmux window
- `kanban operator [--pane|--window]` — start fresh user-owned operator session for project
- `kanban start-role <role> [ticket] [--provider <name>] [--thinking <level>]` — start role pane if role does not already exist
- `kanban stop-role <role>` — stop role pane
- `kanban list-roles` — list active role panes in project window
- `kanban capture-role <role>` — capture pane output for role
- `kanban send-role <role> <message>` — send prompt or command into role pane
- `kanban healthcheck-manager` — classify manager health from deterministic tmux history and pane signals
- `kanban hard-reset` — kill all role panes in project window
- `kanban recover` — run one-off recovery in print mode
- `kanban checkpoint-ticket <ticket>` — create checkpoint commit/tag after ticket is done

### Useful environment knobs

- `PI_KANBAN_PRIMARY_PROVIDER` — default provider for new role launches
- `PI_KANBAN_FALLBACK_PROVIDER` — provider used only on deliberate rate-limit fallback restarts
- `PI_KANBAN_DEFAULT_MODEL` — default model for new role launches
- `PI_KANBAN_REALITY_CHECK_TICKET_INTERVAL` — completed non-`reality-check` ticket threshold for requiring `reality-check`, default `3`
- `PI_BACKBONE_SLEEP_SECONDS` — supervisor sleep between healthchecks, default `10`
- `PI_BACKBONE_STALE_NUDGE_COOLDOWN_SECONDS` — minimum seconds between stale-pane early nudges, default `300`
- `PI_BACKBONE_NUDGE_COOLDOWN_SECONDS` — fallback periodic nudge interval when manager stays idle, default `3600`
- `PI_BACKBONE_STALE_PANE_LINES` — pane lines sampled for stale-pane detection, default `100`
- `PI_BACKBONE_STALE_PANE_CONSECUTIVE_CHECKS` — unchanged consecutive checks needed before managed pane counts as stale, default `6`
- `PI_BACKBONE_MANAGER_COMPACT_IDLE_COUNT` — minimum consecutive idle healthchecks before backbone may send `/compact`, default `8`
- `PI_BACKBONE_MANAGER_COMPACT_COOLDOWN_SECONDS` — minimum seconds between backbone-issued manager `/compact`, default `1800`
- `PI_KANBAN_SEND_ROLE_TIMEOUT_SECONDS` — timeout for backbone manager nudges sent through `kanban send-role`, default `10`
- `PI_BACKBONE_MAX_RUNTIME_SECONDS` — maximum supervisor runtime before clean exit
- `PI_BACKBONE_HEALTH_LINES` — manager pane lines captured for healthchecks
- `PI_BACKBONE_STUCK_SUSPICION_SECONDS` — sustained suspicion window before hard reset
- `PI_BACKBONE_RECOVERY_TIMEOUT_SECONDS` — timeout for one-off recovery
- `PI_BACKBONE_RECOVERY_PROVIDER` / `PI_BACKBONE_RECOVERY_MODEL` — optional provider/model override for recovery

## Checkpoints

Done-state recovery uses **commits plus tags**.

### Rule

After ticket is accepted and moved to `5-done/`, manager should run:

```bash
kanban checkpoint-ticket <path-to-done-ticket>
```

### What this does

Checkpoint script will:

- create git commit if worktree is dirty
- create historical done tag for ticket
- update moving tag `kanban/last-known-good`

### Why

This gives recovery clear, boring, inspectable rollback point.

## Reality-check cadence

Broader `reality-check` role catches drift, half-finished work, excessive mocks or stubs, and other signs system is getting less real than it should be.

Manager should ensure `reality-check` runs after 3 checkpointed non-`reality-check` tickets by default.

Due `reality-check` is periodic and non-preemptive. If useful implementation, review, or refinement work already runs, manager should not stop that pane just for cadence. Defer launch until later backbone nudge after active pane reaches clear stop.

Each `reality-check` run should rebuild fresh context, start fresh session without resuming old role-chat history, and update at most one findings ticket.

If `reality-check` creates or updates findings ticket, manager should treat that findings ticket and linked cleanup follow-ons as highest-priority refinement/planning/implementation stream ahead of unrelated normal work until cleanup run is shaped and advanced.

`priority: immediate` still outranks findings ticket and cleanup follow-ons.

## Recovery

Hard reset means:

1. kill all role panes in project window
2. run one-off recovery in non-interactive `pi` print mode
3. restart manager from scratch

Recovery should prefer last known good checkpoint tag over guesswork.

## Healthchecks

Backbone healthchecks manager on cadence.

### Outcomes

- `working` — manager output changes or clearly progresses
- `idle` — manager looks alive but inactive enough to need nudge
- `suspect` — manager tail shows repeated error-like signals, but not long enough yet for hard reset
- `stuck` — manager looks blocked by sustained error-like failure and should be hard-reset
- `missing` — manager pane is gone
- `restart` — manager session looks corrupted enough that hard reset is safer

Healthcheck is deterministic. It uses tmux history movement, manager pane identity, and pane stability signals. Error-like output escalates to `stuck` only after sustained suspicion window, default 15 minutes.

### Nudge behavior

If manager looks idle, backbone may send:

- earlier periodic healthcheck prompt when all backbone-managed panes look stale by repeated unchanged pane-output fingerprints
- fallback periodic healthcheck prompt only after manager has gone un-nudged for normal cooldown
- less-frequent `/compact`, followed by periodic healthcheck prompt only after extended repeated idleness and separate compact cooldown
- periodic healthcheck prompt that explicitly calls out when `reality-check` is due by completed non-`reality-check` ticket count

When no processable ticket remains in `0-open/`, `1-to_refine/`, `2-planned/`, `3-in_progress/`, or `4-in_review/`, and no managed worker pane remains active, backbone switches to special file-watch idle mode instead of repeatedly nudging manager. In that mode backbone watches for changes that create actionable work, including priority changes that make previously ignored ticket actionable or operator approval changes that unblock planned ticket. Tickets waiting only for approval do not wake manager by themselves.

Periodic healthcheck prompt should trigger one bounded reconciliation pass, not open-ended self-driven loop. That pass may still launch next clear worker immediately when previous step just finished and queue state makes follow-on action obvious.

To reduce interference, backbone samples managed pane output often and suppresses repeated defer logs. If any managed pane still changes, backbone defers early nudge. If all managed panes stay unchanged for configured stale-window checks, backbone nudges manager early once, then waits for fresh pane activity before repeating early nudge.

If `reality-check` becomes due while still-useful worker pane already runs, manager should defer launching `reality-check` until later backbone nudge instead of stopping active pane just to satisfy cadence.

Manager must know how to answer these nudges.

## Agent loop

1. backbone ensures manager exists
2. manager reads `.kanban/` and current repo state
3. manager sets priorities and keeps tickets moving across lane flow
4. manager starts worker panes as needed
5. workers do scoped work and update tickets
6. manager reconciles pane state with ticket state
7. reviewer acceptance moves tickets to `5-done/`
8. manager checkpoints done tickets
9. manager periodically runs `reality-check` to catch drift and production-readiness gaps
10. backbone restarts system if system is clearly stuck

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

- `operator` — started manually with `kanban operator`; not backbone-managed worker

## Roles

Built-in role instructions load from kanban install, usually `/usr/local/dotfiles/pi/kanban/roles/`.

Project-local `.kanban/roles/` may override built-in role when file with same role name exists there. Project-local dir may also define extra custom roles.

Fresh agents should read, in order:

1. `.kanban/RUNTIME.md` (or `.kanban/README.md` in older setups without runtime file)
2. relevant built-in or project-local override role file supplied with launch
3. ticket being acted on
4. referenced `.plans/*` files
5. `.kanban/README.md` only when deeper background or reference detail is needed

## Template

Start new tickets from `.kanban/templates/ticket.md`.

## Initial seeding policy

Initial kanban was derived from `.plans/`.

That means:

- near-term executable work starts in `2-planned/`
- larger or later work starts in `1-to_refine/`
- completed planning/preflight work is recorded in `5-done/`
- external user-owned prerequisites can live in `0-open/` until supplied
