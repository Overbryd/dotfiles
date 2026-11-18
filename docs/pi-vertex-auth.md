# Google Vertex authentication recovery

`invalid_rapt` means Google requires user presence. Ordinary model retries cannot repair it. All Google authentication discovery/refresh now belongs to the Token Exchange client:

```sh
token-exchange google status
token-exchange google ensure
token-exchange google login
```

The `google-adc` compatibility name delegates to `google ensure`. No separate gcloud CLI login, desktop-browser fallback, terminal suspension, or another path-discovery implementation remains in the Pi retry path.

`pi/extensions/google-token-exchange.ts` prefers a configured Gemini Vertex API key; only requests without a key use ADC and phone repair. A rejected key remains an error rather than silently switching credentials. The fork's Vertex API-key client preserves the configured project/location, including `global`, instead of dropping them into Express routing.

For ADC, the extension catches one recognized pre-stream auth failure, asynchronously calls `google ensure`, then reissues only that model request. Output/tools already emitted are never replayed. While connecting, Pi displays `Waiting for Vertex response (API key)` or `(ADC)`. Phone repair displays `Waiting for Google sign-in (ADC)` with a persistent footer; headless runs report it on stderr. Status clears on completion, failure, cancellation, and shutdown.

The default idle deadline is 120 seconds, reset by provider events; callers can override it with `timeoutMs`. Sign-in has a separate five-minute deadline. Cancellation and deadlines settle the turn even if the underlying provider or repair ignores its abort signal, retaining any partial output and usage. A core fork rebuild requires restarting Pi; `/reload` only updates extensions and cannot replace an already-loaded provider implementation or in-flight request.

`/retry` uses the same asynchronous ensure in TUI, RPC and headless sessions, following effective provider-scoped environment. `/retry --skip-auth` bypasses the credential check if externally repaired. Scope/permission/quota errors do not initiate login. The helper uses one private `~/.config/token-exchange/google.json` to remember phone/account/client/scopes; env selectors still take precedence. Credentials are never included in that registry.

