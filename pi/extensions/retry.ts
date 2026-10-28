import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { needsGoogleReauth, repairGoogleAdc } from "../lib/google-auth.ts";

async function reauthenticateVertex(ctx: ExtensionCommandContext): Promise<void> {
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
	if (!auth.ok) throw new Error(auth.error);
	ctx.ui.setStatus?.("google-auth", "Google credentials: checking / waiting for phone…");
	try {
		await repairGoogleAdc({ ...process.env, ...auth.env }, ctx.signal);
	} finally {
		ctx.ui.setStatus?.("google-auth", undefined);
	}
}

export default function retryExtension(pi: ExtensionAPI): void {
	pi.on("message_end", (event, ctx) => {
		if (needsGoogleReauth(event.message) && ctx.hasUI) {
			ctx.ui.notify("Google sign-in needs repair. /retry checks credentials and resumes through Token Exchange.", "warning");
		}
	});
	pi.registerCommand("retry", {
		description: "Retry the latest failed response; cooperatively ensure Google credentials when needed",
		handler: async (args, ctx) => {
			if (args.trim() && args.trim() !== "--skip-auth") throw new Error("Usage: /retry [--skip-auth]");
			await ctx.waitForIdle();
			const latest = [...ctx.sessionManager.getBranch()].reverse().find(
				(entry) => entry.type === "message" && entry.message.role === "assistant",
			);
			if (latest?.type === "message" && needsGoogleReauth(latest.message) && args.trim() !== "--skip-auth"
				&& ctx.model?.provider === "google-vertex") await reauthenticateVertex(ctx);
			await ctx.retryLastTurn();
		},
	});
}
