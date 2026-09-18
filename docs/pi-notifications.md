# Pi user-turn notifications

Pi reports when it has settled and needs another user turn.

- Local, attached macOS session: Notification Center alert plus the existing completion sound.
- SSH session, detached tmux session, or non-macOS host: ntfy push.
- Notification title: host and tmux `session:window.pane` provenance.
- Notification body: up to 240 characters from Pi's final response.

The extension waits for `agent_settled`, not `agent_end`, so retries, compaction, and queued follow-ups do not produce premature alerts.

## Phone setup

Install the free, open-source [ntfy iOS app](https://apps.apple.com/us/app/ntfy/id1625396347), then configure a random topic:

```sh
notify setup
```

The command uses `random-pet` and prints a short pet-style URL such as `https://ntfy.sh/milo-otter-Ab3_X9q2`. `random-pet` draws from 66 names and 67 animals before adding a random eight-character suffix, and can also be used directly. Subscribe to that exact URL in the app, then test it:

```sh
notify "Pi setup test" "Phone setup works"
```

An existing topic or full topic URL can be reused instead:

```sh
notify setup my-existing-topic
notify setup https://ntfy.sh/my-existing-topic
```

Configuration lives at `~/.config/notify/config` with mode `0600`. `NOTIFY_URL` overrides the saved URL, so a self-hosted server can also be selected with `notify setup https://ntfy.example.com/TOPIC`. Set `NOTIFY_TOKEN` when that server requires an access token.

On public ntfy, the random topic URL is effectively a password. Anyone who knows it can read and publish messages. Do not put credentials, private code, or other secrets in notification summaries.

## macOS ntfy support

The ntfy iPhone/iPad app can also run natively on Apple Silicon Macs with macOS 12 or later. Subscribe the Mac app to the same topic if remote pushes should appear there too. Normal local Pi turns use macOS Notification Center directly, avoiding an unnecessary round trip and an iPhone alert.

## Pi controls

```text
/notify status
/notify off
/notify on
/notify toggle
/notify test
```

The on/off choice persists in that Pi session. `/notify test` always tests the phone route.

Routing defaults to `auto`. Override with `PI_NOTIFY_MODE`:

- `auto`: local Mac when attached; push for SSH, detached tmux, and non-Mac hosts.
- `local`: macOS alert and sound only.
- `push`: ntfy only.
- `both`: local macOS alert/sound and ntfy push.

Set a custom sound file with `PI_DONE_SOUND`. Set `PI_NOTIFY_COMMAND` when the extension should invoke a CLI path other than `~/.bin/notify`.

## Agent CLI

```sh
notify "Build finished" "Tests passed; ready for review."
notify "Deployment needs approval" "Release artifacts are ready."
```

The CLI deliberately accepts only a title and message. Both are required; it does not choose routing, provenance, priority, tags, emoji, or fallback text. The Pi extension owns local-versus-push routing and constructs its title and summary before calling the CLI.
