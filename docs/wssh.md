# wssh

Keep a long-lived tmux session on the other work machine.

`wssh` is the ssh counterpart of `wsync`: it uses the same peer configuration
(`~/.config/wsync/config.toml`), so on `mba1` it connects to `ms1` and vice versa.

    # attach to the session for the current directory on the other machine
    wssh

    # attach to the session for another directory
    wssh ~/Work/some-project

    # override the peer
    wssh --host 10.10.10.4

## What it does

- resolves the peer host with `wsync peer`
- takes the current directory (or the given one) and uses the *same absolute path*
  on the remote machine, which is what `wsync` keeps mirrored
- passes a view name such as `mba1-wssh` to `~/.bin/tms <directory>` on the peer
- `tms` keeps a stable project anchor such as `HelloFresh` and attaches wssh to a
  grouped view such as `HelloFresh/mba1-wssh`; grouped views share windows and
  processes but select their current window independently
- concurrent connections from the same origin receive a numbered view, such as
  `HelloFresh/mba1-wssh-2`
- attaches without tmux's `-d` flag and with tmux's `active-pane` client flag, so
  clients neither detach one another nor share pane selection; tmux's
  `window-size latest` default follows the client with the most recent activity
- the remote shell prompt and the remote tmux status bar are teal, so it is always
  visible that the session runs on the other machine

## Connection lifecycle

- `ssh` keepalives (`ServerAliveInterval=10`, `ServerAliveCountMax=3`) detect a dead
  link in roughly 30 seconds instead of hanging forever
- on a drop, `wssh` prints that the connection was lost, that the remote tmux session
  keeps running, and then probes the peer with exponential backoff (1s to 15s) until
  it answers, before re-attaching
- a probe that reaches sshd but cannot authenticate in batch mode counts as reachable
- the local terminal is reset after every attach (stty settings, alternate screen,
  cursor, mouse reporting, bracketed paste), so a drop never leaves a broken terminal
- detaching normally (`C-b d`) or exiting the remote session ends `wssh` with status 0
- `ctrl-c` while reconnecting gives up without touching the remote session
- `--no-retry` exits on the first drop

## Failure modes

- no peer configured: add `[machines.<hostname>]` with `peer`/`ssh_host` to
  `~/.config/wsync/config.toml`, see `wsync doctor`
- remote directory missing: `wssh` reports the failing `tms` exit status and suggests
  `wsync push <directory>`

## Tests

    cd ~/dotfiles/.bin && python3 -m unittest tests.test_wssh
