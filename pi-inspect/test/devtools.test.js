import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));

test("the extension exposes only a DevTools panel, not a toolbar, popup, or side panel", () => {
  assert.equal(manifest.devtools_page, "devtools.html");
  for (const key of ["action", "browser_action", "page_action", "side_panel", "background"]) {
    assert.equal(manifest[key], undefined, `${key} must not be registered`);
  }
  assert.deepEqual(manifest.permissions, ["scripting", "storage"]);
});

test("browser commands target the inspected tab, including after another tab becomes active", async () => {
  const { inspectedTab } = await import("../extension/lib/devtools.js");
  const api = {
    devtools: { inspectedWindow: { tabId: 42 } },
    tabs: {
      async get(id) {
        assert.equal(id, 42);
        return { id, url: "http://localhost:4000", title: "Inspected page" };
      },
      query() { assert.fail("Must not query the active browser tab"); },
    },
  };
  assert.equal((await inspectedTab(api)).id, 42);
  await assert.rejects(inspectedTab({ tabs: api.tabs }), /DevTools/);
});

test("reads only inspected-page metadata when host access has not been granted yet", async () => {
  const { inspectedTab } = await import("../extension/lib/devtools.js");
  const api = {
    devtools: { inspectedWindow: {
      tabId: 42,
      eval(expression, callback) {
        assert.equal(expression, "({ url: location.href, title: document.title })");
        callback({ url: "https://example.com/review", title: "Review" });
      },
    } },
    tabs: { async get() { return { id: 42 }; } },
  };
  assert.deepEqual(await inspectedTab(api), { id: 42, url: "https://example.com/review", title: "Review" });
  api.devtools.inspectedWindow.eval = (_expression, callback) => callback(null, { isException: true });
  await assert.rejects(inspectedTab(api), /Cannot read the inspected page/);
});

test("panel colors follow the DevTools theme rather than the operating system", async () => {
  const { applyTheme } = await import("../extension/lib/devtools.js");
  const root = { dataset: {} };
  const api = { devtools: { panels: { themeName: "dark" } } };
  applyTheme(api, root);
  assert.equal(root.dataset.theme, "dark");
  api.devtools.panels.themeName = "default";
  applyTheme(api, root);
  assert.equal(root.dataset.theme, "light");
});
