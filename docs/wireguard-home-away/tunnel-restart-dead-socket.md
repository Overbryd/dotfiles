# Tunnel restart leaves a dead UDP socket

## Symptom

Toggling the WireGuard tunnel off and on (or switching tunnels) leaves the tunnel in
state *connected* while nothing reaches the peer, so `wssh` keeps probing in vain.
Turning Wi-Fi off and on again, with WireGuard still enabled, fixes it within seconds.

## Evidence

The macOS WireGuard app does not write to the unified log; it writes a binary ring
buffer in its group container. Read it with `wg-log`:

    wg-log --errors --collapse -n 200
    wg-log --follow

A captured failure on `mba1` (2026-09-21, tunnel `mba1`, endpoint `157.230.24.36:51820`):

    11:31:10  [APP] startDeactivation: Tunnel: mba1
    11:31:10  [NET] Stopping tunnel ... Device closed
    11:32:32  [APP] startActivation: Starting tunnel
    11:32:32  [NET] UDP bind has been updated
    11:32:32  [NET] Tunnel interface is utun9
    11:32:32  [APP] Tunnel 'mba1' connection status changed to 'connected'
    11:32:37  [NET] peer - Sending handshake initiation
    11:32:37  [NET] peer - Failed to send handshake initiation:
                    write udp4 0.0.0.0:58945->157.230.24.36:51820: sendto: broken pipe
    ...        same error every ~5s for two minutes, always source port 58945
    11:34:39  [NET] Network change detected ... (Wi-Fi off/on)
    11:34:40  [NET] peer - Failed to send handshake initiation: sendto: no route to host
    11:34:44  [NET] Interface up requested
    11:34:45  [NET] peer - Sending handshake initiation
    11:34:45  [NET] peer - Received handshake response

So the tunnel comes up, claims to be connected, and every single `sendto` on the
freshly created UDP socket fails with `EPIPE` (`broken pipe`). The source port never
changes, meaning the socket is not recreated; the app only re-points it
(`UDP bind has been updated`) on path events, which does not clear the dead state.
Only a real interface transition (Wi-Fi off/on) produces a socket that can send again,
and the error even degrades from `EPIPE` to `ENETUNREACH` on the way there.

Conclusion: the problem is not routing and not `wssh`. The tunnel's outer UDP socket
is created while the old tunnel's interface/policy state is still being torn down, and
it stays unusable until macOS delivers a genuine interface up event.

## Consequences

- restarting the tunnel is *not* a reliable recovery action; a restarted tunnel can be
  connected and mute at the same time
- that also applies to the `ms1` away watchdog in `.bin/ms1-away-vpn-agent`, which
  restarts the tunnel after repeated gateway health-check failures. A restart that
  produces a dead socket looks successful (status `connected`) while the peer stays
  unreachable.

## How to check a suspicious tunnel

    # is the tunnel actually passing traffic?
    wg-log --errors --collapse -n 50

Healthy tunnels show a `Sending handshake initiation` / `Received handshake response`
pair every two minutes. A broken one shows repeating `Failed to send ... broken pipe`
or `no route to host` with a constant source port.

## Candidate recoveries (untested)

Ordered by expected bluntness, all aimed at producing a *new* socket or a real path
event instead of a rebind:

1. kill the network extension so the tunnel is rebuilt by a fresh process:
   `pkill -f WireGuardNetworkExtension`
2. stop the tunnel, wait for status `disconnected`, wait a few seconds, then start it
   (gives macOS time to finish the teardown before the new socket is created)
3. force an interface transition without touching Wi-Fi association, for example
   toggling the Wi-Fi service power
4. Wi-Fi off/on, the known-good but heavy workaround

Verify any candidate with `wg-log --follow` in a second window: the fix is confirmed
when a `Sending handshake initiation` is answered by `Received handshake response`.
