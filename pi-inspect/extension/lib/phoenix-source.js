(() => {
  "use strict";

  function location(path, line, application) {
    return { path, line: Number(line), application };
  }

  function parsePhoenixComment(raw) {
    const text = String(raw || "").trim();

    const closing = text.match(/^<\/([^>]+)>$/);
    if (closing) return { type: "close", name: closing[1] };

    const opening = text.match(/^<([^>]+)>\s+(.+):(\d+)\s+\(([^)]+)\)$/);
    if (opening) {
      return {
        type: "open",
        name: opening[1],
        definedAt: location(opening[2], opening[3], opening[4]),
      };
    }

    const caller = text.match(/^@caller\s+(.+):(\d+)\s+\(([^)]+)\)$/);
    if (caller) {
      return {
        type: "caller",
        calledFrom: location(caller[1], caller[2], caller[3]),
      };
    }

    return null;
  }

  function applyPhoenixComment(state, raw) {
    const record = parsePhoenixComment(raw);
    if (!record) return state;

    if (record.type === "caller") {
      state.pendingCaller = record.calledFrom;
      return state;
    }

    if (record.type === "open") {
      state.stack.push({
        name: record.name,
        definedAt: record.definedAt,
        calledFrom: state.pendingCaller || null,
      });
      state.pendingCaller = null;
      return state;
    }

    for (let index = state.stack.length - 1; index >= 0; index -= 1) {
      if (state.stack[index].name === record.name) {
        state.stack.splice(index);
        break;
      }
    }
    state.pendingCaller = null;
    return state;
  }

  function sourceStackForElement(element, rootDocument = document) {
    const state = { stack: [], pendingCaller: null };
    const whatToShow = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT;
    const walker = rootDocument.createTreeWalker(rootDocument, whatToShow);
    let node;

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.COMMENT_NODE) {
        applyPhoenixComment(state, node.data);
        continue;
      }

      if (node === element) return state.stack.map((frame) => ({ ...frame }));
      if (state.pendingCaller) state.pendingCaller = null;
    }

    return [];
  }

  globalThis.PiPhoenixSource = {
    applyPhoenixComment,
    parsePhoenixComment,
    sourceStackForElement,
  };
})();
