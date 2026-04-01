# WireGuard home/away automation plan

## 1. Problem statement

You have two related but slightly different VPN automation needs:

- **`ms1`** is the stationary Mac Studio at home, always on, and should become reachable through your WireGuard overlay when you leave home.
- **mobile Macs** such as **`mba1`** should automatically join their own WireGuard profile when they are away from your home network, so they can connect back to `ms1` over the overlay.

The current pain is not WireGuard itself. It is the **last mile of remembering to connect the right profile at the right time**.

Your desired behavior is:

- when you leave home, your machines should make a best effort to join the overlay
- `ms1` should only do this once it is not actively being used anymore (screen locked and/or idle for some time)
- mobile laptops should join automatically when they are on the move
- the solution should use the **official macOS WireGuard client**, not replace it with a different VPN stack

---

## 2. Key facts and constraints

## 2.1 Official macOS WireGuard tunnels are automatable

The official WireGuard macOS app exposes its tunnels to macOS as VPN network connection services.

That means they can be controlled with:

```bash
scutil --nc list
scutil --nc status "ms1"
scutil --nc start "ms1"
scutil --nc stop "ms1"
```

This is the important implementation detail.

> Do **not** build this around UI scripting the menu bar app.

Use `scutil --nc` as the control plane.

---

## 2.2 The official macOS WireGuard client already supports on-demand behavior

The app has built-in **Activate On Demand** support, including SSID-aware behavior.

That makes it a very good fit for the **mobile laptops**.

---

## 2.3 `ms1` has different semantics than a laptop

A laptop can decide “I am not on the home SSID anymore, so connect”.

`ms1` is stationary and stays at home, so it cannot infer your absence from its own network location.

For `ms1`, the relevant signals are instead:

- **your presence**: Home Assistant knows whether you are home or away
- **local activity**: `ms1` can observe whether it is locked or idle

So `ms1` should be driven by a combination of:

- **Home Assistant presence**
- **local idle / lock state**
- **WireGuard service state**

---

## 3. Recommendation in one sentence

**Recommended design:** use **native WireGuard On-Demand** for mobile laptops, and a **small LaunchAgent on `ms1`** that polls Home Assistant presence plus local idle/lock state and then uses `scutil --nc start|stop` to manage the `ms1` tunnel.

---

## 4. Best architecture by machine type

## 4.1 Mobile laptops (`mba1`, etc.): use WireGuard’s native On-Demand

This is the cleanest and lowest-maintenance option for laptops.

For each laptop tunnel:

- tunnel name: e.g. `mba1`
- enable **Activate On Demand**
- scope: **Wi‑Fi and Ethernet**
- set **Except these SSIDs** to your home Wi‑Fi SSID(s)

Result:

- at home: tunnel stays down
- on any other Wi‑Fi / Ethernet network: tunnel comes up automatically
- on wake/network changes: the official app handles the transitions natively

This is better than having Home Assistant orchestrate laptops, because:

- it works even when the laptop is not currently reachable from your home LAN
- it reacts immediately to network changes
- it survives sleep/wake much better than a custom polling script
- it uses the feature already built into the WireGuard client you trust

### Verdict for laptops

**Use native On-Demand, not custom automation.**

---

## 4.2 `ms1`: use a local agent driven by HA presence + local idle/lock

For `ms1`, the most practical automation is:

1. a small local script checks:
   - are you away according to Home Assistant?
   - is the Mac locked?
   - has it been idle for at least N minutes?
   - is the WireGuard tunnel already connected?
2. if the answer is “away + inactive enough + not connected”, it runs:

```bash
scutil --nc start "ms1"
```

3. optionally, when you return home and begin actively using the machine again, it can run:

```bash
scutil --nc stop "ms1"
```

This should run as a **LaunchAgent** so it is managed from your dotfiles and automatically kept alive.

---

## 5. Why this split is the right one

## Option A: one custom automation for every machine

### Pros
- single conceptual system

### Cons
- more moving parts
- worse for laptops crossing networks and sleep/wake boundaries
- requires HA or remote reachability at exactly the wrong times

