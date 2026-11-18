import { streamSimpleGoogleVertex, type Model } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { phoneAuthConfigured, repairGoogleAdc } from "../lib/google-auth.ts";
import { createGoogleStream } from "../lib/google-stream.ts";
import { streamAnthropicVertex } from "../lib/anthropic-vertex.ts";
import { withVertexPriorityPayGo } from "../lib/vertex-priority-paygo.ts";

type GoogleStream = Parameters<typeof createGoogleStream>[0];

const AUTH_WAIT_STATUS = "google-token-exchange-auth";
const PRIORITY_PAYGO = "vertex-priority-paygo";
const PAYGO_COMMANDS = ["on", "off", "status"];

export default function googleTokenExchange(pi: ExtensionAPI): void {
	if (!phoneAuthConfigured(process.env)) return;

	let activeContext: ExtensionContext | undefined;
	let priorityPayGo = false;
	const setPriorityPayGo = (ctx: ExtensionContext, enabled: boolean) => {
		if (enabled === priorityPayGo) return;
		priorityPayGo = enabled;
		if (ctx.hasUI) ctx.ui.setStatus(PRIORITY_PAYGO, enabled ? "Vertex: Priority PayGo requested" : undefined);
	};
	const restorePriorityPayGo = (_event: unknown, ctx: ExtensionContext) => {
		const entry = ctx.sessionManager.getBranch().findLast((item) =>
			item.type === "custom" && item.customType === PRIORITY_PAYGO && typeof item.data === "boolean");
		setPriorityPayGo(ctx, entry?.type === "custom" && entry.data === true);
	};
	const clearAuthWait = () => {
		if (!activeContext?.hasUI) return;
		activeContext.ui.setWorkingMessage();
		activeContext.ui.setStatus(AUTH_WAIT_STATUS, undefined);
	};
	const showModelWait = (usesApiKey: boolean) => {
		if (!activeContext?.hasUI) return;
		const method = usesApiKey ? "API key" : "ADC";
		activeContext.ui.setWorkingMessage(`Waiting for Vertex response (${method})…`);
		activeContext.ui.setStatus(AUTH_WAIT_STATUS, `Vertex: ${method}`);
	};
	const showAuthWait = () => {
		if (!activeContext?.hasUI) {
			console.error("Google sign-in required (ADC). Waiting for Token Exchange; cancel the request to stop.");
			return;
		}
		activeContext.ui.setWorkingMessage("Waiting for Google sign-in (ADC)…");
		activeContext.ui.setStatus(AUTH_WAIT_STATUS, "Google sign-in required — complete Token Exchange or press Esc to cancel");
		activeContext.ui.notify("Google sign-in required. Waiting for Token Exchange; press Esc to cancel.", "warning");
	};

	pi.on("session_start", (event, ctx) => {
		activeContext = ctx;
		restorePriorityPayGo(event, ctx);
	});
	pi.on("session_tree", restorePriorityPayGo);
	pi.on("agent_start", (_event, ctx) => {
		activeContext = ctx;
	});
	pi.on("agent_end", clearAuthWait);
	pi.on("session_shutdown", () => {
		clearAuthWait();
		if (activeContext) setPriorityPayGo(activeContext, false);
		activeContext = undefined;
	});

	pi.registerCommand("priority-paygo", {
		description: "Request Vertex Priority PayGo for global Gemini 4 (higher rates)",
		getArgumentCompletions: (prefix) => PAYGO_COMMANDS.filter((value) => value.startsWith(prefix))
			.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const mode = args.trim().toLowerCase() || "status";
			if (!PAYGO_COMMANDS.includes(mode)) {
				ctx.ui.notify("Usage: /priority-paygo [on|off|status]", "warning");
				return;
			}
			if (mode !== "status") {
				await ctx.waitForIdle();
				const enabled = mode === "on";
				if (enabled !== priorityPayGo) {
					pi.appendEntry(PRIORITY_PAYGO, enabled);
					setPriorityPayGo(ctx, enabled);
				}
			}
			ctx.ui.notify(priorityPayGo
				? "Priority PayGo on for global Gemini 4 Hydrogen, Argon, and Carbon in this branch. Priority rates apply when served at priority."
				: "Priority PayGo off for this branch.", "info");
		},
	});

	const withGoogleAuth = (start: GoogleStream): GoogleStream => createGoogleStream(start, {
		onModelWait: showModelWait,
		onAuthWait: showAuthWait,
		onWaitEnd: clearAuthWait,
		repair: repairGoogleAdc,
	});

	const streamGemini = withVertexPriorityPayGo(streamSimpleGoogleVertex, () => priorityPayGo);
	pi.registerProvider("google-vertex", {
		api: "google-vertex",
		streamSimple: withGoogleAuth((model, context, options) =>
			streamGemini(model as Model<"google-vertex">, context, options)),
	});
	pi.registerProvider("google-vertex-anthropic", {
		api: "anthropic-messages",
		apiKey: "vertex-adc",
		streamSimple: withGoogleAuth((model, context, options) =>
			streamAnthropicVertex(model as Model<"anthropic-messages">, context, options)),
	});
}
