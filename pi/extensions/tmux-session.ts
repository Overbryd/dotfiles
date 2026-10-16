import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";

/** Make the active Pi session discoverable by the tmux snapshot tool. No transcript data stored in tmux. */
export default function (pi: ExtensionAPI) {
	function mark(ctx: ExtensionContext) {
		const pane = process.env.TMUX_PANE;
		const file = ctx.sessionManager.getSessionFile();
		const id = ctx.sessionManager.getSessionId();
		if (!process.env.TMUX || !pane || !file || !id) return;

		for (const [key, value] of [
			["@tmux-pi-file", file],
			["@tmux-pi-id", id],
			["@tmux-pi-pid", String(process.pid)],
		]) {
			const result = spawnSync("tmux", ["set-option", "-p", "-t", pane, key, value], {
				stdio: "ignore",
				timeout: 2000,
			});
			if (result.status !== 0) return; // A session survives even when tmux isn't available.
		}
	}

	pi.on("session_start", (_event, ctx) => mark(ctx));
	pi.on("session_shutdown", () => {
		const pane = process.env.TMUX_PANE;
		if (!process.env.TMUX || !pane) return;
		for (const key of ["@tmux-pi-pid", "@tmux-pi-file", "@tmux-pi-id"]) {
			spawnSync("tmux", ["set-option", "-p", "-u", "-t", pane, key], { stdio: "ignore", timeout: 2000 });
		}
	});
}
