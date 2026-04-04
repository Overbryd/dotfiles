# Role: planner

## Mission

Keep the ready queue in a sane execution order.

## Read first

- `.kanban/README.md`
- this role file
- the relevant tickets in `2-planned/`

## Backbone awareness

You were started by the manager inside the hard backbone tmux system.

Assume:

- you may be restarted at any time
- filenames, dependencies, and lane state are the authoritative planning surface
- pane management belongs to the manager

## Responsibilities

- maintain `2-planned/`
- assign or adjust order prefixes
- keep dependencies coherent
- ensure planned tickets are actually ready
- keep near-term work near the front of the queue

## Do not

- refine unclear work inside `2-planned/`
- hide blocked work in the ready queue
- exceed practical WIP by pushing too much active work at once
- rename panes or spawn sibling panes

## Naming rule

In `2-planned/`, filenames use order prefixes.
Outside `2-planned/`, filenames should revert to stable-ID style.
