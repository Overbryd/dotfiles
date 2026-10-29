# MultiCodex broker-bound accounts

Optional source integration; not yet activated/accepted against production. Owner targets `andreas@parlant.co` and `lukas+openai@parlant.co` separately.

The extension loads private `<agent-dir>/codex-broker.json` metadata (mode0600, owned regular/no hardlinks/symlinks), e.g. public selection placeholders:

```json
{
  "version": 1,
  "binary": "/selected/token-exchange",
  "config": "/private/pinned-client.json",
  "accounts": [
    {"account":"first@example.test","property":"codex-first","actor":"first","clientId":"app_EMoamEEZ73f0CkXaXp7hrann"},
    {"account":"second@example.test","property":"codex-second","actor":"second","clientId":"app_EMoamEEZ73f0CkXaXp7hrann"}
  ]
}
```

No tokens/grants here. Exact unique email and property/actor bindings must match admitted daemon policy and independently validated identity. Do not create a live registry until both selected accounts pass coordinated acceptance. Missing registry preserves legacy mode; invalid/partial registry fails closed rather than using old credentials. Cover every existing local MultiCodex account; Pi's `auth.json` is not silently adopted while enabled.

Broker owns renewal authority. `codex token` sends short-lived verified values over private bounded pipes; consumer tokens stay in memory and every inference auth checks daemon policy. No local provider refresh or legacy grant import. `codex-accounts.json` remains read-only while enabled. Existing active/manual/quota/credits/touch-grass selection runs normally in memory; new selection state does not persist across reloads. No retries after forwarded model output.

`/multicodex add|reauth <enrolled-email>` explicitly requests signed phone login, with no URL/code in Pi output. Ordinary startup/use denies new consent. Transport errors do not permanently mark credentials revoked; explicit reauth remains available. Caller cancellation and session shutdown cancel only owned requests. Commands cannot remove broker bindings/grants implicitly. Legacy add/remove are disabled while bindings are enabled; manage approved metadata separately.

Helpers under `pi/lib/codex-{broker,registry}.{mjs,d.mts}` must be deployed together; Makefile includes these suffixes. Active source symlinks through `~/dotfiles` so reload sees changes. Existing touch-grass/model-switch work is independent; preserve its diff when staging.

Local test prerequisites: installed Pi packages/jiti, synthetic `PI_CODING_AGENT_DIR`, isolated public source copy; never point tests at real auth files. Relevant suites `multicodex-broker.test.ts`, `multicodex.test.ts`, `touch-grass.test.ts`; Token Exchange scripts exercise adapter/registry/integration mutations and Rust CLI over generated pinned HTTPS. Source integration is not a phone update, daemon cutover or accepted live migration.
