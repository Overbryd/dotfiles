import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import { randomBytes, randomInt } from "node:crypto";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { WebSocket, WebSocketServer } from "ws";
import { formatAnnotationPrompt } from "./prompt.js";

const HOST = "127.0.0.1";
const PORT = 17373;
const MAX_ANNOTATIONS = 100;
const COMMAND_TIMEOUT_MS = 10_000;

type Annotation = {
  id: number;
  comment?: string;
  resolved?: boolean;
  reference?: {
    selector?: string;
    label?: string;
    [key: string]: unknown;
  };
};

type BrowserClient = {
  authorized: boolean;
  annotations: Annotation[];
  page: Record<string, unknown>;
  drivingEnabled: boolean;
  clientKind: "devtools" | "sidepanel";
};

type PendingCommand = {
  socket: WebSocket;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function send(socket: WebSocket, value: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function safeJson(value: unknown) {
  const json = JSON.stringify(value, null, 2);
  const result = truncateHead(json, { maxLines: 2000, maxBytes: 50 * 1024 });
  return result.truncated ? `${result.content}\n\n[Browser output truncated.]` : result.content;
}

function validOrigin(origin: string | undefined) {
  if (!origin) return false;
  return /^(chrome|vivaldi)-extension:\/\/[a-z0-9]+$/i.test(origin)
    || /^(chrome-)?devtools:\/\/devtools$/i.test(origin);
}

export default function piInspectExtension(pi: ExtensionAPI) {
  let server: WebSocketServer | undefined;
  let sessionContext: ExtensionContext | undefined;
  let startupError: string | undefined;
  let pairing: { code: string; expiresAt: number } | undefined;
  const secret = randomBytes(24).toString("base64url");
  const clients = new Map<WebSocket, BrowserClient>();
  const pending = new Map<string, PendingCommand>();

  function authorizedClients() {
    return [...clients.entries()]
      .filter(([socket, client]) => client.authorized && socket.readyState === WebSocket.OPEN)
      .sort(([, left], [, right]) => Number(right.clientKind === "devtools") - Number(left.clientKind === "devtools"));
  }

  function rejectPendingFor(socket: WebSocket, reason: string) {
    for (const [id, command] of pending) {
      if (command.socket !== socket) continue;
      clearTimeout(command.timer);
      command.reject(new Error(reason));
      pending.delete(id);
    }
  }

  function handleDelivery(client: BrowserClient, message: Record<string, unknown>) {
    if (!sessionContext) throw new Error("Pi session is unavailable");
    const ids = Array.isArray(message.annotationIds)
      ? new Set(message.annotationIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0))
      : new Set<number>();
    const selected = client.annotations.filter((annotation) => ids.has(annotation.id));
    if (selected.length === 0) throw new Error("No annotations selected");

    const prompt = formatAnnotationPrompt(selected, (message.page || client.page) as Record<string, unknown>);
    const mode = String(message.mode || "draft");

    if (mode === "draft") {
      const existing = sessionContext.ui.getEditorText();
      sessionContext.ui.setEditorText(existing ? `${existing}\n\n${prompt}` : prompt);
      sessionContext.ui.notify(`Added ${selected.length} browser comment(s) to editor`, "info");
      return;
    }

    if (mode === "steer") {
      pi.sendUserMessage(prompt, { deliverAs: "steer" });
    } else if (mode === "followUp" || !sessionContext.isIdle()) {
      pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    } else if (mode === "send") {
      pi.sendUserMessage(prompt);
    } else {
      throw new Error(`Unknown delivery mode: ${mode}`);
    }
  }

  function handleMessage(socket: WebSocket, raw: WebSocket.RawData) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      send(socket, { type: "error", message: "Invalid JSON message" });
      return;
    }

    const client = clients.get(socket);
    if (!client) return;

    try {
      if (message.type === "hello") {
        if (message.secret === secret) {
          client.authorized = true;
          client.page = (message.page || {}) as Record<string, unknown>;
          client.drivingEnabled = message.drivingEnabled === true;
          client.clientKind = message.clientKind === "devtools" ? "devtools" : "sidepanel";
          send(socket, { type: "hello", status: "ready" });
        } else {
          send(socket, { type: "hello", status: "pairing-required" });
        }
        return;
      }

      if (message.type === "pair") {
        if (!pairing || pairing.expiresAt < Date.now() || message.code !== pairing.code) {
          send(socket, { type: "error", message: "Invalid or expired pairing code" });
          return;
        }
        client.authorized = true;
        pairing = undefined;
        send(socket, { type: "paired", secret });
        return;
      }

      if (!client.authorized) {
        send(socket, { type: "error", message: "Pair with pi first" });
        return;
      }

      if (message.type === "syncAnnotations") {
        const values = Array.isArray(message.annotations) ? message.annotations.slice(0, MAX_ANNOTATIONS) : [];
        client.annotations = values.filter((value): value is Annotation =>
          Boolean(value && typeof value === "object" && Number.isInteger((value as Annotation).id) && (value as Annotation).id > 0),
        );
        client.page = (message.page || {}) as Record<string, unknown>;
        client.drivingEnabled = message.drivingEnabled === true;
        client.clientKind = message.clientKind === "devtools" ? "devtools" : "sidepanel";
      } else if (message.type === "deliver") {
        handleDelivery(client, message);
      } else if (message.type === "commandResult") {
        const id = String(message.id || "");
        const command = pending.get(id);
        if (!command || command.socket !== socket) return;
        clearTimeout(command.timer);
        pending.delete(id);
        if (message.ok) command.resolve(message.result);
        else command.reject(new Error(String(message.error || "Browser command failed")));
      }
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function startServer(ctx: ExtensionContext) {
    startupError = undefined;
    server = new WebSocketServer({
      host: HOST,
      port: PORT,
      path: "/pi-browser",
      maxPayload: 1024 * 1024,
      verifyClient(info, done) {
        done(validOrigin(info.origin), validOrigin(info.origin) ? 101 : 403, "Extension origin required");
      },
    });

    server.on("connection", (socket) => {
      clients.set(socket, {
        authorized: false,
        annotations: [],
        page: {},
        drivingEnabled: false,
        clientKind: "sidepanel",
      });
      socket.on("message", (raw) => handleMessage(socket, raw));
      socket.on("close", () => {
        clients.delete(socket);
        rejectPendingFor(socket, "Browser DevTools panel disconnected");
      });
      socket.on("error", () => {});
    });

    server.on("listening", () => {
      ctx.ui.setStatus("pi-inspect", `browser:${PORT}`);
      ctx.ui.notify("Pi Inspect ready. Open its DevTools tab and run /browser-pair to connect.", "info");
    });

    server.on("error", (error) => {
      startupError = error.message;
      ctx.ui.setStatus("pi-inspect", "browser:error");
      ctx.ui.notify(`Pi Inspect could not listen on ${HOST}:${PORT}: ${error.message}`, "error");
    });
  }

  function browserCommand(command: string, params: Record<string, unknown>, signal?: AbortSignal) {
    const drivingCommands = new Set(["click", "type", "select", "scroll", "navigate", "reload"]);
    const connections = authorizedClients();
    const connection = drivingCommands.has(command)
      ? connections.find(([, client]) => client.drivingEnabled)
      : connections[0];
    if (!connection && drivingCommands.has(command) && connections.length > 0) {
      throw new Error("Browser driving is disabled. Enable it in the Pi Inspect panel.");
    }
    if (!connection) throw new Error("No paired browser DevTools panel. Open Pi Inspect in DevTools and run /browser-pair.");
    const [socket] = connection;
    const id = randomBytes(12).toString("hex");

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Browser command timed out after ${COMMAND_TIMEOUT_MS}ms`));
      }, COMMAND_TIMEOUT_MS);
      pending.set(id, { socket, resolve, reject, timer });

      if (signal) {
        signal.addEventListener("abort", () => {
          const current = pending.get(id);
          if (!current) return;
          clearTimeout(current.timer);
          pending.delete(id);
          reject(new Error("Browser command cancelled"));
        }, { once: true });
      }

      send(socket, { type: "command", id, command, params });
    });
  }

  pi.on("session_start", (_event, ctx) => {
    sessionContext = ctx;
    startServer(ctx);
  });

  pi.on("session_shutdown", () => {
    sessionContext?.ui.setStatus("pi-inspect", undefined);
    sessionContext = undefined;
    for (const socket of clients.keys()) socket.close(1001, "Pi session closed");
    clients.clear();
    for (const command of pending.values()) {
      clearTimeout(command.timer);
      command.reject(new Error("Pi session closed"));
    }
    pending.clear();
    server?.close();
    server = undefined;
  });

  pi.registerCommand("browser-pair", {
    description: "Generate a short-lived pairing code for Pi Inspect",
    handler: async (_args, ctx) => {
      if (startupError) {
        ctx.ui.notify(`Browser bridge unavailable: ${startupError}`, "error");
        return;
      }
      pairing = {
        code: randomInt(100_000, 1_000_000).toString(),
        expiresAt: Date.now() + 5 * 60_000,
      };
      ctx.ui.notify(`Browser pairing code: ${pairing.code} (valid for 5 minutes)`, "info");
    },
  });

  pi.registerTool({
    name: "browser_status",
    label: "Browser Status",
    description: "Show whether a Pi Inspect DevTools panel is paired and which page it reports.",
    parameters: Type.Object({}),
    async execute() {
      const connections = authorizedClients();
      const status = {
        listening: Boolean(server && !startupError),
        address: `${HOST}:${PORT}`,
        pairedClients: connections.length,
        pages: connections.map(([, client]) => ({
          ...client.page,
          drivingEnabled: client.drivingEnabled,
          clientKind: client.clientKind,
        })),
        annotations: connections.reduce((count, [, client]) => count + client.annotations.length, 0),
        error: startupError,
      };
      return { content: [{ type: "text", text: safeJson(status) }], details: status };
    },
  });

  pi.registerTool({
    name: "browser_list_annotations",
    label: "Browser Annotations",
    description: "List source-aware comments collected in the paired browser DevTools panel.",
    parameters: Type.Object({
      includeResolved: Type.Optional(Type.Boolean({ description: "Include resolved comments" })),
    }),
    async execute(_id, params) {
      const connection = authorizedClients()[0];
      if (!connection) throw new Error("No paired browser DevTools panel");
      const [, client] = connection;
      const annotations = params.includeResolved
        ? client.annotations
        : client.annotations.filter((annotation) => !annotation.resolved);
      const result = { page: client.page, annotations };
      return { content: [{ type: "text", text: safeJson(result) }], details: { count: annotations.length } };
    },
  });

  pi.registerTool({
    name: "browser_inspect",
    label: "Inspect Browser Element",
    description: "Fetch fresh DOM excerpt, computed styles, bounds, and Phoenix source stack for an annotation or selector. Browser output is limited to 50KB.",
    parameters: Type.Object({
      annotationId: Type.Optional(Type.Integer({ minimum: 1, description: "Numerical browser note ID" })),
      selector: Type.Optional(Type.String({ description: "CSS selector when no annotation ID is available" })),
    }),
    async execute(_id, params, signal) {
      if (!params.annotationId && !params.selector) throw new Error("Provide annotationId or selector");
      const result = await browserCommand("inspect", params, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_highlight",
    label: "Highlight Browser Element",
    description: "Scroll to and briefly highlight an annotated browser element so the human can verify the reference.",
    parameters: Type.Object({
      annotationId: Type.Optional(Type.Integer({ minimum: 1 })),
      selector: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal) {
      if (!params.annotationId && !params.selector) throw new Error("Provide annotationId or selector");
      await browserCommand("highlight", params, signal);
      return { content: [{ type: "text", text: "Highlighted element in the paired browser." }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_click",
    label: "Click Browser Element",
    description: "Click an element in the paired browser using a numerical note ID or CSS selector. Requires Enable browser driving in Pi Inspect.",
    parameters: Type.Object({
      annotationId: Type.Optional(Type.Integer({ minimum: 1, description: "Numerical browser note ID" })),
      selector: Type.Optional(Type.String({ description: "CSS selector when no note ID is available" })),
    }),
    async execute(_id, params, signal) {
      if (!params.annotationId && !params.selector) throw new Error("Provide annotationId or selector");
      const result = await browserCommand("click", params, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_type",
    label: "Type in Browser",
    description: "Set or append text in an input, textarea, or contenteditable element. Password and file inputs are refused. Requires Enable browser driving in Pi Inspect.",
    parameters: Type.Object({
      annotationId: Type.Optional(Type.Integer({ minimum: 1 })),
      selector: Type.Optional(Type.String()),
      text: Type.String({ description: "Text to enter" }),
      clear: Type.Optional(Type.Boolean({ description: "Replace existing text; defaults to true" })),
    }),
    async execute(_id, params, signal) {
      if (!params.annotationId && !params.selector) throw new Error("Provide annotationId or selector");
      const result = await browserCommand("type", params, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_select",
    label: "Select Browser Option",
    description: "Choose an option in a select element by its value. Requires Enable browser driving in Pi Inspect.",
    parameters: Type.Object({
      annotationId: Type.Optional(Type.Integer({ minimum: 1 })),
      selector: Type.Optional(Type.String()),
      value: Type.String({ description: "Option value" }),
    }),
    async execute(_id, params, signal) {
      if (!params.annotationId && !params.selector) throw new Error("Provide annotationId or selector");
      const result = await browserCommand("select", params, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_scroll",
    label: "Scroll Browser",
    description: "Scroll to a noted/selected element or move the page by x/y pixels. Requires Enable browser driving in Pi Inspect.",
    parameters: Type.Object({
      annotationId: Type.Optional(Type.Integer({ minimum: 1 })),
      selector: Type.Optional(Type.String()),
      x: Type.Optional(Type.Number({ description: "Horizontal pixel delta when no target is supplied" })),
      y: Type.Optional(Type.Number({ description: "Vertical pixel delta when no target is supplied" })),
      block: Type.Optional(StringEnum(["start", "center", "end", "nearest"] as const)),
    }),
    async execute(_id, params, signal) {
      const result = await browserCommand("scroll", params, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_navigate",
    label: "Navigate Browser",
    description: "Navigate the paired inspected tab to an HTTP(S) URL whose origin has extension access. Requires Enable browser driving in Pi Inspect.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute HTTP(S) URL" }),
    }),
    async execute(_id, params, signal) {
      const result = await browserCommand("navigate", params, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_reload",
    label: "Reload Browser",
    description: "Reload the paired inspected tab. Requires Enable browser driving in Pi Inspect.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      const result = await browserCommand("reload", {}, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });

  pi.registerTool({
    name: "browser_snapshot",
    label: "Browser Snapshot",
    description: "Return a compact semantic snapshot of visible page regions and controls from the paired active tab. Output is limited to 50KB.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      const result = await browserCommand("snapshot", {}, signal);
      return { content: [{ type: "text", text: safeJson(result) }], details: {} };
    },
  });
}
