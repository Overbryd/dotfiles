async function configureAction() {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } else {
    await chrome.action.setPopup({ popup: "sidepanel.html" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  configureAction().catch((error) => console.error("Could not configure extension action", error));
});

chrome.runtime.onStartup.addListener(() => {
  configureAction().catch((error) => console.error("Could not configure extension action", error));
});
