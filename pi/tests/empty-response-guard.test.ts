import assert from "node:assert/strict";
import test from "node:test";
import emptyResponseGuard, { isEmptySuccessfulResponse } from "../extensions/empty-response-guard.ts";

const emptyResponse = {
	role: "assistant",
	content: [],
	stopReason: "stop",
};

const textResponse = {
	role: "assistant",
	content: [{ type: "text", text: "done" }],
	stopReason: "stop",
};

test("identifies successful responses with no visible output or tool call", () => {
	assert.equal(isEmptySuccessfulResponse(emptyResponse as never), true);
	assert.equal(
		isEmptySuccessfulResponse({
			...emptyResponse,
			content: [{ type: "thinking", thinking: "internal" }, { type: "text", text: "  " }],
		} as never),
		true,
	);
	assert.equal(isEmptySuccessfulResponse(textResponse as never), false);
	assert.equal(
		isEmptySuccessfulResponse({
			...emptyResponse,
			content: [{ type: "toolCall", id: "call-1", name: "read", arguments: {} }],
		} as never),
		false,
	);
	assert.equal(isEmptySuccessfulResponse({ ...emptyResponse, stopReason: "error" } as never), false);
});

test("retries one empty response, then leaves a persistent diagnostic", async () => {
	let turnEnd: ((event: typeof event, context: typeof context) => unknown) | undefined;
	const notifications: string[] = [];
	const sent: Array<{
		message: { display: boolean; content: string };
		options?: { triggerTurn?: boolean; deliverAs?: string };
	}> = [];
	const context = {
		hasUI: true,
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
		},
	};
	const event = { type: "turn_end", message: emptyResponse };
	const pi = {
		on(name: string, handler: typeof turnEnd) {
			if (name === "turn_end") turnEnd = handler;
		},
		sendMessage(message: { display: boolean; content: string }, options?: { triggerTurn?: boolean; deliverAs?: string }) {
			sent.push({ message, options });
		},
	};
	emptyResponseGuard(pi as never);

	await turnEnd?.(event, context);
	assert.equal(sent[0]?.message.display, false);
	assert.deepEqual(sent[0]?.options, { triggerTurn: true, deliverAs: "steer" });

	await turnEnd?.(event, context);
	assert.equal(sent[1]?.message.display, true);
	assert.match(sent[1]?.message.content ?? "", /no output twice/i);
	assert.deepEqual(sent[1]?.options, { triggerTurn: false });
	assert.equal(notifications.length, 2);

	await turnEnd?.({ ...event, message: textResponse }, context);
	await turnEnd?.(event, context);
	assert.deepEqual(sent[2]?.options, { triggerTurn: true, deliverAs: "steer" });
});
