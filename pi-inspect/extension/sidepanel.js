"use strict";

import { applyTheme, inspectedTab, isDevTools } from "./lib/devtools.js";
import { installPageUI } from "./ui/install.js";

const BRIDGE_URL = "ws://127.0.0.1:17373/pi-browser";
const STORAGE_KEY = "pi-browser-context-state";
const NEXT_ID_KEY = "pi-browser-context-next-id";
const DELETED_IDS_KEY = "pi-browser-context-deleted-ids";
const DRIVING_KEY = "pi-browser-context-driving-enabled";
const SECRET_KEY = "pi-browser-context-secret";
const DRIVING_ORIGINS = ["http://*/*", "https://*/*"];

const elements = {
  annotations: document.querySelector("#annotations"),
  empty: document.querySelector("#empty-state"),
  status: document.querySelector("#connection-status"),
  pairing: document.querySelector("#pairing"),
  pairingCode: document.querySelector("#pairing-code"),
  enableDriving: document.querySelector("#enable-driving"),
};

let annotations = [];
let nextNoteId = 1;
let deletedNoteIds = new Set();
let drivingEnabled = false;
let pairingSecret;
let socket;
let reconnectTimer;
let connectionTimer;
let page = {};
let panelVisible = document.visibilityState !== "hidden";
const clientKind = "devtools";

function hostPattern(tabUrl) {
  const url = new URL(tabUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Cannot inspect ${url.protocol} pages`);
  }
  return `${url.protocol}//${url.hostname}/*`;
}

async function ensureContentScript(tab, requestPermission = false) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "pi-context:ping", theme: document.documentElement.dataset.theme });
    if (response?.ok) return;
  } catch {}

  const pattern = hostPattern(tab.url);
  let allowed = await chrome.permissions.contains({ origins: [pattern] })
    || await chrome.permissions.contains({ origins: DRIVING_ORIGINS });
  if (!allowed && requestPermission) {
    allowed = await chrome.permissions.request({ origins: [pattern] });
  }
  if (!allowed) {
    throw new Error(`Page access not granted for ${new URL(tab.url).hostname}. Click Select element to grant it.`);
  }

  await installPageUI(tab.id, document.documentElement.dataset.theme);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["lib/phoenix-source.js", "content.js"],
  });
}

async function sendToPage(message, requestPermission = false) {
  const tab = await inspectedTab();
  await ensureContentScript(tab, requestPermission);
  const response = await chrome.tabs.sendMessage(tab.id, message);
  if (!response?.ok) throw new Error(response?.error || "Page command failed");
  return response;
}

function sourceLabel(reference) {
  const source = reference.phoenix?.at(-1);
  if (!source) return reference.selector;
  const defined = source.definedAt;
  const caller = source.calledFrom;
  let text = `<${source.name}> ${defined.path}:${defined.line} (${defined.application})`;
  if (caller) text += ` · @caller ${caller.path}:${caller.line} (${caller.application})`;
  return text;
}

function samePage(left, right) {
  try {
    const first = new URL(left);
    const second = new URL(right);
    first.hash = "";
    second.hash = "";
    return first.href === second.href;
  } catch {
    return left === right;
  }
}

async function syncPageNotes(visible = panelVisible) {
  try {
    const tab = await inspectedTab();
    await ensureContentScript(tab, false);
    const notes = annotations.filter((annotation) => samePage(annotation.reference?.url, tab.url));
    await chrome.tabs.sendMessage(tab.id, {
      type: "pi-context:render-notes",
      notes,
      visible,
      deletedNoteIds: [...deletedNoteIds],
    });
  } catch {}
}

async function saveAndSync() {
  annotations = annotations.filter((annotation) => !deletedNoteIds.has(annotation.id));
  await chrome.storage.local.set({
    [STORAGE_KEY]: annotations,
    [NEXT_ID_KEY]: nextNoteId,
    [DELETED_IDS_KEY]: [...deletedNoteIds],
  });
  send({ type: "syncAnnotations", annotations, page, drivingEnabled, clientKind });
  await syncPageNotes();
}

function deleteNote(id) {
  deletedNoteIds.add(id);
  annotations = annotations.filter((annotation) => annotation.id !== id);
  saveAndSync();
  render();
}

