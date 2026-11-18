import {
	createAssistantMessageEventStream,
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type SimpleStreamOptions,
	type StreamFunction,
} from "@earendil-works/pi-ai/compat";
import { googleApiKeyConfigured, recoverGoogleStream, scopedGoogleEnv } from "./google-auth.ts";

type GoogleStream = StreamFunction<Api, SimpleStreamOptions>;

interface GoogleStreamHooks {
	onModelWait(usesApiKey: boolean): void;
	onAuthWait(): void;
	onWaitEnd(): void;
	repair(env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void>;
}

export function createGoogleStream(start: GoogleStream, hooks: GoogleStreamHooks): GoogleStream {
	return (model, context, options) => {
		const output = createAssistantMessageEventStream();
		const controller = new AbortController();
		const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
		const timeoutMs = options?.timeoutMs ?? 120_000;
		const usesApiKey = model.provider === "google-vertex" && googleApiKeyConfigured(options);
		let timer: ReturnType<typeof setTimeout> | undefined;
		let partial: AssistantMessage | undefined;
		let repairAttempted = false;
		let waiting = true;
		let rejectAbort!: () => void;
		const cancelled = new Promise<never>((_resolve, reject) => {
			rejectAbort = () => reject(signal.reason);
		});
		signal.addEventListener("abort", rejectAbort, { once: true });
		const armDeadline = (milliseconds: number, message: string) => {
			clearTimeout(timer);
			timer = setTimeout(() => controller.abort(new Error(message)), milliseconds);
		};
		const modelDeadline = () => armDeadline(timeoutMs, `Google Vertex timed out after ${Math.ceil(timeoutMs / 1000)}s without progress. Retry or select another model.`);
		let iterator: AsyncIterator<AssistantMessageEvent> | undefined;
		void (async () => {
			try {
				signal.throwIfAborted();
				hooks.onModelWait(usesApiKey);
				modelDeadline();
				const begin = () => {
					signal.throwIfAborted();
					return start(model, context, { ...options, signal, timeoutMs });
				};
				const events = usesApiKey ? begin() : recoverGoogleStream(begin, async () => {
					repairAttempted = true;
					hooks.onAuthWait();
					armDeadline(300_000, "Google reauthentication required (invalid_rapt): sign-in timed out after 300s. Use /retry to try again.");
					await hooks.repair(scopedGoogleEnv(process.env, options?.env), signal);
					signal.throwIfAborted();
					hooks.onModelWait(false);
					waiting = true;
					modelDeadline();
				});
				iterator = events[Symbol.asyncIterator]();
				while (true) {
					const next = await Promise.race([iterator.next(), cancelled]);
					if (next.done) throw new Error("Google stream ended without a terminal event");
					const event = next.value;
					if ("partial" in event) partial = event.partial;
					output.push(event);
					if (event.type === "done" || event.type === "error") break;
					modelDeadline();
					if (event.type !== "start" && waiting) {
						hooks.onWaitEnd();
						waiting = false;
					}
				}
			} catch {
				const aborted = options?.signal?.aborted === true;
				const failure: AssistantMessage = {
					...(partial ? structuredClone(partial) : {
						role: "assistant" as const, api: model.api, provider: model.provider, model: model.id,
						content: [], timestamp: Date.now(),
						usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					}),
					stopReason: aborted ? "aborted" : "error",
					errorMessage: aborted ? "Google request cancelled."
						: controller.signal.aborted && controller.signal.reason instanceof Error ? controller.signal.reason.message
							: repairAttempted ? "Google reauthentication required (invalid_rapt): phone repair failed. Use /retry to try again."
								: "Google Vertex request failed before completion.",
				};
				output.push({ type: "error", reason: failure.stopReason as "error" | "aborted", error: failure });
			} finally {
				clearTimeout(timer);
				signal.removeEventListener("abort", rejectAbort);
				void iterator?.return?.().catch(() => {});
				hooks.onWaitEnd();
				output.end();
			}
		})();
		return output;
	};
}
