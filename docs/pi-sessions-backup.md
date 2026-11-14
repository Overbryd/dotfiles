# Pi session backups

`io.pi.agent.sessions-backup` runs at login and hourly. Its helper is
`.bin/backup-pi-sessions`; it backs up only `~/.pi/agent/sessions/`, not auth stores.

The helper copies sessions to two locations, in order:

1. `~/.local/state/pi-session-backup/sessions/` — private local recovery copy.
2. `~/Dropbox/Backups/pi/agent/sessions/` — Dropbox-managed mirror.

It does not delete archived files when a source session disappears. Source modes
are not copied over the private destination modes. These are per-file mirrors,
not immutable point-in-time snapshots or backups of working trees/processes.
Dropbox server upload/version history is separate from successfully copying files
into its local folder.

## Health and manual run

```sh
backup-pi-sessions
launchctl list io.pi.agent.sessions-backup
```

Private health files live under `~/.local/state/pi-session-backup/`:

- `last-local-success`: completed local recovery copy.
- `last-dropbox-copy-success`: completed copy into Dropbox's local folder.
- `last-success`: both copies completed.
- `last-failure`: latest failed run; removed after a successful full run.
- `last-run.log`: bounded to the latest run; failure details stay out of notifications.

A Dropbox failure occurs after the local recovery copy and does not remove it.
Run manually only when the scheduled job is idle. The local copy remains available
without downloading Dropbox's offloaded files, but does not protect against loss
of this Mac.

## Deployment

The helper requires existing Homebrew rsync at
`${HOMEBREW_PREFIX:-/opt/homebrew}/bin/rsync`.

Use Homebrew rsync: Apple's `/usr/bin/rsync` can fail opening the Dropbox
File Provider destination from launchd with `Operation not permitted`.

Deploy only this LaunchAgent, not every dotfile/service:

```sh
cp LaunchAgents/io.pi.agent.sessions-backup.plist ~/Library/LaunchAgents/
launchctl bootout "gui/$(id -u)/io.pi.agent.sessions-backup"
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/io.pi.agent.sessions-backup.plist
```

## Restore safely

Copy a backed-up JSONL file into a private staging directory and verify it before
opening it with `pi --session /absolute/path/to/restored.jsonl`. Do not overwrite
session files that live Pi processes are using. The JSONL includes its session
entry tree; a tmux snapshot separately preserves layout and exact file references.
