import {
	createAssistantMessageEventStream,
	streamSimpleGoogleVertex,
	type AssistantMessage,
	type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { phoneAuthConfigured, recoverGoogleStream, repairGoogleAdc, scopedGoogleEnv } from "../lib/google-auth.ts";

const AUTH_WAIT_STATUS = "google-token-exchange-auth";

export default function googleTokenExchange(pi: ExtensionAPI): void {
	if (!phoneAuthConfigured(process.env)) return;

	let activeContext: ExtensionContext | undefined;
	const clearAuthWait = () => {
		if (!activeContext?.hasUI) return;
		activeContext.ui.setWorkingMessage();
		activeContext.ui.setStatus(AUTH_WAIT_STATUS, undefined);
	};
	const showAuthWait = () => {
		if (!activeContext?.hasUI) return;
		activeContext.ui.setWorkingMessage("Waiting for Google sign-in…");
		activeContext.ui.setStatus(AUTH_WAIT_STATUS, "Google sign-in required — complete Token Exchange or press Esc to cancel");
		activeContext.ui.notify("Google sign-in required. Waiting for Token Exchange; press Esc to cancel.", "warning");
	};

	pi.on("agent_start", (_event, ctx) => {
		activeContext = ctx;
	});
	pi.on("agent_end", () => {
		clearAuthWait();
		activeContext = undefined;
	});

	pi.registerProvider("google-vertex", {
		api: "google-vertex",
		streamSimple(model, context, options) {
			const output = createAssistantMessageEventStream();
			let repairAttempted = false;
			void (async () => {
				try {
					for await (const event of recoverGoogleStream(
						() => streamSimpleGoogleVertex(model as Model<"google-vertex">, context, options),
						async () => {
							repairAttempted = true;
							showAuthWait();
							const env = scopedGoogleEnv(process.env, options?.env);
							await repairGoogleAdc(env, options?.signal);
							clearAuthWait();
						},
					)) output.push(event);
					output.end();
					clearAuthWait();
				} catch {
					clearAuthWait();
					const failure: AssistantMessage = {
						role: "assistant", api: model.api, provider: model.provider, model: model.id,
						content: [], stopReason: options?.signal?.aborted ? "aborted" : "error",
						errorMessage: options?.signal?.aborted
							? "Google authentication cancelled."
							: repairAttempted
								? "Google reauthentication required (invalid_rapt): phone repair failed. Use /retry to try again."
								: "Google Vertex request failed before completion.",
						timestamp: Date.now(),
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					};
					output.push({ type: "error", reason: failure.stopReason as "error" | "aborted", error: failure });
					output.end();
				}
			})();
			return output;
		},
	});
}
