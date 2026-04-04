# Kanban roles

These role files describe how agents should interact with the file-based kanban under the tmux backbone model.

## Roles

- `generic_intake.md`
- `refiner.md`
- `rewriter.md`
- `planner.md`
- `implementer.md`
- `reviewer.md`
- `manager.md`
- `reality-check.md`
- `discussant.md`
- `decider.md`
- `recovery.md`

## Backbone awareness

All roles must assume:

- they may be restarted at any time
- their memory is not authoritative
- `.kanban/`, `.plans/`, git state, and checkpoint tags are authoritative
- pane management belongs to the manager unless the role explicitly says otherwise

## Usage

A fresh agent should:

1. read `.kanban/README.md`
2. read the relevant role file
3. read the ticket being worked on
4. read any referenced `.plans/*` files before changing ticket state or code

## Important rule

Role files guide behavior, but they do not override repo-wide instructions.

If a role doc and a repo instruction ever disagree:

- preserve the repo instruction
- update the ticket or note the mismatch explicitly