### Verdict
Too much machinery for the mobile case.

---

## Option B: native On-Demand everywhere

### Pros
- simplest
- robust
- no custom scripts for most cases

### Cons
- does not model your “connect `ms1` only after I leave and the machine is no longer in use” rule

### Verdict
Great for laptops, not enough for `ms1` if you want activity-aware behavior.

---

## Option C: native On-Demand for laptops + local `ms1` agent

### Pros
- matches each device class to the right mechanism
- very little custom code
- keeps control local on `ms1`
- avoids fragile UI automation
- easy to manage from dotfiles

### Cons
- one small script and one LaunchAgent to maintain
- requires `ms1` to know your HA presence state

### Verdict
**Best fit.**

---

## 6. Control surfaces to use

## 6.1 WireGuard tunnel state

Use `scutil --nc` exclusively.

Useful commands:

```bash
scutil --nc list
scutil --nc status "ms1"
scutil --nc start "ms1"
scutil --nc stop "ms1"
```

The same applies for laptop profiles, e.g.:

```bash
scutil --nc status "mba1"
```

---

## 6.2 Screen lock state on macOS

`ms1` can read lock state from IOKit data exposed through `ioreg`.

Conceptually:

```bash
ioreg -a -n Root -d1 | plutil -p -
```

You can read:

- `IOConsoleLocked => 1` when the screen/session is locked
- `IOConsoleLocked => 0` when unlocked

---

## 6.3 Idle time on macOS

Idle time can be read from `IOHIDSystem`.

Conceptually:

```bash
ioreg -c IOHIDSystem
```

Look for `HIDIdleTime`, then convert nanoseconds to seconds.

This is enough for a small shell script to decide whether the machine has been inactive for, for example:

- 300 seconds
- 600 seconds
- 900 seconds

I would start with **600 seconds (10 minutes)**.

---

## 6.4 Presence state from Home Assistant

Do not overcomplicate this.

The local `ms1` agent should read **one simple HA state**:

- either `person.<you>`
- or a helper like `input_boolean.owner_away`

I slightly prefer a helper boolean because it lets you refine the HA logic independently later.

Example semantics:

- `on` = you are away
- `off` = you are home

The agent can poll Home Assistant’s REST API once per minute.

That is simple, reliable, and avoids opening a listener on `ms1`.

---

## 7. Recommended behavior model

## 7.1 Minimal policy

For `ms1`, start with the smallest useful rule set:

### Connect `ms1` when
- Home Assistant says you are **away**
- and `ms1` is **locked** or **idle >= 10 minutes**
- and the `ms1` WireGuard tunnel is **not already connected**

### Do nothing when
- you are away but the machine is still actively being used
- you are home and the tunnel is disconnected already

### Optional disconnect rule
- if Home Assistant says you are **home**
- and the machine is **unlocked and active again**
- and the tunnel is connected
- then stop the tunnel

I would make the **disconnect-on-return** behavior optional in v1.

Connecting automatically is the main value.

---

## 7.2 Why disconnect should be optional at first

Auto-connect while away is easy to justify.

Auto-disconnect on return is slightly trickier because:

- you may still have an active remote session
- arrival-home state can flap briefly
- the machine may still be doing something useful over the tunnel

So the safer v1 policy is:

- **automatically connect when away + inactive**
- **leave disconnect manual or delayed**

Then add disconnect automation later if you want it.

---

## 8. Concrete dotfiles-managed design

## 8.1 Files to add later

Recommended future implementation files:

- `.bin/wg-tunnel`
- `.bin/ms1-away-vpn-agent`
- `LaunchAgents/com.overbryd.ms1-away-vpn.plist`

Optional config/example file:

- `.config/wg-auto/ms1.env.example`

---

## 8.2 `.bin/wg-tunnel`

A tiny wrapper around `scutil --nc`.

Responsibilities:

- `status <name>`
- `start <name>`
- `stop <name>`
- normalize output / exit status

Example behavior:

```bash
wg-tunnel status ms1
wg-tunnel start ms1
wg-tunnel stop ms1
```

Why this wrapper helps:

