import assert from "node:assert/strict";
import test from "node:test";
import retryExtension from "../extensions/retry.ts";

test("retry command waits for idle before retrying the latest turn", async () => {
	let handler: ((args: string, context: unknown) => Promise<void>) | undefined;
	const pi = {
		registerCommand(name: string, command: { handler: typeof handler }) {
			assert.equal(name, "retry");
			handler = command.handler;
		},
	};
	retryExtension(pi as never);

	const calls: string[] = [];
	await handler?.("", {
		async waitForIdle() {
			calls.push("idle");
		},
		async retryLastTurn() {
			calls.push("retry");
		},
	});

	assert.deepEqual(calls, ["idle", "retry"]);
});
