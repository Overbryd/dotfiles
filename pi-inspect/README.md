# Pi Inspect

Point at rendered page regions, attach comments, preserve Phoenix source annotations, and send the resulting feedback to an active [pi](https://github.com/earendil-works/pi-mono) coding session.

## Current scope

- Chromium Manifest V3 extension available only as a persistent DevTools panel
- Compact inspector-style toolbars, flat note rows, and light/dark colors matching the DevTools theme
- In-page element picker, visual highlight, and click-anchored note composer
- Saved markers show a dot and `#N`, expand on pointer proximity, and support inline page editing
- Vertically offscreen markers clamp to the nearest viewport border while preserving their x-position; click one to return to its target
- Expanded page notes support inline editing and deletion synchronized with Pi Inspect
- Persistent, monotonically numbered note cards with inline edit/delete controls
- Phoenix component-range, definition, and caller extraction from HTML comments
- Authenticated loopback connection to one active pi session
- Draft feedback into pi's editor or send it as a user message
- Read tools:
  - `browser_status`
  - `browser_list_annotations`
  - `browser_inspect`
  - `browser_highlight`
  - `browser_snapshot`
- Opt-in browser-driving tools:
  - `browser_click`
  - `browser_type`
  - `browser_select`
  - `browser_scroll`
  - `browser_navigate`
  - `browser_reload`

Driving stays disabled until **Enable browser driving on all sites** is checked in Pi Inspect. Enabling requests optional HTTP/HTTPS host access so pi can navigate across origins without an impossible mid-tool permission prompt; disabling revokes that optional access. No cookie/storage access or arbitrary page JavaScript execution is exposed.

## Install

### 1. Set up the pi bridge

From the dotfiles repository root, with Node.js, npm, and pi already installed:

```bash
make pi-inspect
```

This installs the locked dependencies in `pi-inspect/node_modules/` and symlinks the whole `pi-inspect/` package to `~/.pi/agent/extensions/pi-inspect`. The package manifest points pi to `pi-extension/index.ts`; keeping the package together lets the bridge resolve its dependencies through the symlink. It is also included in `make dotfiles`. Start pi normally from the web application's project directory, or run `/reload` in an existing session.

For a one-off run without the global symlink:

```bash
npm ci --ignore-scripts --prefix ~/dotfiles/pi-inspect
pi -e ~/dotfiles/pi-inspect/pi-extension/index.ts
```

### 2. Load the browser extension

Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select `~/dotfiles/pi-inspect/extension/`.
5. Open Developer Tools on the page to inspect and select the **Pi Inspect** tab (under **»** if the tab strip is crowded).

Vivaldi can load the same unpacked extension from `vivaldi://extensions`.

Dock DevTools left, right, or below the page, or use a separate DevTools window. Pi Inspect always targets the inspected tab, never whichever browser tab happens to be active. Its colors follow **DevTools Settings → Appearance → Theme**, including when that differs from the operating system theme.

There is no toolbar action, popup, or browser side panel. Opening the panel URL directly shows instructions instead of connecting to pi. Chrome still lists Pi Inspect in its installed-extensions menu; that listing is controlled by Chrome.

The extension has persistent access to local development hosts (`localhost`, `*.localhost`, and `127.0.0.1`). On another HTTP(S) host, clicking **Select element** requests access to that origin only; the broad optional permission is never granted automatically.

### 3. Pair

1. Open **Pi Inspect** in the page's DevTools.
2. In pi, run `/browser-pair`.
3. Enter the six-digit code in the DevTools panel within five minutes and click **Connect**.
4. Click **Select element**, then click an element on the page.
5. Enter the change in the anchored `Note #N` textbox and save it.
6. Edit, highlight, delete, resolve, or send the numbered note from the DevTools list.

The stored browser secret is process-specific. Pair again after restarting pi.

### Moving from the old checkout

This directory contains the working tree from `diy-chrome-sidebar`, including its uncommitted changes and browser test scenarios. Git history, installed dependencies, and generated test artifacts were not imported; the original checkout is left intact.

Disable the old unpacked browser extension and load the new directory above. Changing an unpacked extension's path can change its extension ID, so stored notes and permissions may not carry over. Keep the old installation until any notes you need have been sent to pi.

Remove any old bridge path from pi's `extensions` setting or global extension symlinks before reloading, so only one bridge loads. `/browser-pair`, `browser_*` tools, the bridge protocol, and internal browser storage keys remain unchanged.

## Phoenix annotations

Development markup such as:

```html
<!-- @caller lib/app_web/pages/storefront.html.heex:71 (app_web) -->
<!-- <AppWeb.StorefrontComponents.product_grid> lib/app_web/components/storefront_components.ex:105 (app_web) -->
<div>...</div>
<!-- </AppWeb.StorefrontComponents.product_grid> -->
```

becomes a range around matching DOM elements. Each selected element records the complete enclosing Phoenix render stack, including component definition and caller locations.

These locations are sent as untrusted hints. Pi should inspect and verify project files before editing.

## Security

- Bridge binds only to `127.0.0.1:17373`.
- It accepts WebSockets only from Chromium/Vivaldi extension and DevTools origins.
- A short-lived pairing code exchanges a random process secret.
- Input values and token-like attributes are redacted from DOM excerpts.
- Payload and output sizes are bounded.
- Browser-driving tools require an explicit toggle and browser-approved optional all-site HTTP/HTTPS access in Pi Inspect. Disabling driving revokes that access.
- Typing into password and file inputs is refused.
- Navigation is limited to HTTP(S) origins already granted to the extension.

Page DOM is untrusted model input. A page can forge source-like comments or prompt-like text.

## Development

From this directory:

```bash
npm test
npm run check
```

Run `/reload` in pi after bridge changes; reload the unpacked extension and reopen its DevTools panel after browser changes.

Existing browser scenarios live in `.pi/playwright-scenarios/`. Run them with the shared Playwright runner using this directory as the project directory. The Phoenix/parser and note-composer scenarios expect the original demo application's markup.

One pi session owns fixed port `17373`. Multi-session routing is intentionally deferred to a local broker design.