- avoids duplicating `scutil` parsing in multiple places
- gives you one place for logging and retries
- makes the agent script much smaller

---

## 8.3 `.bin/ms1-away-vpn-agent`

A small shell script run periodically by launchd.

Inputs:

- tunnel name: `ms1`
- HA base URL
- HA entity to read (`input_boolean.owner_away` or `person.<you>`)
- idle threshold in seconds
- optional “disconnect on home” flag

Responsibilities:

1. read HA away/home state
2. read `IOConsoleLocked`
3. read `HIDIdleTime`
4. read current WireGuard state
5. decide whether to connect, disconnect, or no-op
6. log concise status to a log file

### Suggested decision table

| HA away? | locked? | idle >= threshold? | tunnel connected? | action |
|---|---:|---:|---:|---|
| no | any | any | no | no-op |
| no | any | any | yes | optional stop |
| yes | yes | any | no | start |
| yes | no | yes | no | start |
| yes | no | no | no | no-op |
| yes | any | any | yes | no-op |

---

## 8.4 LaunchAgent

Use a LaunchAgent installed from dotfiles:

- `LaunchAgents/com.overbryd.ms1-away-vpn.plist`

Recommended launch behavior:

- `RunAtLoad = true`
- `StartInterval = 60`
- standard output/error log paths under `/tmp/` or a user log directory

Why polling every 60 seconds is acceptable:

- very cheap
- no extra always-on server required
- easy to reason about
- good enough for this kind of presence automation

---

## 8.5 Secret handling

Do **not** commit a Home Assistant long-lived token into dotfiles.

Recommended options:

### Best option
Store the HA token in the macOS Keychain and let the script read it with `security`.

### Acceptable option
Store it in a non-committed env file under your home directory.

The plan should assume:

- repo contains only the script logic and example env/config shape
- secrets stay outside Git

---

## 9. Home Assistant side

## 9.1 Keep the HA side simple

You already have the Home Assistant mobile app on your iPhone, so presence is already available.

There is no need to make HA drive the tunnel directly.

Instead, HA should expose a single clean state that `ms1` can read.

Two good approaches:

### Approach 1: read `person.<you>` directly
- `home` means home
- anything else means away

### Approach 2: create a helper boolean
- `input_boolean.owner_away`

I recommend the helper if you want future flexibility.

For example, later you might say:

- away only after 5 minutes outside the home zone
- away only if phone battery is not dead
- away only if not in an obviously noisy transient state

That logic can live in HA, while the Mac script remains dumb and stable.

---

## 9.2 Suggested HA helper model

### Entity
- `input_boolean.owner_away`

### Automation
- turn it **on** when your iPhone/person leaves `home`
- turn it **off** when you return to `home`

That is enough for v1.

Optional later helper:

- `input_boolean.force_ms1_vpn`
- `input_boolean.suppress_ms1_vpn`

Those would let you manually override the Mac behavior from HA.

---

## 10. Recommended implementation phases

## Phase 0: Validate the primitives manually

### Tasks
- confirm the WireGuard tunnels appear in `scutil --nc list`
- manually test:
  - `scutil --nc start "ms1"`
  - `scutil --nc stop "ms1"`
  - `scutil --nc status "ms1"`
- verify `IOConsoleLocked` parsing on `ms1`
- verify `HIDIdleTime` parsing on `ms1`
- confirm you can query the HA presence/helper state from `ms1`

### Deliverable
A short scratchpad proving all building blocks work.

---

## Phase 1: Solve laptops with zero custom code

### Tasks
- on `mba1` and any other mobile Mac:
  - open WireGuard
  - edit tunnel
  - enable **Activate On Demand**
  - select **Wi‑Fi and Ethernet**
  - add your home SSID(s) to **Except these SSIDs**
- test by leaving the home SSID / joining another network

### Deliverable
Laptops connect automatically when mobile.

---

## Phase 2: Safe `ms1` MVP

### Tasks
- add `.bin/wg-tunnel`
- add `.bin/ms1-away-vpn-agent`
- add `LaunchAgents/com.overbryd.ms1-away-vpn.plist`
- poll once per minute
- connect only when:
  - away in HA
  - and locked or idle >= 10 min
