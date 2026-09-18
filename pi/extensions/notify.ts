import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

const CUSTOM_TYPE = "notify";
const FALLBACK_SUMMARY = "Pi finished and is waiting for input.";
const MAX_SUMMARY_CHARS = 240;
const TOUCH_GRASS_AVAILABLE_CHANNEL = "touch-grass:available";
const TOUCH_GRASS_REQUEST_CHANNEL = "touch-grass:request";

export type NotifyChannel = "local" | "push";
export type NotifyMode = "auto" | "local" | "push" | "both";

type NotifyRuntime = {
	env: NodeJS.ProcessEnv;
	platform: NodeJS.Platform;
	stdoutIsTTY: boolean;
	getTmuxState: () => { attached?: boolean; target?: string };
	notifyLocal: (title: string, summary: string) => void;
	notifyPush: (title: string, summary: string) => void;
};

type TouchGrassController = {
	getPausedStatus(now?: number): string | undefined;
	onChange(handler: () => void): () => void;
};

export type NotificationOutcome = {
	error: boolean;
	summary: string;
};

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object") return "";
			const value = item as { type?: unknown; text?: unknown };
			return value.type === "text" && typeof value.text === "string" ? value.text : "";
		})
		.filter(Boolean)
		.join(" ");
}

function shorten(text: string, maxLength = MAX_SUMMARY_CHARS): string {
	if (text.length <= maxLength) return text;
	const prefix = text.slice(0, maxLength - 1);
	const lastSpace = prefix.lastIndexOf(" ");
	const end = lastSpace > maxLength * 0.65 ? lastSpace : prefix.length;
	return `${prefix.slice(0, end).trimEnd()}…`;
}

export function notificationOutcome(entries: readonly unknown[]): NotificationOutcome {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (!entry || typeof entry !== "object") continue;
		const message = (entry as { type?: unknown; message?: unknown }).message;
		if (!message || typeof message !== "object" || (message as { role?: unknown }).role !== "assistant") continue;

		const assistant = message as { content?: unknown; errorMessage?: unknown; stopReason?: unknown };
		const errorMessage = typeof assistant.errorMessage === "string"
			? assistant.errorMessage.replace(/\s+/g, " ").trim()
			: "";
		if (assistant.stopReason === "error" || errorMessage) {
			return { error: true, summary: shorten(errorMessage || "Pi turn ended with an error.") };
		}

		const text = textFromContent(assistant.content)
			.replace(/```(?:\w+)?/g, " ")
			.replace(/\[([^\]]+)]\([^\s)]+\)/g, "$1")
			.replace(/[*_~`>#]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		return { error: false, summary: text ? shorten(text) : FALLBACK_SUMMARY };
	}
	return { error: false, summary: FALLBACK_SUMMARY };
}

export function summarizeNotification(entries: readonly unknown[]): string {
	return notificationOutcome(entries).summary;
}

export function notifyMode(env: NodeJS.ProcessEnv): NotifyMode {
	const value = env.PI_NOTIFY_MODE?.trim().toLowerCase();
	return value === "local" || value === "push" || value === "both" ? value : "auto";
}

export function notificationChannels(
	env: NodeJS.ProcessEnv,
	platform: NodeJS.Platform,
	tmuxAttached: boolean | undefined,
): NotifyChannel[] {
	const mode = notifyMode(env);
	if (mode === "both") return ["local", "push"];
	if (mode === "local" || mode === "push") return [mode];

	const remote = !!(env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY);
	const detached = !!env.TMUX && tmuxAttached === false;
	return platform === "darwin" && !remote && !detached ? ["local"] : ["push"];
}

function restoreEnabled(entries: readonly unknown[]): boolean {
	for (let index = entries.length - 1; index >= 0; index--) {
		const entry = entries[index];
		if (!entry || typeof entry !== "object") continue;
		const value = entry as { type?: unknown; customType?: unknown; data?: unknown };
		if (value.type !== "custom" || value.customType !== CUSTOM_TYPE || !value.data || typeof value.data !== "object") continue;
		const enabled = (value.data as { enabled?: unknown }).enabled;
		if (typeof enabled === "boolean") return enabled;
	}
	return true;
}

