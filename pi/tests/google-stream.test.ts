import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/compat";
import { createGoogleStream } from "../lib/google-stream.ts";

const model = { id: "gemini-4-carbon", api: "google-vertex", provider: "google-vertex" };
const message = {
	role: "assistant", api: model.api, provider: model.provider, model: model.id,
	content: [], timestamp: Date.now(), stopReason: "stop",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
};

function failure() {
	const stream = createAssistantMessageEventStream();
	stream.push({ type: "error", reason: "error", error: {
		...message, stopReason: "error", errorMessage: "invalid_grant: invalid_rapt",
	} } as never);
	stream.end();
	return stream;
}

function success() {
	const stream = createAssistantMessageEventStream();
	stream.push({ type: "done", reason: "stop", message } as never);
	stream.end();
	return stream;
}

function hooks(repair: (env: NodeJS.ProcessEnv, signal: AbortSignal) => Promise<void> = async () => {}) {
	const phases: string[] = [];
	return {
		phases,
		onModelWait: (key: boolean) => { phases.push(key ? "model:key" : "model:adc"); },
		onAuthWait: () => { phases.push("auth:adc"); },
		onWaitEnd: () => { phases.push("clear"); },
		repair,
	};
}

async function flush() {
	for (let i = 0; i < 12; i++) await Promise.resolve();
}

test("configured API keys never trigger ADC repair or phone sign-in", async () => {
	let repairs = 0;
	const ui = hooks(async () => { repairs++; });
	const wrapped = createGoogleStream(failure as never, ui);
	const result = await wrapped(model as never, { messages: [] }, { apiKey: "test-key" }).result();
	assert.equal(result.stopReason, "error");
	assert.match(result.errorMessage!, /invalid_rapt/);
	assert.equal(repairs, 0);
	assert.deepEqual(ui.phases, ["model:key", "clear"]);
});

test("ADC repair is visible until it finishes, then returns to waiting for the model", async () => {
	let accept!: () => void;
	const approval = new Promise<void>((resolve) => { accept = resolve; });
	let calls = 0;
	const ui = hooks(async () => approval);
	const wrapped = createGoogleStream((() => ++calls === 1 ? failure() : success()) as never, ui);
	const result = wrapped(model as never, { messages: [] }, { env: { GOOGLE_CLOUD_API_KEY: "" } }).result();
	await flush();
	assert.deepEqual(ui.phases, ["model:adc", "auth:adc"]);
	accept();
	assert.equal((await result).stopReason, "stop");
	assert.deepEqual(ui.phases, ["model:adc", "auth:adc", "model:adc", "clear"]);
	assert.equal(calls, 2);
});

test("an unresponsive provider settles on cancellation even if it ignores its signal", async () => {
	const ui = hooks();
	const controller = new AbortController();
	const wrapped = createGoogleStream((() => createAssistantMessageEventStream()) as never, ui);
	const result = wrapped(model as never, { messages: [] }, { apiKey: "test-key", signal: controller.signal }).result();
	controller.abort();
	assert.equal((await result).stopReason, "aborted");
	assert.equal(ui.phases.at(-1), "clear");
});

test("a stalled model request times out instead of spinning forever", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const ui = hooks();
	const wrapped = createGoogleStream((() => createAssistantMessageEventStream()) as never, ui);
	const result = wrapped(model as never, { messages: [] }, { apiKey: "test-key", timeoutMs: 1000 }).result();
	t.mock.timers.tick(1001);
	const terminal = await result;
	assert.equal(terminal.stopReason, "error");
	assert.match(terminal.errorMessage!, /timed out/);
	assert.equal(ui.phases.at(-1), "clear");
});

test("provider progress resets the idle deadline for long healthy streams", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const upstream = createAssistantMessageEventStream();
	const wrapped = createGoogleStream((() => upstream) as never, hooks());
	const result = wrapped(model as never, { messages: [] }, { apiKey: "test-key", timeoutMs: 1000 }).result();
	t.mock.timers.tick(600);
	upstream.push({ type: "text_delta", contentIndex: 0, delta: "OK", partial: message } as never);
	await flush();
	t.mock.timers.tick(600);
	upstream.push({ type: "done", reason: "stop", message } as never);
	upstream.end();
	assert.equal((await result).stopReason, "stop");
});

test("sign-in has its own bounded wait and cannot retry after cancellation", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let accept!: () => void;
	const approval = new Promise<void>((resolve) => { accept = resolve; });
	let calls = 0;
	const ui = hooks(async () => approval);
	const wrapped = createGoogleStream((() => { calls++; return failure(); }) as never, ui);
	const result = wrapped(model as never, { messages: [] }, { env: { GOOGLE_CLOUD_API_KEY: "" } }).result();
	await flush();
	t.mock.timers.tick(300001);
	const terminal = await result;
	assert.equal(terminal.stopReason, "error");
	assert.match(terminal.errorMessage!, /sign-in timed out/);
	accept();
	await flush();
	assert.equal(calls, 1);
	assert.equal(ui.phases.at(-1), "clear");
});

test("timeout preserves partial output and usage and never restarts a request", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let calls = 0;
	const ui = hooks();
	const partial = { ...message, content: [{ type: "text", text: "Started" }],
		usage: { ...message.usage, output: 5, totalTokens: 5 } };
	const wrapped = createGoogleStream((() => {
		calls++;
		const stream = createAssistantMessageEventStream();
		stream.push({ type: "text_delta", contentIndex: 0, delta: "Started", partial } as never);
		return stream;
	}) as never, ui);
	const result = wrapped(model as never, { messages: [] }, { apiKey: "test-key", timeoutMs: 1000 }).result();
	await flush();
	t.mock.timers.tick(1001);
	const terminal = await result;
	assert.equal(terminal.stopReason, "error");
	assert.deepEqual(terminal.content, partial.content);
	assert.equal(terminal.usage.output, 5);
	assert.equal(calls, 1);
});
