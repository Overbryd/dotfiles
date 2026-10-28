import {
	createAssistantMessageEventStream,
	streamSimpleGoogleVertex,
	type AssistantMessage,
	type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { phoneAuthConfigured, recoverGoogleStream, repairGoogleAdc } from "../lib/google-auth.ts";

export default function googleTokenExchange(pi: ExtensionAPI): void {
	if (!phoneAuthConfigured(process.env)) return;
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
							const env = { ...process.env, ...options?.env };
							await repairGoogleAdc(env, options?.signal);
						},
					)) output.push(event);
					output.end();
				} catch {
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