function expandHome(path: string): string {
	return path.startsWith("~/") ? `${homedir()}/${path.slice(2)}` : path;
}

function defaultTmuxState(): { attached?: boolean; target?: string } {
	if (!process.env.TMUX) return {};
	const result = spawnSync(
		"tmux",
		["display-message", "-p", "#{session_attached}\t#{session_name}:#{window_index}.#{pane_index} #{window_name}"],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
	);
	if (result.status !== 0) return {};
	const [attached, target] = result.stdout.trim().split("\t", 2);
	const clientCount = Number.parseInt(attached, 10);
	return {
		attached: Number.isFinite(clientCount) ? clientCount > 0 : undefined,
		target: target || undefined,
	};
}

function notificationTitle(target?: string, status = "Pi needs you"): string {
	return [status, hostname().split(".")[0], target].filter(Boolean).join(" · ");
}

function defaultLocalNotification(title: string, summary: string, env: NodeJS.ProcessEnv): void {
	const script = [
		"on run argv",
		"display notification (item 1 of argv) with title (item 2 of argv)",
		"end run",
	].join("\n");
	const notification = spawn("osascript", ["-e", script, "--", summary, title], {
		detached: true,
		stdio: "ignore",
	});
	notification.on("error", () => {});
	notification.unref();

	const sound = spawn("afplay", [expandHome(env.PI_DONE_SOUND || "/System/Library/Sounds/Glass.aiff")], {
		detached: true,
		stdio: "ignore",
	});
	sound.on("error", () => {});
	sound.unref();
}

function notifyScript(env: NodeJS.ProcessEnv): string {
	return env.PI_NOTIFY_COMMAND || join(env.HOME || homedir(), ".bin", "notify");
}

function defaultPushNotification(title: string, summary: string, env: NodeJS.ProcessEnv): void {
	const child = spawn(notifyScript(env), [title, summary], {
		detached: true,
		stdio: "ignore",
	});
	child.on("error", () => {});
	child.unref();
}

function configPath(env: NodeJS.ProcessEnv): string {
	const home = env.HOME || homedir();
	return join(env.XDG_CONFIG_HOME || join(home, ".config"), "notify", "config");
}

export function isPushConfigured(env: NodeJS.ProcessEnv): boolean {
	return !!env.NOTIFY_URL || existsSync(configPath(env));
}

function isTouchGrassController(value: unknown): value is TouchGrassController {
	if (!value || typeof value !== "object") return false;
	const controller = value as Partial<TouchGrassController>;
	return typeof controller.getPausedStatus === "function" && typeof controller.onChange === "function";
}

function report(
	ctx: { hasUI: boolean; ui: { notify(message: string, type?: "info" | "warning" | "error"): void } },
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	if (ctx.hasUI) ctx.ui.notify(message, type);
	else console.log(message);
}

