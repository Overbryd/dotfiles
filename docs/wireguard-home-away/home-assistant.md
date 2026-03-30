# Home Assistant notes

## Recommended entity design

The macOS agent works best when Home Assistant exposes one simple state.

Recommended helper:

- `input_boolean.owner_away`

Suggested meaning:

- `on` = away
- `off` = home

This keeps the shell script simple and lets Home Assistant own the presence logic.

## Suggested configuration values

In `~/.wg-auto/ms1.env`:

```bash
HA_ENTITY_ID=input_boolean.owner_away
HA_AWAY_STATES=on,away,not_home
HA_HOME_STATES=off,home
```

## Why use a helper instead of `person.<name>` directly?

A helper gives you freedom to refine the logic later without changing the Mac-side script.

For example, Home Assistant can later decide that “away” means:

- outside the home zone for a minimum time
- not a brief GPS flap
- not a low-confidence transient state

The script then continues to consume only a simple on/off state.

## API access expected by the script

The script reads:

```text
GET <HA_URL>/api/states/<HA_ENTITY_ID>
```

with a bearer token.

It only cares about the returned JSON field:

- `state`

## Security notes

Do not commit HA credentials into this repository.

Use a Home Assistant long-lived access token in:

- the macOS Keychain, preferably
- or a token file outside the repo

## Failure behavior

If the agent cannot query Home Assistant successfully, it logs an error and exits without changing tunnel state.

That conservative behavior avoids making surprising VPN changes when HA is unavailable.
