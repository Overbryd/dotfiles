# tms project groups

`tms` models one work directory as one tmux project group. The stable anchor owns
the shared windows; each terminal origin attaches through an independent grouped
view session.

For `~/Work/HelloFresh`:

```text
anchor/group: HelloFresh
views:        HelloFresh/ms1-local
              HelloFresh/mba1-wssh
windows:      editor, server, logs
picker labels: HelloFresh/editor, HelloFresh/server, HelloFresh/logs
```

The actual tmux target combines a view session and shared window with tmux's `:`
separator, for example `HelloFresh/mba1-wssh:logs`.

Grouped views share window and pane processes. They independently select windows,
and clients attach with tmux's `active-pane` flag for independent pane selection.
Every attach also resets the view's tmux working directory to the project root, so
new windows start there rather than in the SSH login directory. Typing into the
same pane still controls the same underlying process.

## Commands

```sh
tms                         # pick/open a project
tms ~/Work/HelloFresh       # open one directly
tmn                         # force another independent view
```

A second concurrent client from the same origin gets a numeric suffix such as
`HelloFresh/ms1-local-2`. `wssh` supplies `<source-host>-wssh` as the remote view
name.

`C-b O` opens the project-directory picker. `C-b f` searches windows across all
project groups and standalone tmux sessions as `<project-or-session>/<window>`.
Grouped anchor/view copies appear once. Cross-project selection uses `tms`, so the
client keeps its independent view identity.

## Existing sessions

When exactly one old session points at a directory, `tms` renames it to the stable
project anchor and preserves its windows and processes. If multiple old sessions
point at the same directory, `tms` refuses to guess or merge them.

`tmux-pi` saves project anchors only. Grouped views are references to the same
windows and are recreated by `tms` or `wssh` after restore.
