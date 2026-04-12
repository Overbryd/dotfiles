# Kanban roles

These are built-in role files loaded straight from kanban install.

Project-local `.kanban/roles/` may override built-in role by filename. Project-local dir may also define extra custom roles.

These files say how agents should work with file-based kanban under tmux backbone model.

## Roles

- `generic_intake.md`
- `refiner.md`
- `rewriter.md`
- `planner.md`
- `implementer.md`
- `reviewer.md`
- `manager.md`
- `reality-check.md`
- `operator.md`
- `discussant.md`
- `decider.md`
- `recovery.md`

## Backbone awareness

All roles must assume:

- restart may happen any time
- memory is not authoritative
- `.kanban/`, `.plans/`, git state, and checkpoint tags are authoritative
- pane management belongs to manager unless role file says otherwise

Main exception:

- built-in `operator` role is user-owned and started manually with `kanban operator`, not by manager

## Usage

Fresh agent should:

1. read `.kanban/RUNTIME.md` first (`.kanban/README.md` only for deeper reference)
2. read relevant built-in or project-local override role file supplied with launch
3. read ticket being worked
4. read referenced `.plans/*` files before changing ticket state or code

## Important rule

Role files guide behavior. Role files do not override repo-wide instructions.

If role doc and repo instruction disagree:

- keep repo instruction
- update ticket or note mismatch explicitly
