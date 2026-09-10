export async function installPageUI(tabId, theme) {
  const response = await fetch(new URL("./components.css", import.meta.url));
  if (!response.ok) throw new Error(`Could not load Pi Inspect UI styles: ${response.status}`);
  const css = await response.text();
  const target = { tabId };
  await chrome.scripting.executeScript({ target, files: ["ui/shadow.js"] });
  await chrome.scripting.executeScript({
    target,
    func: (styles, appearance) => globalThis.PiInspectUI.configure(styles, appearance),
    args: [css, theme],
  });
}
