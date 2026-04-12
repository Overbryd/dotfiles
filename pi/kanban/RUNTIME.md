# Kanban Runtime Contract

Short runtime contract for backbone-managed kanban work.

## Source of truth

Trust these, in order:

1. `.kanban/`
2. git state
3. checkpoint tags
4. `.kanban/runtime/recovery/`

Do **not** treat pane chatter as authoritative.
Capture worker pane only when file state is missing, contradictory, or clearly stale.

## Lane flow

Work moves through:

`0-open -> 1-to_refine -> 2-planned -> 3-in_progress -> 4-in_review -> 5-done`

Rules:

- `0-open` with no `priority` is ignored
- `priority: immediate` outranks all other work
- keep `3-in_progress` and `4-in_review` small
- move tickets between lanes

## Ticket contract

Required frontmatter:

- `id`
- `type`
- `depends_on`
- `minimum_thinking`
- `operator_review_required`
- `operator_review_status`
- `plan_version`
- `approved_plan_version`

Planned tickets should keep these sections concise and current:

- scope
- out of scope
- implementation plan
- verification
- risks / rollback
- handoff

## Operator approval gate

Ticket is **not ready for implementation** when:

- `operator_review_required: true`
- and `operator_review_status` is not `approved`
- or `approved_plan_version` does not equal `plan_version`

When refinement moves work into `2-planned`, default handoff is:

- `operator_review_required: true`
- `operator_review_status: pending`
- increment `plan_version`
- update `.kanban/operator-blocker.md`
- update `.kanban/operator-todo.md`

Manager must wait for ticket-file approval changes instead of guessing from chat output.
If queue contains only approval-pending tickets and no active worker, backbone should stay in file-watch idle mode and stop repeated nudges.

## Role behavior

All roles:

- rebuild context from files and git state after restart
- keep scope tight
- update ticket before idling
- leave next action obvious in ticket handoff section

Manager:

- acts only in bounded reconciliation passes
- trusts ticket state first
- treats lane changes as real only when ticket file actually moved
- stops orphaned worker panes whose lane no longer exists
- starts `reviewer` when work sits in `4-in_review/` and no reviewer runs
- launches at most one clear follow-on task per nudge
- waits for next nudge after pass

Workers:

- hand off through ticket updates, not pane narration
- stop after reaching clear file-documented stop

## Thinking policy

Default to low-cost execution.
Raise depth only when ticket truly needs it.
`minimum_thinking` is explicit floor.

Default role thinking:

- `manager`, `planner`, `implementer`, `generic_intake` -> `off`
- `discussant`, `rewriter`, `decider` -> `minimal`
- `refiner`, `reviewer`, `reality-check` -> `high`
- `recovery` -> `medium`

## Backbone model

Backbone is deterministic and dumb.
Backbone may:

- start or restart manager
- nudge manager on meaningful file or worker-state changes
- stop obviously orphaned `implementer` or `reviewer` panes when lane no longer contains work
- run periodic healthchecks
- stay idle when nothing is actionable except approval-pending tickets
- hard reset system when system is clearly stuck

Manager should not continuously follow subordinate output.
Manager should wait for nudges and reconcile from files.
