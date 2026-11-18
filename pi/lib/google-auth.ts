import childProcess from "node:child_process";

export function needsGoogleReauth(message: { role: string; provider?: string; stopReason?: string; errorMessage?: string }): boolean {
	return message.role === "assistant" && (message.provider === "google-vertex" || message.provider === "google-vertex-anthropic") && message.stopReason === "error"
		&& /\binvalid_rapt\b|reauth related error|invalid_grant.{0,120}(expired|revoked)/i.test(message.errorMessage ?? "");
}

export function googleApiKeyConfigured(options?: { apiKey?: string; env?: NodeJS.ProcessEnv }): boolean {
	return [options?.apiKey, options?.env?.GOOGLE_CLOUD_API_KEY ?? process.env.GOOGLE_CLOUD_API_KEY].some((value) => {
		const key = value?.trim();
		return !!key && key !== "gcp-vertex-credentials" && key !== "vertex-adc" && !/^<[^>]+>$/.test(key);
	});
}

export function phoneAuthConfigured(env: NodeJS.ProcessEnv): boolean {
	return !!env.HOME; // The client also resolves its private per-user Google configuration.
}

export function scopedGoogleEnv(baseEnv: NodeJS.ProcessEnv, providerEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...baseEnv };
	if (providerEnv?.GOOGLE_APPLICATION_CREDENTIALS) {
		delete env.CLOUDSDK_CONFIG;
		delete env.CLOUDSDK_CORE_ACCOUNT;
		delete env.CLOUDSDK_ACTIVE_CONFIG_NAME;
	}
	return { ...env, ...providerEnv };
}

export async function repairGoogleAdc(env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<void> {
	const timeout = AbortSignal.timeout(300_000);
	const authSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	authSignal.throwIfAborted();
	await new Promise<void>((resolve, reject) => {
		const child = childProcess.spawn("token-exchange", [
			"google", "ensure", "--for", "adc", "--purpose", "resume Google Vertex model request",
		], { env, stdio: "ignore", signal: authSignal });
		child.once("error", () => reject(new Error(signal?.aborted ? "Google sign-in cancelled."
			: timeout.aborted ? "Google reauthentication required (invalid_rapt): sign-in timed out after 300s."
				: "Could not start Token Exchange Google sign-in.")));
		child.once("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error("Token Exchange Google sign-in failed or was cancelled; credentials were not repaired."));
		});
	});
}

interface TerminalEvent {
	type: string;
	error?: { role: string; provider?: string; stopReason?: string; errorMessage?: string; content?: unknown[] };
}

/** Retry only setup/auth failures before any provider event has escaped. Never replay emitted output or tools. */
export async function* recoverGoogleStream<T extends TerminalEvent>(
	start: () => AsyncIterable<T>,
	repair: () => Promise<void>,
): AsyncGenerator<T> {
	let repaired = false;
	while (true) {
		let emitted = false;
		let retry = false;
		for await (const event of start()) {
			if (!repaired && !emitted && event.type === "error" && event.error
				&& (event.error.content?.length ?? 0) === 0 && needsGoogleReauth(event.error)) {
				await repair();
				repaired = true;
				retry = true;
				break;
			}
			emitted = true;
			yield event;
		}
		if (!retry) return;
	}
}
