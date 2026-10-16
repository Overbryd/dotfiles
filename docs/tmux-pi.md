# Save and restore tmux with Pi

## Find and resume Pi sessions

Pi sessions have **display names**; `/tree` entries separately have **labels**. For a findable session such as `TODAY`, use a session name:

```sh
/name TODAY          # inside Pi
pi --continue        # newest session for the current directory
pi --resume          # searchable session picker
pi --session ID      # exact or partial ID; a JSONL path also works
```

Inside the `/resume` picker, `Ctrl+N` shows named sessions only and `Ctrl+R` renames the selected session. This dotfiles setup also provides `/pi find the TODAY session`, which searches names and conversation text and switches sessions; `/pi undo` switches back. Tree labels are created with `Shift+L` in `/tree` and are useful for finding a point *within* one session, not for finding the session in `/resume`.

## Keep Pi and tmux names aligned

When a tmux window contains exactly one live Pi pane, names synchronize both ways:

- `/name SES-177` renames the tmux window.
- `C-b ,`, or `C-b :` followed by `rename-window SES-177`, renames the Pi session.

`C-b ,` opens tmux's rename prompt prefilled with the current window name. Automatic command-derived names such as `node` are ignored. A window containing multiple Pi panes is deliberately not synchronized because no single Pi session owns its name. Synchronization starts after the Pi extension is loaded; run `/reload` in already-running Pi processes after changing the extension.

## Snapshot and restore tmux windows

```sh
tmux-pi status
tmux-pi save
tmux-pi restore --dry-run
tmux-pi restore
```

For **one tmux session** (all its named windows and panes), store a separate snapshot in a work folder:

```sh
tmux-pi status --session HelloFresh
tmux-pi save --session HelloFresh --work-folder ~/Work/HelloFresh
tmux-pi restore --dry-run --work-folder ~/Work/HelloFresh
tmux-pi restore --work-folder ~/Work/HelloFresh
```

This writes `~/Work/HelloFresh/.pi/tmux-pi/snapshot.json`; it does **not** overwrite the global all-sessions snapshot. When run **inside tmux**, restore adds the saved windows to the current session (or its `tms` project anchor) and leaves the current window intact. Saved indexes shift together when they conflict. It refuses duplicate window names, so rerunning restore does not create another copy. The work-folder snapshot must contain exactly one saved session for this mode.

When run outside tmux, restore creates the stable saved session and refuses if it already exists. Use `--new-sessions` to force that old behavior from inside tmux. Grouped `tms` view sessions such as `HelloFresh/ms1-local` are not duplicated in snapshots; they are recreated on demand by `tms` or `wssh`. Passing a view to `--session` resolves to its project anchor. To choose another private location, use `--file /absolute/path/snapshot.json` on `save` and `restore` instead of `--work-folder`. A scoped `save --session` always requires one of these destinations. Names match exactly, never by prefix. The snapshot directory must be private (700); an already-accessible directory/file is rejected rather than silently chmodded. Do not put snapshots in Git or a synced folder.

The snapshot is `~/.local/state/tmux-pi/snapshot.json` (directory 700, file 600). It records tmux session/window names, indexes, pane layout, pane directories, and **exact** Pi JSONL paths and IDs. It is not an export or backup of the transcripts themselves: keep `~/.pi/agent/sessions/` too. Never commit or share the snapshot; paths and transcripts can be sensitive.

To shut down safely, finish or abort active Pi/tool runs, then save again. Only after `save` reports **zero unresolved** should you stop the tmux server. Stopping the server terminates *all* processes running inside it, not just Pi, and does not preserve editor input, scrollback, background jobs or non-Pi processes. Restart:

```sh
tmux-pi restore --dry-run
tmux-pi restore
tms ~/Work/HelloFresh
```

Restore starts Pi using the exact saved session file, not `--continue`, and sets each Pi session display name from its saved tmux window name. Thus the Pi in the `TODAY` window becomes searchable as `TODAY` in `/resume`; multiple Pi panes in one window receive the same display name. This naming happens on restore, not save. Non-Pi panes become shells. For directories under `~/Work`, restore loads the directory's direnv environment before Pi. Run `tmux-pi save` again after a Pi `/new`, `/resume` or fork, or changing the tmux layout. A loaded Pi extension updates the active Pi file mapping after those commands; on pre-extension processes, `/reload` attaches it. `status` refuses to guess: if a pane is unresolved, use `/session` inside that Pi and `tmux-pi bind %PANE /absolute/path/to/session.jsonl`, then re-run `save`. Never bind by modification time alone.

A non-destructive layout verification uses a **separate tmux socket**, never the real server:

```sh
TMUX_PI_SOCKET=tmux-pi-proof tmux-pi restore --layout-only
tmux -L tmux-pi-proof list-sessions
tmux -L tmux-pi-proof kill-server
```

Layout-only restore launches no Pi or background commands. The full process restore has **not** been tested by stopping the live tmux server. Before any real shutdown, double-check the saved map with `tmux-pi status` and `restore --dry-run`. If a Pi session was opened across working directories with a mismatched JSONL header, restore honors the header's Pi cwd; other panes keep their tmux cwd.
