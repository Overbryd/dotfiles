# Google Vertex authentication recovery

`invalid_rapt` means Google requires user presence. Ordinary model retries cannot repair it. All Google authentication discovery/refresh now belongs to the Token Exchange client:

```sh
token-exchange google status
token-exchange google ensure
token-exchange google login
```

The `google-adc` compatibility name delegates to `google ensure`. No separate gcloud CLI login, desktop-browser fallback, terminal suspension, or another path-discovery implementation remains in the Pi retry path.

`pi/extensions/google-token-exchange.ts` preserves Vertex model/auth configuration and catches one recognized pre-stream auth failure before the turn settles. It asynchronously calls `google ensure`, then reissues only that model request. Output/tools already emitted are never replayed.

`/retry` uses the same asynchronous ensure in TUI, RPC and headless sessions, following effective provider-scoped environment. `/retry --skip-auth` bypasses the credential check if externally repaired. Scope/permission/quota errors do not initiate login. The helper uses one private `~/.config/token-exchange/google.json` to remember phone/account/client/scopes; env selectors still take precedence. Credentials are never included in that registry.

Verified 2026-10-22: real phone repair and headless `gemini-4-argon`; live healthy ensure without phone request or ADC rewrite; disposable automatic recovery and RPC `/retry` with one injected `invalid_rapt`, real ensure and a tiny Vertex response. Automatic recovery had one user message, zero terminal errors, one settlement. RPC retry resumed the same branch/user message after the retained test failure. These injected cases reused healthy ADC; combined actual expiry+phone acceptance and cancelled/concurrent waiter tests remain.

Google browser sessions reuse phone sign-in without exporting cookies. Organizational reauthentication/MFA policy still applies. APNs wake-up is unfinished; phone app currently needs to be foregrounded. Persistent daemon issuance approval remains separate.

Compiled client: `~/.local/libexec/token-exchange`; dotfiles contain only the small launcher. Full runbook: Token Exchange `examples/google/README.md`; private inventory/article: Obsidian `Private/Zettelkasten/Token Exchange.md`.
