import { streamSimpleGoogleVertex, type Model } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { phoneAuthConfigured, repairGoogleAdc } from "../lib/google-auth.ts";
import { createGoogleStream } from "../lib/google-stream.ts";
import { streamAnthropicVertex } from "../lib/anthropic-vertex.ts";

type GoogleStream = Parameters<typeof createGoogleStream>[0];

const AUTH_WAIT_STATUS = "google-token-exchange-auth";

export default function googleTokenExchange(pi: ExtensionAPI): void {
	if (!phoneAuthConfigured(process.env)) return;

	let activeContext: ExtensionContext | undefined;
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

	pi.on("session_start", (_event, ctx) => {
		activeContext = ctx;
	});
	pi.on("agent_start", (_event, ctx) => {
		activeContext = ctx;
	});
	pi.on("agent_end", clearAuthWait);
	pi.on("session_shutdown", () => {
		clearAuthWait();
		activeContext = undefined;
	});

	const withGoogleAuth = (start: GoogleStream): GoogleStream => createGoogleStream(start, {
		onModelWait: showModelWait,
		onAuthWait: showAuthWait,
		onWaitEnd: clearAuthWait,
		repair: repairGoogleAdc,
	});

	pi.registerProvider("google-vertex", {
		api: "google-vertex",
		streamSimple: withGoogleAuth((model, context, options) =>
			streamSimpleGoogleVertex(model as Model<"google-vertex">, context, options)),
	});
	pi.registerProvider("google-vertex-anthropic", {
		api: "anthropic-messages",
		apiKey: "vertex-adc",
		streamSimple: withGoogleAuth((model, context, options) =>
			streamAnthropicVertex(model as Model<"anthropic-messages">, context, options)),
	});
}
