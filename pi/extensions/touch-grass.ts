import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const TOUCH_GRASS_AVAILABLE_CHANNEL = "touch-grass:available";
export const TOUCH_GRASS_REQUEST_CHANNEL = "touch-grass:request";
const CUSTOM_TYPE = "touch-grass";

export type TouchGrassWaitResult = "elapsed" | "disabled" | "aborted";

export interface TouchGrassController {
	isEnabled(): boolean;
	setEnabled(enabled: boolean): void;
	waitUntil(resetAt: number, signal?: AbortSignal): Promise<TouchGrassWaitResult>;
	clearPause(): void;
	getPausedStatus(now?: number): string | undefined;
	onChange(handler: () => void): () => void;
}

type Waiter = (result: TouchGrassWaitResult) => void;

export function formatTouchGrassStatus(resetAt: number, now = Date.now()): string {
	const totalMinutes = Math.max(0, Math.ceil((resetAt - now) / 60_000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
	return `touch grass ${duration} left, loop paused`;
}

export class TouchGrassGate implements TouchGrassController {
	private enabled = true;
	private pausedUntil: number | undefined;
	private changeHandlers = new Set<() => void>();
	private waiters = new Set<Waiter>();
	private countdownTimer: ReturnType<typeof setInterval> | undefined;

	isEnabled(): boolean {
		return this.enabled;
	}

	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) return;
		this.enabled = enabled;
		if (!enabled) {
			this.clearPausedState();
			this.wakeWaiters("disabled");
		}
		this.notifyChanged();
	}

	waitUntil(resetAt: number, signal?: AbortSignal): Promise<TouchGrassWaitResult> {
		if (!this.enabled) return Promise.resolve("disabled");
		if (signal?.aborted) return Promise.resolve("aborted");

		this.setPausedUntil(resetAt);
		return new Promise((resolve) => {
			let settled = false;
			const finish = (result: TouchGrassWaitResult) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
				this.waiters.delete(finish);
				resolve(result);
			};
			const abort = () => finish("aborted");
			const delay = Math.min(2_147_483_647, Math.max(0, resetAt - Date.now()));
			const timer = setTimeout(() => finish("elapsed"), delay);
			this.waiters.add(finish);
			signal?.addEventListener("abort", abort, { once: true });
		});
	}

	clearPause(): void {
		if (this.pausedUntil === undefined) return;
		this.clearPausedState();
		this.notifyChanged();
	}

	getPausedStatus(now = Date.now()): string | undefined {
		if (!this.enabled || this.pausedUntil === undefined) return undefined;
		return formatTouchGrassStatus(this.pausedUntil, now);
	}

	onChange(handler: () => void): () => void {
		this.changeHandlers.add(handler);
		return () => this.changeHandlers.delete(handler);
	}

	shutdown(): void {
		this.clearPausedState();
		this.wakeWaiters("aborted");
		this.changeHandlers.clear();
	}

	private setPausedUntil(resetAt: number): void {
		this.pausedUntil = resetAt;
		if (!this.countdownTimer) {
			this.countdownTimer = setInterval(() => this.notifyChanged(), 60_000);
			this.countdownTimer.unref?.();
		}
		this.notifyChanged();
	}

	private clearPausedState(): void {
		this.pausedUntil = undefined;
		if (this.countdownTimer) clearInterval(this.countdownTimer);
		this.countdownTimer = undefined;
	}

	private wakeWaiters(result: TouchGrassWaitResult): void {
		for (const finish of [...this.waiters]) finish(result);
	}

	private notifyChanged(): void {
		for (const handler of this.changeHandlers) handler();
	}
}

function controllerRequest(value: unknown): ((controller: TouchGrassController) => void) | undefined {
	if (!value || typeof value !== "object") return undefined;
	const accept = (value as { accept?: unknown }).accept;
	return typeof accept === "function" ? (accept as (controller: TouchGrassController) => void) : undefined;
}

function report(ctx: { hasUI: boolean; ui: { notify(message: string, type?: "info" | "warning" | "error"): void } }, message: string): void {
	if (ctx.hasUI) ctx.ui.notify(message, "info");
	else console.log(message);
}

function restoredEnabled(ctx: { sessionManager: { getBranch(): readonly unknown[] } }): boolean {
	const entries = ctx.sessionManager.getBranch();
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

export default function touchGrass(pi: ExtensionAPI) {
	const gate = new TouchGrassGate();
	const unsubscribeRequest = pi.events.on(TOUCH_GRASS_REQUEST_CHANNEL, (value) => {
		controllerRequest(value)?.(gate);
	});
	pi.events.emit(TOUCH_GRASS_AVAILABLE_CHANNEL, gate);

	const restoreSession = (ctx: { sessionManager: { getBranch(): readonly unknown[] } }) => {
		gate.clearPause();
		gate.setEnabled(restoredEnabled(ctx));
	};

	pi.on("session_start", (_event, ctx) => {
		restoreSession(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		restoreSession(ctx);
	});

	pi.on("session_shutdown", () => {
		unsubscribeRequest();
		gate.shutdown();
	});

	pi.registerCommand("touch-grass", {
		description: "Pause Codex at subscription limits instead of spending credits",
		getArgumentCompletions: (prefix) =>
			["status", "on", "off", "toggle"]
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const command = args.trim().toLowerCase() || "status";
			let changed = false;
			if (command === "on") {
				gate.setEnabled(true);
				changed = true;
			} else if (command === "off") {
				gate.setEnabled(false);
				changed = true;
			} else if (command === "toggle") {
				gate.setEnabled(!gate.isEnabled());
				changed = true;
			} else if (command !== "status") {
				report(ctx, "Usage: /touch-grass [status|on|off|toggle]");
				return;
			}
			if (changed) pi.appendEntry(CUSTOM_TYPE, { version: 1, enabled: gate.isEnabled() });

			if (gate.isEnabled()) {
				report(ctx, "Touch grass enabled for this session; Codex credit fallback blocked.");
			} else {
				report(ctx, "Touch grass disabled for this session; Codex credits allowed.");
			}
		},
	});
}
