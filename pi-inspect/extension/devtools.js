let panelWindow;

chrome.devtools.panels.create(
  "Pi Inspect",
  "",
  "sidepanel.html",
  (panel) => {
    panel.onShown.addListener((window) => {
      panelWindow = window;
      panelWindow.setPiNotesVisible?.(true);
    });
    panel.onHidden.addListener(() => {
      panelWindow?.setPiNotesVisible?.(false);
    });
  },
);
