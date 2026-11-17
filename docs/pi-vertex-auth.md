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

`make pi-settings` pins `google-vertex` in `~/.pi/agent/auth.json` to `gen-lang-client-0951766844` (`global`), `$HOME/Work/Parlant/.config/gcloud-parlant/application_default_credentials.json`, and `lukas@parlant.co`, while `scopedGoogleEnv` strips ambient `CLOUDSDK_*` selectors during ADC repair. This keeps `gemini-4-argon` on the Parlant GenAI project even inside work folders whose `.envrc` overrides `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, or `CLOUDSDK_*`, without altering `process.env` for `bash` tool subshells.

Use `/profile auto google` for automatic Gemini 4 family routing (`google/hydrogen` for economy and routine tasks, `google/argon` for complex tasks and escalations, and `google/carbon` for critical tasks). Use `/profile auto google/hydrogen`, `/profile auto google/argon`, or `/profile auto google/carbon` (or locked `/profile google/<hydrogen|argon|carbon>[:<effort>]`) to pin one Gemini 4 model. The `gemini-4-*` shorthands remain accepted. The global endpoint replaces EU-only routing: verified 2026-11-10 that `eu-aiplatform.googleapis.com` rejects requests with `Invalid hostname`, while the same request through `global` succeeds.

Verified 2026-10-22: real phone repair and headless `gemini-4-argon`; live healthy ensure without phone request or ADC rewrite; disposable automatic recovery and RPC `/retry` with one injected `invalid_rapt`, real ensure and a tiny Vertex response. Automatic recovery had one user message, zero terminal errors, one settlement. RPC retry resumed the same branch/user message after the retained test failure. These injected cases reused healthy ADC; combined actual expiry+phone acceptance and cancelled/concurrent waiter tests remain.

## Gemini 4 models

`pi/models.json` exposes Vertex's `gemini-4-argon`, `gemini-4-carbon`, and `gemini-4-hydrogen`. Select one through `/model`, `/profile auto google/<hydrogen|argon|carbon>`, or `/profile google/<hydrogen|argon|carbon>[:<effort>]` without changing the global default.

Hydrogen's global standard prices are $1.50/M input, $7.50/M output, and $0.075/M cache reads. Carbon's configured $2/M input and $10/M output follow the current credit-based promotion through November 30, 2026, as Argon's existing metadata does; these are effective estimates, not a guarantee of the amount initially invoiced. Standard Carbon/Argon prices become $4/M input and $20/M output on December 1. See [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing).

All three expose low/medium/high thinking. Hydrogen also supports `XHIGH` upstream, but Pi 1.3's Google adapter and pinned Google SDK enum do not; do not advertise that level until the adapter supports it. `off`/`minimal` are disabled because these models reject them. Output stays capped at 65,536 tokens: their 1M-token output requires a separate long-decode continuation mechanism. Hydrogen's 1M-token window includes both input and output. See [Hydrogen's Vertex model documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/4-hydrogen).

Durable can use the same catalog through Pi's `ModelRuntime`, as the original upstream terminal demo does. A bare Durable `createModels()` does not automatically load CLI `models.json`. The v1.0.0 demo additionally needs the upstream Gemini 4 wire-format fix from 1.3.0; otherwise it sends `thinkingBudget`, which Gemini 4 rejects. CLI extensions such as auto-profile and phone-auth recovery do not automatically become Durable extensions.

Google browser sessions reuse phone sign-in without exporting cookies. Organizational reauthentication/MFA policy still applies. APNs wake-up is unfinished; phone app currently needs to be foregrounded. Persistent daemon issuance approval remains separate.

Compiled client: `~/.local/libexec/token-exchange`; dotfiles contain only the small launcher. Full runbook: Token Exchange `examples/google/README.md`; private inventory/article: Obsidian `Private/Zettelkasten/Token Exchange.md`.
