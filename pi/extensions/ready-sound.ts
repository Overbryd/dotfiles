import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { homedir } from "node:os";

function expandHome(path: string): string {
	return path.startsWith("~/") ? `${homedir()}/${path.slice(2)}` : path;
}

function playSound(path: string): void {
	const child = spawn("afplay", [path], {
		detached: true,
		stdio: "ignore",
	});

	child.on("error", () => {});
	child.unref();
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async () => {
		if (process.platform !== "darwin") return;
		if (!process.stdout.isTTY) return;

		playSound(expandHome(process.env.PI_DONE_SOUND || "/System/Library/Sounds/Glass.aiff"));
	});
}
