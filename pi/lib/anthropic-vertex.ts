import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { GoogleAuth } from "google-auth-library";
import {
	anthropicMessagesApi,
	createAssistantMessageEventStream,
	type AnthropicOptions,
	type AssistantMessage,
	type SimpleStreamOptions,
	type StreamFunction,
} from "@earendil-works/pi-ai/compat";

export function vertexConnection(env: NodeJS.ProcessEnv) {
	const projectId = env.GOOGLE_CLOUD_PROJECT;
	const region = env.GOOGLE_CLOUD_LOCATION;
	const keyFilename = env.GOOGLE_APPLICATION_CREDENTIALS;
	if (!projectId || !region || !keyFilename) {
		throw new Error("Anthropic on Vertex requires provider-scoped Google project, location, and ADC. Run make pi-settings.");
	}
	return { projectId, region, keyFilename };
}

export const streamAnthropicVertex: StreamFunction<"anthropic-messages", SimpleStreamOptions> = (model, context, options) => {
	const output = createAssistantMessageEventStream();
	void (async () => {
		try {
			options?.signal?.throwIfAborted();
			const { keyFilename, ...connection } = vertexConnection(options?.env ?? {});
			const googleAuth = new GoogleAuth({ keyFilename, scopes: "https://www.googleapis.com/auth/cloud-platform" });
			// Preserve ADC errors before the SDK wraps them as generic connection failures.
			const authClient = await googleAuth.getClient();
			await authClient.getRequestHeaders();
			options?.signal?.throwIfAborted();
			const client = new AnthropicVertex({
				...connection,
				baseURL: model.baseUrl,
				authClient,
				defaultHeaders: { ...model.headers, ...options?.headers },
				fetch: options?.fetch,
				timeout: options?.timeoutMs ?? 120_000,
				maxRetries: 0,
			});
			const reasoning = options?.reasoning;
			const requestOptions: AnthropicOptions = {
				...options,
				client: client as unknown as AnthropicOptions["client"],
				thinkingEnabled: !!reasoning,
				effort: reasoning === "minimal" ? "low" : reasoning,
			};
			for await (const event of anthropicMessagesApi().stream(model, context, requestOptions)) output.push(event);
		} catch (error) {
			const failure: AssistantMessage = {
				role: "assistant", api: model.api, provider: model.provider, model: model.id,
				content: [], stopReason: options?.signal?.aborted ? "aborted" : "error",
				errorMessage: options?.signal?.aborted ? "Google authentication cancelled."
					: error instanceof Error ? error.message : "Google Vertex authentication failed.",
				timestamp: Date.now(),
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			};
			output.push({ type: "error", reason: failure.stopReason as "error" | "aborted", error: failure });
		} finally {
			output.end();
		}
	})();
	return output;
};
