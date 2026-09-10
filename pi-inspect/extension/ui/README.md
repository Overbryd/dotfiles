# Pi Inspect UI kit

Small vanilla CSS/DOM library shared by the DevTools panel and in-page controls. No framework, CDN, or build step.

## Styling contract

- `components.css` owns theme tokens, controls, interaction states, and in-page component styles.
- `sidepanel.css` owns panel layout only. Do not redefine shared controls there.
- Use `.pi-button` with optional `--primary`, `--toolbar`, `--icon`, or `--danger` variants (for example, `class="pi-button pi-button--primary"`).
- Inputs use `.pi-input`, `.pi-textarea`, or `.pi-checkbox`; SVG icons use `.pi-icon`.
- Enabled buttons have a pointer cursor, hover/pressed feedback, and keyboard focus rings. Disabled controls keep a default cursor and native disabled semantics.
- Use native `button`, `input`, and `textarea` elements. Preserve accessible names and keyboard behavior.
- Use `hidden` and state classes for visibility. Inline styles are reserved for measured coordinates and dimensions, never colors, borders, fonts, or component styling.

## Mounting

The DevTools document loads `components.css` with a stylesheet link. `installPageUI(tabId, theme)` fetches that same packaged stylesheet from the extension context, installs `shadow.js`, and configures it before the content script runs.

In-page code calls `PiInspectUI.attach(host, "highlight" | "notes" | "composer")`. It returns a closed shadow root with the shared constructable stylesheet adopted. Never adopt the stylesheet on the inspected document or insert global page CSS. No web-accessible resources or extra permissions are needed.

`PiInspectUI.setTheme("light" | "dark")` updates mounted components. The panel supplies its DevTools theme through the content-script ping. Static component markup stays in `content.js`; CSS does not.