`make pi-settings` installs the pinned local SDK dependencies from `pi/package-lock.json`, preserves any configured `google-vertex` API key, and scopes both `google-vertex` and `google-vertex-anthropic` in `~/.pi/agent/auth.json` to `gen-lang-client-0951766844` (`global`), `$HOME/Work/Parlant/.config/gcloud-parlant/application_default_credentials.json`, and `lukas@parlant.co`, while `scopedGoogleEnv` strips ambient `CLOUDSDK_*` selectors during ADC repair. This keeps `gemini-4-argon` on the Parlant GenAI project even inside work folders whose `.envrc` overrides `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, or `CLOUDSDK_*`, without altering `process.env` for `bash` tool subshells.

Use `/profile auto google` for automatic Gemini 4 family routing (`google/hydrogen` for economy and routine tasks, `google/argon` for complex tasks and escalations, and `google/carbon` for critical tasks). Use `/profile auto google/hydrogen`, `/profile auto google/argon`, or `/profile auto google/carbon` (or locked `/profile google/<hydrogen|argon|carbon>[:<effort>]`) to pin one Gemini 4 model. The `gemini-4-*` shorthands remain accepted. The global endpoint replaces EU-only routing: verified 2026-11-10 that `eu-aiplatform.googleapis.com` rejects requests with `Invalid hostname`, while the same request through `global` succeeds.

Verified 2026-10-22: real phone repair and headless `gemini-4-argon`; live healthy ensure without phone request or ADC rewrite; disposable automatic recovery and RPC `/retry` with one injected `invalid_rapt`, real ensure and a tiny Vertex response. Automatic recovery had one user message, zero terminal errors, one settlement. RPC retry resumed the same branch/user message after the retained test failure. These injected cases reused healthy ADC; combined actual expiry+phone acceptance and cancelled/concurrent waiter tests remain.

## Gemini 4 models

`pi/models.json` exposes Vertex's `gemini-4-argon`, `gemini-4-carbon`, and `gemini-4-hydrogen`. Select one through `/model`, `/profile auto google/<hydrogen|argon|carbon>`, or `/profile google/<hydrogen|argon|carbon>[:<effort>]` without changing the global default.

Hydrogen's global standard prices are $1.50/M input, $7.50/M output, and $0.075/M cache reads. Carbon's configured $2/M input and $10/M output follow the current credit-based promotion through November 30, 2026, as Argon's existing metadata does; these are effective estimates, not a guarantee of the amount initially invoiced. Standard Carbon/Argon prices become $4/M input and $20/M output on December 1. See [Vertex pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing).

All three expose low/medium/high thinking. Hydrogen also supports `XHIGH` upstream, but Pi 1.3's Google adapter and pinned Google SDK enum do not; do not advertise that level until the adapter supports it. `off`/`minimal` are disabled because these models reject them. Output stays capped at 65,536 tokens: their 1M-token output requires a separate long-decode continuation mechanism. Hydrogen's 1M-token window includes both input and output. See [Hydrogen's Vertex model documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/4-hydrogen).

## Priority PayGo (opt-in)

Run `/priority-paygo on` to request Priority PayGo for global Vertex Gemini 4 Hydrogen, Argon, and Carbon, including `/profile auto google`. Use `/priority-paygo status` to check or `/priority-paygo off` to return to normal routing. The switch follows the Pi session branch across reloads and resumes. New sessions start with it off. No model default or credentials change. Claude Fable and other models are unaffected.

Pi sends `X-Vertex-AI-LLM-Request-Type: shared` and `X-Vertex-AI-LLM-Shared-Request-Type: priority` to request Priority PayGo without using Provisioned Throughput. The footer shows the preference, not the tier actually served. Pi uses priority prices in its cost estimate only when the response reports `usageMetadata.trafficType: ON_DEMAND_PRIORITY`; a downgrade (`ON_DEMAND`) or missing tier metadata uses the standard estimate.

Published global Priority PayGo rates (USD per million tokens):

| Model | Input | Output (including thinking) | Cache read |
| --- | ---: | ---: | ---: |
| Hydrogen | $2.70 | $13.50 | $0.135 |
| Argon / Carbon through Nov 30, 2026 | $3.60 | $18.00 | $0.18 |
| Argon / Carbon starting Dec 1, 2026 | $7.20 | $36.00 | $0.36 |

Argon/Carbon promotional estimates include Google's billing credit; Pi switches estimates at midnight UTC on December 1. Hydrogen's published priority cache-write rate is $3.375/M; this adapter does not create explicit caches. See [Priority PayGo documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/priority-paygo) and [Model Garden pricing](https://cloud.google.com/model-garden/pricing?hl=en).

## Claude Fable 5.2 on Vertex

After `make pi-settings`, run `/reload` and select `/profile google/fable-5.2:high`. `/profile auto google/fable-5.2` pins Fable while classifying thinking effort; `/profile auto google` remains Gemini-only. Aliases `fable-5-2` and `claude-fable-5-2` are also accepted. No global default is changed.

Fable uses the separate `google-vertex-anthropic` provider, the official Anthropic Vertex SDK, and Pi's native Anthropic message/tool/usage handling. It requires provider-scoped project/location/ADC rather than ambient work-folder credentials. Google phone recovery and `/retry` work for both Vertex providers. Requests disable SDK retries and default to a 120-second timeout.

The global model ID is `claude-fable-5-2`, with a 1,000,000-token context and 128,000-token output limit. Standard global prices are $8/M input, $40/M output, $0.20/M cache reads, and $10/M five-minute cache writes. See [Google's model documentation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude/fable-5-2) and [partner-model pricing](https://cloud.google.com/model-garden/partner-models/pricing).

Google requires Anthropic publisher data-sharing consent for this model; prompts and responses can be retained for up to 30 days for abuse monitoring. Deployment and authentication never enable consent automatically. A `429 RESOURCE_EXHAUSTED` for `global_online_prediction_requests_per_base_model` / `anthropic-claude-fable` requires an appropriate Vertex quota on the selected project; it is not an authentication failure.

Durable can use the same catalog through Pi's `ModelRuntime`, as the original upstream terminal demo does. A bare Durable `createModels()` does not automatically load CLI `models.json`. The v1.0.0 demo additionally needs the upstream Gemini 4 wire-format fix from 1.3.0; otherwise it sends `thinkingBudget`, which Gemini 4 rejects. CLI extensions such as auto-profile and phone-auth recovery do not automatically become Durable extensions.

Google browser sessions reuse phone sign-in without exporting cookies. Organizational reauthentication/MFA policy still applies. APNs wake-up is unfinished; phone app currently needs to be foregrounded. Persistent daemon issuance approval remains separate.

Compiled client: `~/.local/libexec/token-exchange`; dotfiles contain only the small launcher. Full runbook: Token Exchange `examples/google/README.md`; private inventory/article: Obsidian `Private/Zettelkasten/Token Exchange.md`.