- no auto-disconnect yet
- log every decision concisely

### Deliverable
`ms1` reliably brings up its tunnel after you leave and the machine becomes inactive.

---

## Phase 3: Optional disconnect and manual override

### Tasks
- optionally stop the tunnel when:
  - HA says home
  - machine is unlocked and active again
- add HA override helpers if desired
- add desktop notification or HA notification on connect failures

### Deliverable
More polished, but still simple.

---

## Phase 4: Hardening

### Candidates
- retry with backoff if `scutil --nc start` fails
- alert if tunnel remains disconnected while away
- add a “cooldown” to avoid repeated start attempts every minute
- detect network reachability before retrying
- persist last action timestamp/state to reduce log noise

### Deliverable
Less noisy and more self-healing.

---

## 11. Operational details and edge cases

## 11.1 If Home Assistant is temporarily unavailable

Recommended v1 behavior:

- do **not** disconnect anything just because HA is unreachable
- if the tunnel is already connected, leave it alone
- if the tunnel is disconnected and HA cannot be queried, either:
  - no-op conservatively, or
  - optionally connect if the machine is locked/idle for a long time

The conservative default is **no-op**.

---

## 11.2 If `ms1` reboots while you are away

This is the main thing to think about.

A user LaunchAgent is perfect if `ms1` normally has a logged-in user session.

If not, later you may want one of these:

- keep a normal logged-in session on `ms1`
- switch to a LaunchDaemon if testing shows `scutil --nc start "ms1"` works correctly there
- or decide that `ms1` should simply keep its WireGuard tunnel up all the time

For v1, I would assume the normal logged-in desktop session exists.

---

## 11.3 If the tunnel is already connected

The agent should treat this as success and no-op.

It must be idempotent.

---

## 11.4 If you decide the real answer is “`ms1` should just always be connected”

That is a completely valid conclusion.

In fact, for a stationary always-on home anchor node, **always-on WireGuard** is the simplest architecture.

If you later decide that your real operational goal is simply:

> `ms1` should always be reachable from the overlay

then the best solution may be:

- keep `ms1` connected permanently
- keep laptops on native On-Demand

That is simpler than any HA-based condition.

But the plan in this document matches your stated preference for **away + inactive gating**.

---

## 12. What not to do

Avoid these approaches unless forced:

### 1. UI scripting WireGuard
- brittle
- tied to window/menu structure
- likely to break on app updates

### 2. Full HA remote orchestration of laptop VPN state
- hard at exactly the times the laptop is roaming
- more fragile than native On-Demand

### 3. Overbuilding the first version
- no need for a daemon with IPC
- no need for a database
- no need for bidirectional event streaming

A `scutil` wrapper + one periodic script + one LaunchAgent is enough.

---

## 13. Concrete next steps

1. **Create this plan file in `.plans`**
2. **Manually verify `scutil --nc start|stop|status` for `ms1`**
3. **Enable native WireGuard On-Demand on `mba1` and other mobile Macs**
4. **Create a simple HA helper state for away/home**
5. **Implement the `ms1` LaunchAgent MVP**
6. **Test only auto-connect first**
7. **Add auto-disconnect later only if it still feels desirable**

---

## 14. Final recommendation

The best practical solution is not one giant centralized automation.

It is a **split design**:

- **Laptops:** use the official WireGuard app’s **On-Demand with home SSID exceptions**
- **`ms1`:** use a **local LaunchAgent** that combines:
  - Home Assistant away/home state
  - local lock/idle detection
  - `scutil --nc` tunnel control

That gives you:

- the least custom code
- a robust laptop experience while roaming
- a home Mac that becomes reachable when you leave and it is no longer in active use
- a solution that fits naturally into your dotfiles repo via `.bin` and `LaunchAgents`

If later you want the absolute simplest operational model, the fallback answer is even simpler:

- leave `ms1` permanently connected
- keep laptops on native On-Demand

But for your stated goal, the **split design above is the best fit**.