function render() {
  elements.annotations.replaceChildren();
  elements.empty.classList.toggle("hidden", annotations.length > 0);
  document.querySelector("#annotation-count").textContent = annotations.length;
  const unresolved = annotations.some((annotation) => !annotation.resolved);
  document.querySelector("#draft-all").disabled = !unresolved;
  document.querySelector("#send-all").disabled = !unresolved;
  document.querySelector("#clear-resolved").disabled = !annotations.some((annotation) => annotation.resolved);
  const template = document.querySelector("#annotation-template");

  for (const annotation of annotations) {
    const fragment = template.content.cloneNode(true);
    const article = fragment.querySelector(".annotation");
    article.dataset.id = annotation.id;
    fragment.querySelector(".note-title").textContent = `Note #${annotation.id}`;
    const target = fragment.querySelector(".target");
    target.textContent = target.title = annotation.reference.label;
    const source = fragment.querySelector(".source");
    source.textContent = source.title = sourceLabel(annotation.reference);
    const comment = fragment.querySelector(".comment");
    comment.value = annotation.comment || "";
    comment.addEventListener("input", () => {
      annotation.comment = comment.value;
      saveAndSync();
    });
    const resolved = fragment.querySelector(".resolved");
    resolved.checked = Boolean(annotation.resolved);
    resolved.addEventListener("change", () => {
      annotation.resolved = resolved.checked;
      saveAndSync();
      document.querySelector("#draft-all").disabled = !annotations.some((item) => !item.resolved);
      document.querySelector("#send-all").disabled = !annotations.some((item) => !item.resolved);
      document.querySelector("#clear-resolved").disabled = !annotations.some((item) => item.resolved);
    });
    fragment.querySelector(".remove").addEventListener("click", () => deleteNote(annotation.id));
    fragment.querySelector(".highlight").addEventListener("click", () => runPageCommand({
      type: "pi-context:highlight",
      selector: annotation.reference.selector,
    }));
    fragment.querySelector(".draft").addEventListener("click", () => deliver([annotation.id], "draft"));
    fragment.querySelector(".send").addEventListener("click", () => deliver([annotation.id], "send"));
    elements.annotations.append(fragment);
  }
}

function setStatus(text, state = "disconnected") {
  elements.status.textContent = text;
  elements.status.className = `status ${state}`;
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function connect() {
  clearTimeout(reconnectTimer);
  clearTimeout(connectionTimer);
  setStatus("Connecting…", "waiting");
  socket = new WebSocket(BRIDGE_URL);
  connectionTimer = setTimeout(() => {
    setStatus("Pi bridge did not answer; retrying…", "disconnected");
    socket.close();
  }, 5000);

  socket.addEventListener("open", async () => {
    clearTimeout(connectionTimer);
    const tab = await inspectedTab().catch(() => null);
    page = {
      title: tab?.title,
      url: tab?.url,
      viewport: annotations.at(-1)?.reference?.viewport,
    };
    send({ type: "hello", secret: pairingSecret || null, page, drivingEnabled, clientKind });
  });

  socket.addEventListener("message", async (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }

    if (message.type === "hello" && message.status === "ready") {
      setStatus("Connected to pi", "connected");
      elements.pairing.classList.add("hidden");
      send({ type: "syncAnnotations", annotations, page, drivingEnabled, clientKind });
    } else if (message.type === "hello" && message.status === "pairing-required") {
      setStatus("Pairing required", "waiting");
      elements.pairing.classList.remove("hidden");
    } else if (message.type === "paired") {
      pairingSecret = message.secret;
      await chrome.storage.local.set({ [SECRET_KEY]: pairingSecret });
      setStatus("Connected to pi", "connected");
      elements.pairing.classList.add("hidden");
      send({ type: "syncAnnotations", annotations, page, drivingEnabled, clientKind });
    } else if (message.type === "error") {
      setStatus(message.message, "disconnected");
    } else if (message.type === "command") {
      await handleBridgeCommand(message);
    }
  });

  socket.addEventListener("close", () => {
    clearTimeout(connectionTimer);
    setStatus("Pi bridge unavailable; retrying…", "disconnected");
    reconnectTimer = setTimeout(connect, 2000);
  });
  socket.addEventListener("error", () => {
    setStatus("WebSocket connection failed", "disconnected");
    socket.close();
  });
}

