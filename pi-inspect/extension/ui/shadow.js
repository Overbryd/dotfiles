(() => {
  if (globalThis.PiInspectUI) return;

  let sheet;
  let theme = "light";
  const hosts = new WeakSet();

  function setTheme(value) {
    theme = value === "dark" ? "dark" : "light";
    for (const host of document.querySelectorAll("[data-pi-inspect]")) {
      if (hosts.has(host)) host.dataset.theme = theme;
    }
  }

  function configure(css, value) {
    sheet ??= new CSSStyleSheet();
    sheet.replaceSync(css);
    setTheme(value);
  }

  function attach(host, component) {
    if (!sheet) throw new Error("Pi Inspect UI styles must be loaded before mounting a component.");
    host.dataset.piInspect = component;
    host.dataset.theme = theme;
    const root = host.attachShadow({ mode: "closed" });
    root.adoptedStyleSheets = [sheet];
    hosts.add(host);
    return root;
  }

  globalThis.PiInspectUI = { configure, attach, setTheme };
})();
