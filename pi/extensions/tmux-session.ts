import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";

const SEPARATOR = "\u001f";
const POLL_INTERVAL_MS = 750;

export type TmuxWindowState = {
	windowId: string;
	name: string;
	automaticRename: boolean;
	piPaneCount: number;
};

export type TmuxSessionClient = {
	mark(file: string, id: string, pid: number): boolean;
	clear(): void;
	windowState(): TmuxWindowState | undefined;
	renameWindow(windowId: string, name: string): boolean;
};

type SyncOptions = {
	client?: TmuxSessionClient;
	schedule?: (callback: () => void) => () => void;
};

function createTmuxClient(env: NodeJS.ProcessEnv = process.env): TmuxSessionClient {
	const pane = env.TMUX && env.TMUX_PANE ? env.TMUX_PANE : undefined;
	const run = (args: string[]) =>
		spawnSync("tmux", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 });

	return {
		mark(file, id, pid) {
			if (!pane) return false;
			for (const [key, value] of [
				["@tmux-pi-file", file],
				["@tmux-pi-id", id],
				["@tmux-pi-pid", String(pid)],
			]) {
				if (run(["set-option", "-p", "-t", pane, key, value]).status !== 0) return false;
			}
			return true;
		},
		clear() {
			if (!pane) return;
			for (const key of ["@tmux-pi-pid", "@tmux-pi-file", "@tmux-pi-id"]) {
				run(["set-option", "-p", "-u", "-t", pane, key]);
			}
		},
		windowState() {
			if (!pane) return undefined;
			const panes = run([
				"list-panes",
				"-t",
				pane,
				"-F",
				[
					"#{window_id}",
					"#{window_name}",
					"#{automatic-rename}",
					"#{pane_current_command}",
					"#{@tmux-pi-pid}",
				].join(SEPARATOR),
			]);
			if (panes.status !== 0) return undefined;
			const rows = panes.stdout.trimEnd().split("\n").map((line) => line.split(SEPARATOR));
			const [windowId, name, automaticRename] = rows[0] ?? [];
			if (!windowId || name === undefined || !["0", "1"].includes(automaticRename ?? "")) return undefined;
			const piPaneCount = rows.filter(([, , , command, pid]) =>
				["node", "pi"].includes(command ?? "") && /^\d+$/.test(pid ?? ""),
			).length;
			return { windowId, name, automaticRename: automaticRename === "1", piPaneCount };
		},
		renameWindow(windowId, name) {
			return run(["rename-window", "-t", windowId, name]).status === 0;
		},
	};
}

function defaultSchedule(callback: () => void): () => void {
	const timer = setInterval(callback, POLL_INTERVAL_MS);
	timer.unref();
	return () => clearInterval(timer);
}

/** Keep one Pi session name and its tmux window name aligned; also expose Pi to tmux-pi snapshots. */
export function registerTmuxSessionSync(pi: ExtensionAPI, options: SyncOptions = {}) {
	const client = options.client ?? createTmuxClient();
	const schedule = options.schedule ?? defaultSchedule;
	let stopPolling: (() => void) | undefined;
	let previousWindow: TmuxWindowState | undefined;
	let pendingInitialAlignment = false;

	function stop() {
		stopPolling?.();
		stopPolling = undefined;
	}

	function renameWindowFromPi(name: string | undefined) {
		if (!name) return;
		const state = client.windowState();
		if (!state || state.piPaneCount !== 1) return;
		if (state.name === name) {
			previousWindow = state;
			return;
		}
		if (client.renameWindow(state.windowId, name)) {
			previousWindow = { ...state, name, automaticRename: false };
		}
	}

	function observeWindow() {
		const state = client.windowState();
		if (!state) return;
		if (!previousWindow) {
			previousWindow = state;
			return;
		}
		const changed = state.windowId !== previousWindow.windowId || state.name !== previousWindow.name;
		previousWindow = state;
		if (changed) {
			if (state.automaticRename) return;
			pendingInitialAlignment = false;
			if (state.piPaneCount === 1 && state.name && state.name !== pi.getSessionName()) {
				pi.setSessionName(state.name);
			}
			return;
		}
		if (pendingInitialAlignment) {
			pendingInitialAlignment = false;
			renameWindowFromPi(pi.getSessionName());
		}
	}

	pi.on("session_start", (_event, ctx) => {
		stop();
		const file = ctx.sessionManager.getSessionFile();
		const id = ctx.sessionManager.getSessionId();
		if (!file || !id || !client.mark(file, id, process.pid)) return;
		previousWindow = client.windowState();
		pendingInitialAlignment = true;
		stopPolling = schedule(observeWindow);
	});

	pi.on("session_info_changed", (event) => renameWindowFromPi(event.name));
	pi.on("session_shutdown", () => {
		stop();
		client.clear();
		previousWindow = undefined;
		pendingInitialAlignment = false;
	});
}

export default function (pi: ExtensionAPI) {
	registerTmuxSessionSync(pi);
}
