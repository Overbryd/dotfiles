export function isDevTools(api = globalThis.chrome) {
  return Number.isInteger(api?.devtools?.inspectedWindow?.tabId);
}

export function applyTheme(api = globalThis.chrome, root = document.documentElement) {
  root.dataset.theme = api?.devtools?.panels?.themeName === "dark" ? "dark" : "light";
}

export async function inspectedTab(api = globalThis.chrome) {
  if (!isDevTools(api)) throw new Error("Open Pi Inspect in DevTools to inspect a page.");
  const tab = await api.tabs.get(api.devtools.inspectedWindow.tabId);
  if (!tab?.id) throw new Error("No inspected tab");
  if (tab.url) return tab;

  // tabs.get hides URLs without host access. Read only the inspected page's
  // metadata so the picker can request that origin, not access to all tabs.
  const metadata = await new Promise((resolve, reject) => {
    api.devtools.inspectedWindow.eval("({ url: location.href, title: document.title })", (value, exception) => {
      if (exception?.isException || exception?.isError || typeof value?.url !== "string") {
        reject(new Error("Cannot read the inspected page. Inspect an HTTP(S) page and try again."));
      } else {
        resolve({ url: value.url, title: String(value.title || "") });
      }
    });
  });
  return { ...tab, ...metadata };
}
