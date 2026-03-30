# WireGuard home/away automation

This documents the WireGuard automation implemented for:

- **`ms1`**: the always-on home Mac Studio
- **mobile Macs** such as **`mba1`**

The implementation is intentionally safe for a public dotfiles repository:

- no Home Assistant secrets are stored in Git
- runtime configuration lives outside the repo
- the Home Assistant token is read from the macOS Keychain by default

## Architecture

The setup is intentionally split by device type.

### `ms1`

`ms1` uses a local polling agent managed by launchd:

- script: `.bin/ms1-away-vpn-agent`
- tunnel wrapper: `.bin/wg-tunnel`
- LaunchAgent: `LaunchAgents/com.overbryd.ms1-away-vpn.plist`

The agent checks:

- Home Assistant away/home state
- local screen lock state
- local idle time
- current WireGuard tunnel state

It then decides whether to:

- start the `ms1` tunnel
- stop it again optionally
- or do nothing

### Mobile Macs

Mobile Macs should use the official WireGuard app's native **On-Demand** feature instead of the custom script.

Recommended setup:

- enable **Activate On Demand**
- scope it to **Wi‑Fi and Ethernet**
- add home Wi‑Fi SSID(s) to **Except these SSIDs**

This keeps laptops simple and reliable while roaming.

## Files

- `.bin/wg-tunnel`
  - wraps `scutil --nc`
  - supports `list`, `show`, `status`, `is-connected`, `start`, `stop`
- `.bin/ms1-away-vpn-agent`
  - intended to run on `ms1`
  - consumes external config from `~/.wg-auto/ms1.env`
  - reads the Home Assistant token from Keychain by default
- `LaunchAgents/com.overbryd.ms1-away-vpn.plist`
  - runs the agent every 60 seconds in the user session
- `examples/wg-auto/ms1.env.example`
  - example config to copy outside the repo

## Public repo safety

The repo intentionally does **not** contain:

- a real Home Assistant URL for your environment
- a Home Assistant token
- committed machine-local secret files

Use one of these secret sources instead:

1. **Preferred:** macOS Keychain
2. optional: `HA_TOKEN_FILE` outside the repo
3. least preferred: `HA_TOKEN` from a local shell environment

## Behavior summary

By default, the `ms1` agent will only act on the machine whose short hostname matches:

```bash
WG_AUTO_EXPECT_HOSTNAME=ms1
```

That means the LaunchAgent can safely be installed broadly by your dotfiles, while the script exits immediately on other Macs.

Default behavior:

- if HA says you are **away**
- and `ms1` is **locked** or **idle long enough**
- and the tunnel is not already connected
- then the agent starts the tunnel

Default non-behavior:

- disconnect-on-return is disabled unless explicitly enabled in config

## Related docs

- [Setup](./setup.md)
- [Home Assistant notes](./home-assistant.md)