export function registerNotify(pi: ExtensionAPI, overrides: Partial<NotifyRuntime> = {}): void {
	const env = overrides.env ?? process.env;
	const runtime: NotifyRuntime = {
		env,
		platform: process.platform,
		stdoutIsTTY: !!process.stdout.isTTY,
		getTmuxState: defaultTmuxState,
		notifyLocal: (title, summary) => defaultLocalNotification(title, summary, env),
		notifyPush: (title, summary) => defaultPushNotification(title, summary, env),
		...overrides,
	};
	let enabled = true;
	let lastContext: ExtensionContext | undefined;
	let lastNotifiedLeaf: string | undefined;
	let touchGrass: TouchGrassController | undefined;
	let touchGrassPaused = false;
	let unsubscribeTouchGrassChange: (() => void) | undefined;

	const deliver = (ctx: ExtensionContext, status: string, summary: string) => {
		if (!enabled || ctx.mode !== "tui") return;
		const tmux = runtime.getTmuxState();
		const title = notificationTitle(tmux.target, status);
		for (const channel of notificationChannels(runtime.env, runtime.platform, tmux.attached)) {
			if (channel === "local" && runtime.platform === "darwin" && runtime.stdoutIsTTY) {
				runtime.notifyLocal(title, summary);
			} else if (channel === "push" && isPushConfigured(runtime.env)) {
				runtime.notifyPush(title, summary);
			}
		}
	};

	const attachTouchGrass = (value: unknown) => {
		if (!isTouchGrassController(value) || value === touchGrass) return;
		unsubscribeTouchGrassChange?.();
		touchGrass = value;
		touchGrassPaused = !!touchGrass.getPausedStatus();
		unsubscribeTouchGrassChange = touchGrass.onChange(() => {
			const pausedStatus = touchGrass?.getPausedStatus();
			const justPaused = !!pausedStatus && !touchGrassPaused;
			touchGrassPaused = !!pausedStatus;
			if (justPaused && lastContext) deliver(lastContext, "Pi paused", pausedStatus);
		});
	};
	const unsubscribeTouchGrassAvailable = pi.events.on(TOUCH_GRASS_AVAILABLE_CHANNEL, attachTouchGrass);
	pi.events.emit(TOUCH_GRASS_REQUEST_CHANNEL, { accept: attachTouchGrass });

	const restore = (ctx: ExtensionContext) => {
		lastContext = ctx;
		enabled = restoreEnabled(ctx.sessionManager.getBranch());
		lastNotifiedLeaf = undefined;
		touchGrassPaused = !!touchGrass?.getPausedStatus();
	};

	pi.on("session_start", (_event, ctx) => restore(ctx));
	pi.on("session_tree", (_event, ctx) => restore(ctx));

	pi.on("agent_settled", (_event, ctx) => {
		lastContext = ctx;
		if (!enabled || ctx.mode !== "tui" || !ctx.isIdle() || ctx.hasPendingMessages()) return;
		const leaf = ctx.sessionManager.getLeafId();
		if (leaf && leaf === lastNotifiedLeaf) return;
		lastNotifiedLeaf = leaf ?? undefined;

		const outcome = notificationOutcome(ctx.sessionManager.getBranch());
		deliver(ctx, outcome.error ? "Pi error" : "Pi needs you", outcome.summary);
	});

	pi.on("session_shutdown", () => {
		unsubscribeTouchGrassChange?.();
		unsubscribeTouchGrassChange = undefined;
		unsubscribeTouchGrassAvailable();
		lastContext = undefined;
	});

	pi.registerCommand("notify", {
		description: "Toggle or test user-turn notifications",
		getArgumentCompletions: (prefix) =>
			["status", "on", "off", "toggle", "test"]
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase() || "status";
			if (command === "on" || command === "off" || command === "toggle") {
				enabled = command === "toggle" ? !enabled : command === "on";
				pi.appendEntry(CUSTOM_TYPE, { version: 1, enabled });
			} else if (command === "test") {
				if (!isPushConfigured(runtime.env)) {
					report(ctx, "Phone push not configured. Run: notify setup", "warning");
					return;
				}
				const tmux = runtime.getTmuxState();
				runtime.notifyPush(notificationTitle(tmux.target), "Test notification from Pi.");
				report(ctx, "Test phone notification queued.");
				return;
			} else if (command !== "status") {
				report(ctx, "Usage: /notify [status|on|off|toggle|test]", "warning");
				return;
			}

			const configured = isPushConfigured(runtime.env) ? "configured" : "not configured";
			report(ctx, `Notifications ${enabled ? "enabled" : "disabled"}; mode ${notifyMode(runtime.env)}; ntfy ${configured}.`);
		},
	});
}

export default function notify(pi: ExtensionAPI): void {
	registerNotify(pi);
}
