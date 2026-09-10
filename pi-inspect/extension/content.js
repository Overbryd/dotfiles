(() => {
  "use strict";

  if (globalThis.__piBrowserContextLoaded) return;
  const ui = globalThis.PiInspectUI;
  if (!ui) throw new Error("Pi Inspect UI must be installed before the content script.");
  globalThis.__piBrowserContextLoaded = true;

  const OVERLAY_ID = "__pi-browser-context-overlay";
  const NOTE_EDITOR_ID = "__pi-browser-context-note-editor";
  const NOTES_LAYER_ID = "__pi-browser-context-notes";
  let pickerActive = false;
  let pendingNoteId = null;
  let pageNotes = [];
  let pageNotesVisible = false;
  const deletedNoteIds = new Set();
  let notesShadow;
  let overlayShadow;
  let positionFrame;
  let pointer = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
  const noteMarkers = new Map();

  function escapeCss(value) {
    return globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function selectorFor(element) {
    if (element.id) return `#${escapeCss(element.id)}`;

    for (const attribute of ["data-testid", "data-test", "data-phx-component", "aria-label"]) {
      const value = element.getAttribute(attribute);
      if (value) {
        const selector = `[${attribute}=${JSON.stringify(value)}]`;
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
    }

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 7) {
      let part = current.tagName.toLowerCase();
      const stableClasses = [...current.classList]
        .filter((name) => name.length < 50 && !/[\[\]:/]/.test(name))
        .slice(0, 2);
      if (stableClasses.length) part += stableClasses.map((name) => `.${escapeCss(name)}`).join("");

      const parent = current.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (document.querySelectorAll(candidate).length === 1) return candidate;
      current = parent;
    }
    return parts.join(" > ");
  }

  function safeOuterHtml(element) {
    const clone = element.cloneNode(true);
    const sensitive = [clone, ...clone.querySelectorAll("*")];
    for (const node of sensitive) {
      for (const attribute of [...node.attributes]) {
        if (/value|token|secret|password|csrf|authorization|cookie/i.test(attribute.name)) {
          node.setAttribute(attribute.name, "[redacted]");
        }
      }
      if (/token|secret|password|csrf|authorization|cookie/i.test(node.getAttribute("name") || "")) {
        node.setAttribute("content", "[redacted]");
      }
      if (/^(INPUT|TEXTAREA|SELECT)$/i.test(node.tagName)) {
        node.textContent = "";
        node.removeAttribute("value");
      }
    }
    const html = clone.outerHTML;
    return html.length > 3000 ? `${html.slice(0, 3000)}…` : html;
  }

  function labelFor(element) {
    const explicit = element.getAttribute("aria-label") || element.getAttribute("data-testid") || element.id;
    if (explicit) return explicit.slice(0, 160);
    const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    return (text || element.tagName.toLowerCase()).slice(0, 160);
  }

  function inspectElement(element) {
    if (!element) throw new Error("Element not found");
    const rect = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    return {
      url: location.href,
      selector: selectorFor(element),
      label: labelFor(element),
      tag: element.tagName.toLowerCase(),
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      phoenix: globalThis.PiPhoenixSource?.sourceStackForElement(element) || [],
      htmlExcerpt: safeOuterHtml(element),
      styles: {
        display: computed.display,
        position: computed.position,
        width: computed.width,
        height: computed.height,
        margin: computed.margin,
        padding: computed.padding,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        overflow: computed.overflow,
        zIndex: computed.zIndex,
      },
    };
  }

  function overlay() {
    let node = document.getElementById(OVERLAY_ID);
    if (node && overlayShadow?.host === node) return node;
    node?.remove();
    node = document.createElement("div");
    node.id = OVERLAY_ID;
    node.hidden = true;
    overlayShadow = ui.attach(node, "highlight");
    document.documentElement.append(node);
    return node;
  }

  function showHighlight(element, duration) {
    const node = overlay();
    const rect = element.getBoundingClientRect();
    node.hidden = false;
    Object.assign(node.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    if (duration) setTimeout(() => { if (!pickerActive) node.hidden = true; }, duration);
  }

  function updatePickerHighlight() {
    if (!pickerActive || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return;
    const target = document.elementFromPoint(pointer.x, pointer.y);
    if (!(target instanceof Element) || target.id === OVERLAY_ID || target.id === NOTE_EDITOR_ID || target.id === NOTES_LAYER_ID) {
      overlay().hidden = true;
      return;
    }
    showHighlight(target);
  }

  function onPointerMove(event) {
    pointer = { x: event.clientX, y: event.clientY };
    updatePickerHighlight();
  }

  function notesLayer() {
    let host = document.getElementById(NOTES_LAYER_ID);
    if (host && notesShadow?.host === host) return host;
    // A reload or DOM patch can leave a host whose closed shadow root we no longer own.
    host?.remove();
    host = document.createElement("div");
    host.id = NOTES_LAYER_ID;
    notesShadow = ui.attach(host, "notes");
    notesShadow.innerHTML = '<div id="notes"></div>';
    document.documentElement.append(host);
    return host;
  }

  function startPageNoteEdit(note, marker) {
    const { article, detail, text, actions } = marker;
    if (article.classList.contains("editing")) return;
    article.classList.add("editing", "expanded");
    text.hidden = true;
    actions.hidden = true;
    const textarea = document.createElement("textarea");
    textarea.className = "pi-textarea";
    textarea.value = note.comment || "";
    textarea.setAttribute("aria-label", `Edit Note #${note.id}`);
    const footer = document.createElement("footer");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "pi-button";
    cancel.textContent = "Cancel";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "pi-button pi-button--primary";
    save.textContent = "Save";
    footer.append(cancel, save);
    detail.append(textarea, footer);

    const finish = () => {
      textarea.remove();
      footer.remove();
      text.hidden = false;
      actions.hidden = false;
      article.classList.remove("editing");
    };
    cancel.addEventListener("click", finish);
    save.addEventListener("click", () => {
      const comment = textarea.value.trim();
      if (!comment) return;
      note.comment = comment;
      text.textContent = comment;
      chrome.runtime.sendMessage({ type: "pi-context:note-updated", noteId: note.id, comment });
      finish();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish();
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save.click();
    });
    textarea.focus();
    textarea.select();
  }

  function updateExpandedNotes() {
    for (const marker of noteMarkers.values()) {
      const near = Math.hypot(pointer.x - marker.x, pointer.y - marker.y) <= 120;
      const detailRect = marker.detail.getBoundingClientRect();
      const overDetail = marker.article.classList.contains("expanded")
        && pointer.x >= detailRect.left - 40
        && pointer.x <= detailRect.right + 40
        && pointer.y >= detailRect.top - 40
        && pointer.y <= detailRect.bottom + 40;
      const keepOpen = marker.article.classList.contains("editing") || overDetail;
      marker.article.classList.toggle("expanded", !marker.offscreen && (near || keepOpen));
    }
  }

  function positionPageNotes() {
    for (const [id, marker] of noteMarkers) {
      const note = pageNotes.find((item) => item.id === id);
      if (!note) continue;
      let target;
      try { target = document.querySelector(note.reference?.selector); } catch { continue; }
      if (!target) {
        marker.article.hidden = true;
        continue;
      }
      marker.article.hidden = false;
      marker.target = target;
      const rect = target.getBoundingClientRect();
      const anchor = note.reference?.anchor || { xRatio: 1, yRatio: 0 };
      const rawX = rect.left + rect.width * Math.max(0, Math.min(1, anchor.xRatio));
      const rawY = rect.top + rect.height * Math.max(0, Math.min(1, anchor.yRatio));
      marker.offscreen = rawY < 0 || rawY > innerHeight;
      marker.x = Math.max(5, Math.min(rawX, innerWidth - 5));
      marker.y = rawY < 0 ? 5 : rawY > innerHeight ? innerHeight - 5 : Math.max(5, Math.min(rawY, innerHeight - 5));
      marker.article.style.left = `${marker.x - 5}px`;
      marker.article.style.top = `${marker.y - 5}px`;
      marker.article.classList.toggle("offscreen", marker.offscreen);
      marker.article.classList.toggle("align-right", marker.x > innerWidth - 292);
      marker.article.classList.toggle("align-bottom", marker.y > innerHeight - 150);
    }
    updateExpandedNotes();
  }

  function drawPageNotes() {
    const host = notesLayer();
    host.hidden = !pageNotesVisible;
    const container = notesShadow.querySelector("#notes");
    container.replaceChildren();
    noteMarkers.clear();
    if (!pageNotesVisible) return;

    for (const note of pageNotes.filter((item) => !item.resolved)) {
      const article = document.createElement("article");
      const pin = document.createElement("div");
      pin.className = "pin";
      const dot = document.createElement("span");
      dot.className = "dot";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = `#${note.id}`;
      pin.append(dot, badge);
      const detail = document.createElement("div");
      detail.className = "detail";
      const title = document.createElement("strong");
      title.textContent = `Note #${note.id}`;
      const byline = document.createElement("small");
      byline.className = "source";
      const source = note.reference?.phoenix?.at(-1);
      const location = source?.calledFrom || source?.definedAt;
      byline.textContent = location ? `${location.path}:${location.line}` : note.reference?.label || note.reference?.selector;
      const text = document.createElement("p");
      text.textContent = note.comment || "";
      const actions = document.createElement("footer");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "pi-button pi-button--danger";
      deleteButton.textContent = "Delete";
      actions.append(deleteButton);
      detail.append(title, byline, text, actions);
      article.append(pin, detail);
      const marker = { article, detail, text, actions, target: null, x: 0, y: 0, offscreen: false };
      pin.addEventListener("click", () => {
        if (!marker.offscreen || !marker.target) return;
        marker.target.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      });
      text.addEventListener("click", () => startPageNoteEdit(note, marker));
      deleteButton.addEventListener("click", () => {
        deletedNoteIds.add(note.id);
        chrome.runtime.sendMessage({ type: "pi-context:note-deleted", noteId: note.id });
        renderPageNotes(pageNotes.filter((item) => item.id !== note.id), true, [...deletedNoteIds]);
      });
      noteMarkers.set(note.id, marker);
      container.append(article);
    }
    positionPageNotes();
  }

  function scheduleNotePositions() {
    cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
      positionPageNotes();
      updatePickerHighlight();
    });
  }

  function renderPageNotes(notes, visible = true, deletedIds = []) {
    for (const id of deletedIds) {
      if (Number.isInteger(id) && id > 0) deletedNoteIds.add(id);
    }
    pageNotes = (Array.isArray(notes) ? notes : []).filter((note) => !deletedNoteIds.has(note.id));
    pageNotesVisible = visible;
    drawPageNotes();
  }

  document.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    updateExpandedNotes();
  }, true);
  addEventListener("resize", scheduleNotePositions);
  addEventListener("scroll", scheduleNotePositions, true);

  function closeNoteEditor() {
    document.getElementById(NOTE_EDITOR_ID)?.remove();
    overlay().hidden = true;
  }

  function openNoteEditor(reference, point) {
    closeNoteEditor();
    const host = document.createElement("div");
    host.id = NOTE_EDITOR_ID;
    Object.assign(host.style, {
      left: `${Math.max(12, Math.min(point.x + 12, innerWidth - 352))}px`,
      top: `${Math.max(12, Math.min(point.y + 12, innerHeight - 224))}px`,
    });
    const shadow = ui.attach(host, "composer");
    shadow.innerHTML = `
      <form>
        <strong>Note #${pendingNoteId}</strong>
        <small class="target"></small>
        <small class="source"></small>
        <textarea class="pi-textarea" required placeholder="What should change here?" aria-label="What should change here?"></textarea>
        <footer><button class="pi-button" type="button">Cancel</button><button class="pi-button pi-button--primary" type="submit">Save note</button></footer>
      </form>`;
    shadow.querySelector(".target").textContent = reference.label;
    const source = reference.phoenix?.at(-1);
    const sourceLocation = source?.calledFrom || source?.definedAt;
    shadow.querySelector(".source").textContent = sourceLocation
      ? `<${source.name}> ${sourceLocation.path}:${sourceLocation.line}`
      : reference.selector;
    const form = shadow.querySelector("form");
    const textarea = shadow.querySelector("textarea");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const comment = textarea.value.trim();
      if (!comment) return;
      const note = {
        id: pendingNoteId,
        comment,
        resolved: false,
        reference,
      };
      chrome.runtime.sendMessage({
        type: "pi-context:element-selected",
        noteId: note.id,
        comment: note.comment,
        resolved: note.resolved,
        reference: note.reference,
      });
      renderPageNotes([...pageNotes.filter((item) => item.id !== note.id), note], true);
      closeNoteEditor();
    });
    shadow.querySelector("button[type=button]").addEventListener("click", closeNoteEditor);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNoteEditor();
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) form.requestSubmit();
    });
    host.addEventListener("click", (event) => event.stopPropagation());
    host.addEventListener("pointerdown", (event) => event.stopPropagation());
    document.documentElement.append(host);
    textarea.focus();
  }

  function stopPicker() {
    pickerActive = false;
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("click", onPick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    overlay().hidden = true;
  }

  function onPick(event) {
    if (!pickerActive || !(event.target instanceof Element)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const reference = inspectElement(event.target);
    const rect = event.target.getBoundingClientRect();
    reference.anchor = {
      xRatio: rect.width ? (event.clientX - rect.left) / rect.width : 0,
      yRatio: rect.height ? (event.clientY - rect.top) / rect.height : 0,
    };
    const point = { x: event.clientX, y: event.clientY };
    stopPicker();
    showHighlight(event.target);
    openNoteEditor(reference, point);
  }

  function onKeyDown(event) {
    if (event.key === "Escape") stopPicker();
  }

  function startPicker(noteId) {
    stopPicker();
    closeNoteEditor();
    pendingNoteId = noteId;
    pickerActive = true;
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onPick, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function semanticSnapshot() {
    const selectors = "main,section,article,header,footer,nav,h1,h2,h3,button,a,input,textarea,select,[role],[data-testid]";
    return [...document.querySelectorAll(selectors)].slice(0, 250).map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      label: labelFor(element),
      selector: selectorFor(element),
      visible: Boolean(element.getClientRects().length),
    }));
  }

  function targetElement(selector) {
    if (!selector) throw new Error("A target selector is required");
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Element no longer matches ${selector}`);
    if ([OVERLAY_ID, NOTE_EDITOR_ID, NOTES_LAYER_ID].includes(element.id)) {
      throw new Error("Cannot drive Pi Inspect UI");
    }
    return element;
  }

  function actionResult(element) {
    return {
      target: {
        tag: element.tagName.toLowerCase(),
        label: labelFor(element),
        selector: selectorFor(element),
      },
      page: { title: document.title, url: location.href },
    };
  }

  function clickElement(selector) {
    const element = targetElement(selector);
    if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") {
      throw new Error("Target element is disabled");
    }
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    element.click();
    return actionResult(element);
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Target does not expose a native value setter");
    setter.call(element, value);
  }

  function typeIntoElement(selector, text, clear = true) {
    const element = targetElement(selector);
    const inputType = element instanceof HTMLInputElement ? element.type.toLowerCase() : "";
    if (["password", "file"].includes(inputType)) throw new Error(`Refusing to type into ${inputType} input`);
    if (["checkbox", "radio", "button", "submit", "reset", "image", "range", "color"].includes(inputType)) {
      throw new Error(`Use browser_click for input type ${inputType}`);
    }

    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const next = clear ? text : `${element.value}${text}`;
      setNativeValue(element, next);
    } else if (element.isContentEditable) {
      element.textContent = clear ? text : `${element.textContent || ""}${text}`;
    } else {
      throw new Error("Target is not a text input, textarea, or contenteditable element");
    }
    const eventOptions = { bubbles: true, composed: true, data: text, inputType: "insertText" };
    element.dispatchEvent(typeof InputEvent === "function" ? new InputEvent("input", eventOptions) : new Event("input", eventOptions));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return { ...actionResult(element), valueLength: (element.value ?? element.textContent ?? "").length };
  }

  function selectElementValue(selector, value) {
    const element = targetElement(selector);
    if (!(element instanceof HTMLSelectElement)) throw new Error("Target is not a select element");
    if (![...element.options].some((option) => option.value === value)) {
      throw new Error(`Select has no option with value ${JSON.stringify(value)}`);
    }
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return { ...actionResult(element), value };
  }

  function scrollPage(message) {
    if (message.selector) {
      const element = targetElement(message.selector);
      const blocks = new Set(["start", "center", "end", "nearest"]);
      element.scrollIntoView({
        block: blocks.has(message.block) ? message.block : "center",
        inline: "nearest",
        behavior: "auto",
      });
      return actionResult(element);
    }
    scrollBy({ left: Number(message.x) || 0, top: Number(message.y) || 0, behavior: "auto" });
    return { page: { title: document.title, url: location.href, scrollX, scrollY } };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message.type === "pi-context:ping") {
        if (message.theme) ui.setTheme(message.theme);
        sendResponse({ ok: true });
      }
      else if (message.type === "pi-context:start-picker") {
        startPicker(message.noteId);
        sendResponse({ ok: true });
      } else if (message.type === "pi-context:inspect") {
        const element = document.querySelector(message.selector);
        sendResponse({ ok: true, reference: inspectElement(element) });
      } else if (message.type === "pi-context:highlight") {
        const element = document.querySelector(message.selector);
        if (!element) throw new Error(`Element no longer matches ${message.selector}`);
        element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        showHighlight(element, 2500);
        sendResponse({ ok: true });
      } else if (message.type === "pi-context:render-notes") {
        renderPageNotes(message.notes, message.visible !== false, message.deletedNoteIds);
        sendResponse({ ok: true });
      } else if (message.type === "pi-context:click") {
        sendResponse({ ok: true, result: clickElement(message.selector) });
      } else if (message.type === "pi-context:type") {
        sendResponse({ ok: true, result: typeIntoElement(message.selector, String(message.text || ""), message.clear !== false) });
      } else if (message.type === "pi-context:select") {
        sendResponse({ ok: true, result: selectElementValue(message.selector, String(message.value)) });
      } else if (message.type === "pi-context:scroll") {
        sendResponse({ ok: true, result: scrollPage(message) });
      } else if (message.type === "pi-context:snapshot") {
        sendResponse({
          ok: true,
          page: { title: document.title, url: location.href, viewport: { width: innerWidth, height: innerHeight } },
          elements: semanticSnapshot(),
        });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
})();
