import childProcess from "node:child_process";

export function needsGoogleReauth(message: { role: string; provider?: string; stopReason?: string; errorMessage?: string }): boolean {
	return message.role === "assistant" && message.provider === "google-vertex" && message.stopReason === "error"
		&& /\binvalid_rapt\b|reauth related error|invalid_grant.{0,120}(expired|revoked)/i.test(message.errorMessage ?? "");
}

export function phoneAuthConfigured(env: NodeJS.ProcessEnv): boolean {
	return !!env.HOME; // The client also resolves its private per-user Google configuration.
}

export async function repairGoogleAdc(env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = childProcess.spawn("token-exchange", [
			"google", "ensure", "--for", "adc", "--purpose", "resume Google Vertex model request",
		], { env, stdio: "ignore", signal });
		child.once("error", () => reject(new Error(signal?.aborted ? "Google sign-in cancelled." : "Could not start Token Exchange Google sign-in.")));
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
