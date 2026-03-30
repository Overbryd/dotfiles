# Setup

## 1. Copy external config on `ms1`

Copy the example config out of the repository:

```bash
mkdir -p ~/.wg-auto
cp ~/dotfiles/examples/wg-auto/ms1.env.example ~/.wg-auto/ms1.env
```

Then edit:

```bash
${EDITOR:-vi} ~/.wg-auto/ms1.env
```

At minimum, set:

- `WG_AUTO_EXPECT_HOSTNAME=ms1`
- `WG_AUTO_TUNNEL=ms1`
- `HA_URL=...`
- `HA_ENTITY_ID=...`

## 2. Store the Home Assistant token in Keychain

Preferred setup:

```bash
security add-generic-password -U \
  -a "$USER" \
  -s wg-auto-home-assistant \
  -w '<LONG_LIVED_ACCESS_TOKEN>'
```

The script looks this up by default using:

- service: `wg-auto-home-assistant`
- account: `$USER`

If needed, override these in `~/.wg-auto/ms1.env`:

```bash
HA_TOKEN_KEYCHAIN_SERVICE=wg-auto-home-assistant
HA_TOKEN_KEYCHAIN_ACCOUNT=$USER
```

## 3. Install the LaunchAgent

Your existing dotfiles flow should install LaunchAgents with:

```bash
cd ~/dotfiles
make defaults-LaunchAgents
```

Or manually:

```bash
cp ~/dotfiles/LaunchAgents/com.overbryd.ms1-away-vpn.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.overbryd.ms1-away-vpn.plist 2>/dev/null || true
launchctl load -w ~/Library/LaunchAgents/com.overbryd.ms1-away-vpn.plist
```

## 4. Dry-run test

Before letting it control the real `ms1` tunnel, test the decision logic:

```bash
WG_AUTO_HA_STATE_OVERRIDE=on \
WG_AUTO_IDLE_SECONDS_OVERRIDE=900 \
~/dotfiles/.bin/ms1-away-vpn-agent --dry-run
```

Example expected output:

```text
2026-03-31T00:53:18+0200 dry_run=1 tunnel=ms1 action=start idle_seconds=900 locked=false ha_state=on reason=away-and-idle-threshold-met
```

## 5. Real tunnel wrapper checks

Useful manual checks:

```bash
~/dotfiles/.bin/wg-tunnel list
~/dotfiles/.bin/wg-tunnel show ms1
~/dotfiles/.bin/wg-tunnel status ms1
```

Manual control if needed:

```bash
~/dotfiles/.bin/wg-tunnel start ms1
~/dotfiles/.bin/wg-tunnel stop ms1
```

## 6. Logs

The LaunchAgent logs to:

```bash
/tmp/com.overbryd.ms1-away-vpn.log
```

Follow it with:

```bash
tail -f /tmp/com.overbryd.ms1-away-vpn.log
```

The agent also suppresses repeated identical no-op logs by remembering the last emitted state.

## 7. Laptop setup

For laptops like `mba1`, prefer native WireGuard On-Demand instead of this agent.

In the official WireGuard macOS app:

1. open the laptop tunnel, e.g. `mba1`
2. enable **Activate On Demand**
3. choose **Wi‑Fi and Ethernet**
4. add your home SSID(s) to **Except these SSIDs**

That way the laptop connects automatically when away from home.

## 8. Optional disconnect-on-return

By default, the script only auto-connects.

To also disconnect when you are home again and actively using `ms1`, set:

```bash
WG_AUTO_ENABLE_DISCONNECT=1
```

This is intentionally off by default.

## 9. Troubleshooting

### Tunnel not found

Check that the official WireGuard app exposes the tunnel through macOS VPN services:

```bash
scutil --nc list
```

Then make sure `WG_AUTO_TUNNEL` exactly matches the service name.

### Home Assistant token missing

Verify Keychain lookup:

```bash
security find-generic-password -w -a "$USER" -s wg-auto-home-assistant
```

### Host gating prevents execution

The script exits immediately unless the short hostname matches `WG_AUTO_EXPECT_HOSTNAME`.

Check with:

```bash
hostname -s
```

### Test on a non-`ms1` machine

For local testing elsewhere:

```bash
WG_AUTO_EXPECT_HOSTNAME=$(hostname -s) \
WG_AUTO_HA_STATE_OVERRIDE=on \
WG_AUTO_IDLE_SECONDS_OVERRIDE=900 \
~/dotfiles/.bin/ms1-away-vpn-agent --dry-run
```