async function navigateTab(urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Navigation is limited to HTTP(S) URLs");
  }
  const pattern = hostPattern(url.href);
  const allowed = await chrome.permissions.contains({ origins: [pattern] })
    || await chrome.permissions.contains({ origins: DRIVING_ORIGINS });
  if (!allowed) throw new Error(`Page access not granted for ${url.hostname}. Re-enable browser driving and grant all-site access.`);
  const tab = await inspectedTab();
  await chrome.tabs.update(tab.id, { url: url.href });
  return { url: url.href };
}

async function handleBridgeCommand(message) {
  try {
    const annotation = message.params?.annotationId
      ? annotations.find((item) => item.id === message.params.annotationId)
      : null;
    const selector = message.params?.selector || annotation?.reference?.selector;
    const drivingCommands = new Set(["click", "type", "select", "scroll", "navigate", "reload"]);
    if (drivingCommands.has(message.command) && !drivingEnabled) {
      throw new Error("Browser driving is disabled. Enable it in the Pi Inspect panel.");
    }
    let result;

    if (message.command === "inspect") {
      if (!selector) throw new Error("Annotation or selector not found");
      result = await sendToPage({ type: "pi-context:inspect", selector });
    } else if (message.command === "highlight") {
      if (!selector) throw new Error("Annotation or selector not found");
      result = await sendToPage({ type: "pi-context:highlight", selector });
    } else if (message.command === "snapshot") {
      result = await sendToPage({ type: "pi-context:snapshot" });
    } else if (message.command === "click") {
      if (!selector) throw new Error("Annotation or selector not found");
      result = (await sendToPage({ type: "pi-context:click", selector })).result;
    } else if (message.command === "type") {
      if (!selector) throw new Error("Annotation or selector not found");
      result = (await sendToPage({ type: "pi-context:type", selector, text: message.params?.text, clear: message.params?.clear })).result;
    } else if (message.command === "select") {
      if (!selector) throw new Error("Annotation or selector not found");
      result = (await sendToPage({ type: "pi-context:select", selector, value: message.params?.value })).result;
    } else if (message.command === "scroll") {
      result = (await sendToPage({
        type: "pi-context:scroll",
        selector,
        x: message.params?.x,
        y: message.params?.y,
        block: message.params?.block,
      })).result;
    } else if (message.command === "navigate") {
      result = await navigateTab(message.params?.url);
    } else if (message.command === "reload") {
      const tab = await inspectedTab();
      await chrome.tabs.reload(tab.id);
      result = { reloading: true, url: tab.url };
    } else {
      throw new Error(`Unknown browser command: ${message.command}`);
    }

    send({ type: "commandResult", id: message.id, ok: true, result });
  } catch (error) {
    send({ type: "commandResult", id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

async function runPageCommand(message, requestPermission = false) {
  try {
    await sendToPage(message, requestPermission);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "disconnected");
  }
}

function deliver(ids, mode) {
  if (socket?.readyState !== WebSocket.OPEN) {
    setStatus("Pair with pi first", "waiting");
    return;
  }
  send({ type: "deliver", annotationIds: ids, mode, page });
}

async function initializePanel() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.tab?.id !== chrome.devtools.inspectedWindow.tabId) return;
    if (message.type === "pi-context:note-deleted") {
      const id = Number(message.noteId);
      if (Number.isInteger(id) && id > 0) deleteNote(id);
      return;
    }

    if (message.type === "pi-context:note-updated") {
      const note = annotations.find((annotation) => annotation.id === Number(message.noteId));
      if (!note || typeof message.comment !== "string") return;
      note.comment = message.comment;
      saveAndSync();
      render();
      return;
    }

    if (message.type !== "pi-context:element-selected") return;
    let id = Number(message.noteId);
    if (!Number.isInteger(id) || id < 1 || deletedNoteIds.has(id) || annotations.some((annotation) => annotation.id === id)) {
      while (deletedNoteIds.has(nextNoteId) || annotations.some((annotation) => annotation.id === nextNoteId)) nextNoteId += 1;
      id = nextNoteId;
      nextNoteId += 1;
    }
    nextNoteId = Math.max(nextNoteId, id + 1);
    annotations.push({
      id,
      comment: message.comment || "",
      resolved: false,
      createdAt: new Date().toISOString(),
      reference: message.reference,
    });
    page.viewport = message.reference.viewport;
    saveAndSync();
    render();
    requestAnimationFrame(() => {
      const note = elements.annotations.querySelector(`[data-id=${JSON.stringify(String(id))}]`);
      note?.scrollIntoView({ block: "nearest" });
      note?.querySelector("textarea")?.focus();
    });
  });

  async function startPicker() {
    const noteId = nextNoteId;
    nextNoteId += 1;
    await chrome.storage.local.set({ [NEXT_ID_KEY]: nextNoteId });
    await runPageCommand({ type: "pi-context:start-picker", noteId }, true);
  }

  document.querySelector("#pick").addEventListener("click", startPicker);
  elements.enableDriving.addEventListener("change", async () => {
    if (elements.enableDriving.checked) {
      drivingEnabled = await chrome.permissions.request({ origins: DRIVING_ORIGINS });
      if (!drivingEnabled) setStatus("All-site access denied; driving remains disabled", "disconnected");
    } else {
      drivingEnabled = false;
      await chrome.permissions.remove({ origins: DRIVING_ORIGINS });
    }
    elements.enableDriving.checked = drivingEnabled;
    await chrome.storage.local.set({ [DRIVING_KEY]: drivingEnabled });
    send({ type: "syncAnnotations", annotations, page, drivingEnabled, clientKind });
  });
  document.querySelector("#pairing-form").addEventListener("submit", (event) => {
    event.preventDefault();
    send({ type: "pair", code: elements.pairingCode.value.trim() });
  });
  document.querySelector("#draft-all").addEventListener("click", () => deliver(annotations.filter((item) => !item.resolved).map((item) => item.id), "draft"));
  document.querySelector("#send-all").addEventListener("click", () => deliver(annotations.filter((item) => !item.resolved).map((item) => item.id), "send"));
  document.querySelector("#clear-resolved").addEventListener("click", () => {
    for (const annotation of annotations.filter((item) => item.resolved)) deletedNoteIds.add(annotation.id);
    annotations = annotations.filter((item) => !item.resolved);
    saveAndSync();
    render();
  });

  globalThis.setPiNotesVisible = (visible) => {
    applyTheme();
    panelVisible = Boolean(visible);
    syncPageNotes(panelVisible);
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[DELETED_IDS_KEY]) return;
    const incoming = globalThis.PiBrowserNotes.deletedIdSet(changes[DELETED_IDS_KEY].newValue);
    for (const id of incoming) deletedNoteIds.add(id);
    annotations = annotations.filter((annotation) => !deletedNoteIds.has(annotation.id));
    render();
    syncPageNotes();
  });

  const stored = await chrome.storage.local.get([STORAGE_KEY, NEXT_ID_KEY, DELETED_IDS_KEY, DRIVING_KEY, SECRET_KEY]);
  pairingSecret = stored[SECRET_KEY];
  const hasDrivingAccess = await chrome.permissions.contains({ origins: DRIVING_ORIGINS });
  drivingEnabled = stored[DRIVING_KEY] === true && hasDrivingAccess;
  elements.enableDriving.checked = drivingEnabled;
  if (stored[DRIVING_KEY] === true && !hasDrivingAccess) {
    await chrome.storage.local.set({ [DRIVING_KEY]: false });
  }
  deletedNoteIds = globalThis.PiBrowserNotes.deletedIdSet(stored[DELETED_IDS_KEY]);
  const normalized = globalThis.PiBrowserNotes.normalizeNotes(
    stored[STORAGE_KEY],
    stored[NEXT_ID_KEY],
    [...deletedNoteIds],
  );
  annotations = normalized.notes;
  nextNoteId = normalized.nextId;
  await chrome.storage.local.set({
    [STORAGE_KEY]: annotations,
    [NEXT_ID_KEY]: nextNoteId,
    [DELETED_IDS_KEY]: [...deletedNoteIds],
  });
  render();
  await syncPageNotes();
  connect();
}

applyTheme();
if (isDevTools()) {
  document.querySelector("#workspace").hidden = false;
  await initializePanel();
  addEventListener("focus", () => applyTheme());
} else {
  document.querySelector("#devtools-required").hidden = false;
}
