# Pi integrations

- Extensions and `pi/lib/` deploy through symlinks into `~/.pi/agent/`; changes affect future reloads. `/usr/local/dotfiles` is a separate checkout.
- `.bin/pi` prefers the local fork at `~/Projects/JavaScript/pi`. `make pi-fork` builds it without modifying the privileged global fallback; audit release and locked dependency ages before building.
- `make pi-settings` installs `pi/package-lock.json` dependencies, merges settings, preserves the Gemini Vertex API key, and deploys scoped ADC fallback. Anthropic on Vertex remains ADC-only. Never commit private account stores.
- Broker bindings must be explicit and fail closed. Broker tokens stay in memory; `codex-accounts.json` stays read-only. Fresh login requires explicit enrollment/reauth approval. Never log credentials or replay requests after forwarding stream output.
- Auto-profile skips custom-message runs. Classification failures must not switch the session provider; cancellation must settle even when providers ignore their signals.
- Test with the fork's built packages/jiti and isolated `HOME`/`PI_CODING_AGENT_DIR`, never real account stores. Include `pi-ai/compat`, helper dependencies, and `.bin/notify`/`.bin/random-pet` fixtures in isolated source copies.
