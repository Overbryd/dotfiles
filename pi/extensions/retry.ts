import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function retryExtension(pi: ExtensionAPI): void {
	pi.registerCommand("retry", {
		description: "Regenerate the latest user turn with the current model",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			await ctx.retryLastTurn();
		},
	});
}
