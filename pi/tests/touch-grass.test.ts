import assert from "node:assert/strict";
import test from "node:test";
import touchGrass, {
	TouchGrassGate,
	formatTouchGrassStatus,
} from "../extensions/touch-grass.ts";

test("formats a paused Codex bar as hours and minutes", () => {
	const now = Date.now();
	assert.equal(
		formatTouchGrassStatus(now + (123 * 60 + 5) * 60_000, now),
		"touch grass 123h 5m left, loop paused",
	);
});

test("disabling touch grass wakes a paused loop for session credit use", async () => {
	const gate = new TouchGrassGate();
	const waiting = gate.waitUntil(Date.now() + 60_000);
	gate.setEnabled(false);

	assert.equal(await waiting, "disabled");
	assert.equal(gate.isEnabled(), false);
	assert.equal(gate.getPausedStatus(), undefined);
});

test("extension starts enabled and can disable credit protection for the session", async () => {
	const commands = new Map<string, any>();
	const handlers = new Map<string, (event: any, ctx: any) => unknown>();
	const notifications: string[] = [];
	const entries: any[] = [];
	const busHandlers = new Map<string, Array<(data: unknown) => void>>();
	const pi = {
		on(event: string, handler: (event: any, ctx: any) => unknown) {
			handlers.set(event, handler);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		events: {
			on(channel: string, handler: (data: unknown) => void) {
				const values = busHandlers.get(channel) ?? [];
				values.push(handler);
				busHandlers.set(channel, values);
				return () => {};
			},
			emit(channel: string, data: unknown) {
				for (const handler of busHandlers.get(channel) ?? []) handler(data);
			},
		},
	};
	const ctx = {
		hasUI: true,
		model: { provider: "openai-codex", id: "gpt-5.6-sol" },
		sessionManager: { getBranch: () => entries },
		ui: { notify: (message: string) => notifications.push(message) },
	};

	touchGrass(pi as never);
	await handlers.get("session_start")?.({ reason: "startup" }, ctx);
	await commands.get("touch-grass").handler("off", ctx);
	await commands.get("touch-grass").handler("status", ctx);

	assert.match(notifications[0] ?? "", /disabled.*credits allowed/i);
	assert.match(notifications[1] ?? "", /disabled for this session/i);
	assert.deepEqual(entries.at(-1)?.data, { version: 1, enabled: false });

	notifications.length = 0;
	await handlers.get("session_start")?.({ reason: "reload" }, ctx);
	await commands.get("touch-grass").handler("status", ctx);
	assert.match(notifications[0] ?? "", /disabled for this session/i);
});
