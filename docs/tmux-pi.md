# Save and restore tmux with Pi

```sh
tmux-pi status
tmux-pi save
tmux-pi restore --dry-run
```

For **one tmux session** (all its named windows and panes), store a separate snapshot in a work folder:

```sh
tmux-pi status --session HelloFresh
tmux-pi save --session HelloFresh --work-folder ~/Work/HelloFresh
tmux-pi restore --dry-run --work-folder ~/Work/HelloFresh
tmux-pi restore --work-folder ~/Work/HelloFresh
```

This writes `~/Work/HelloFresh/.pi/tmux-pi/snapshot.json`; it does **not** overwrite the global all-sessions snapshot. Restore creates the stable `HelloFresh` project anchor but refuses if it already exists. Grouped `tms` view sessions such as `HelloFresh/ms1-local` are not duplicated in snapshots; they are recreated on demand by `tms` or `wssh`. Passing a view to `--session` resolves to its project anchor. To choose another private location, use `--file /absolute/path/snapshot.json` on `save` and `restore` instead of `--work-folder`. A scoped `save --session` always requires one of these destinations. Names match exactly, never by prefix. The snapshot directory must be private (700); an already-accessible directory/file is rejected rather than silently chmodded. Do not put snapshots in Git or a synced folder.

The snapshot is `~/.local/state/tmux-pi/snapshot.json` (directory 700, file 600). It records tmux session/window names, indexes, pane layout, pane directories, and **exact** Pi JSONL paths and IDs. It is not an export or backup of the transcripts themselves: keep `~/.pi/agent/sessions/` too. Never commit or share the snapshot; paths and transcripts can be sensitive.

To shut down safely, finish or abort active Pi/tool runs, then save again. Only after `save` reports **zero unresolved** should you stop the tmux server. Stopping the server terminates *all* processes running inside it, not just Pi, and does not preserve editor input, scrollback, background jobs or non-Pi processes. Restart:

```sh
tmux-pi restore --dry-run
tmux-pi restore
tms ~/Work/HelloFresh
```

Restore refuses to overwrite existing tmux session names. It starts Pi using the saved session file, not `--continue`; non-Pi panes become shells. For directories under `~/Work`, it loads the directory's direnv environment before Pi. Run `tmux-pi save` again after a Pi `/new`, `/resume` or fork, or changing the tmux layout. A loaded Pi extension updates the active Pi file mapping after those commands; on pre-extension processes, `/reload` attaches it. `status` refuses to guess: if a pane is unresolved, use `/session` inside that Pi and `tmux-pi bind %PANE /absolute/path/to/session.jsonl`, then re-run `save`. Never bind by modification time alone.

A non-destructive layout verification uses a **separate tmux socket**, never the real server:

```sh
TMUX_PI_SOCKET=tmux-pi-proof tmux-pi restore --layout-only
tmux -L tmux-pi-proof list-sessions
tmux -L tmux-pi-proof kill-server
```

Layout-only restore launches no Pi or background commands. The full process restore has **not** been tested by stopping the live tmux server. Before any real shutdown, double-check the saved map with `tmux-pi status` and `restore --dry-run`. If a Pi session was opened across working directories with a mismatched JSONL header, restore honors the header's Pi cwd; other panes keep their tmux cwd.
