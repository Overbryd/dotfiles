import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoogleAuth } from "google-auth-library";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import googleTokenExchange from "../extensions/google-token-exchange.ts";
import { streamAnthropicVertex, vertexConnection } from "../lib/anthropic-vertex.ts";

const config = JSON.parse(readFileSync(new URL("../models.json", import.meta.url), "utf8"));
const model = {
	...config.providers["google-vertex-anthropic"].models[0],
	api: "anthropic-messages",
	provider: "google-vertex-anthropic",
};
const env = {
	GOOGLE_CLOUD_PROJECT: "test-project",
	GOOGLE_CLOUD_LOCATION: "global",
	GOOGLE_APPLICATION_CREDENTIALS: "/test-only/adc.json",
};

function sse(events: Record<string, unknown>[]) {
	return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

const textEvents = [
	{ type: "message_start", message: { id: "msg-test", type: "message", role: "assistant", model: model.id,
		content: [], stop_reason: null, usage: { input_tokens: 7, output_tokens: 0 } } },
	{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
	{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
	{ type: "content_block_stop", index: 0 },
	{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } },
	{ type: "message_stop" },
];

function stubAuth(t: test.TestContext) {
	t.mock.method(GoogleAuth.prototype, "getClient", async () => ({
		getRequestHeaders: async () => new Headers({ authorization: "Bearer test-only" }),
	}));
}

test("Vertex model metadata uses Fable 5.2 global pricing and adaptive thinking", () => {
	assert.equal(model.id, "claude-fable-5-2");
	assert.equal(model.contextWindow, 1_000_000);
	assert.equal(model.maxTokens, 128_000);
	assert.deepEqual(model.cost, { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 });
	assert.equal(model.compat.forceAdaptiveThinking, true);
});

test("Pi exposes Fable as available and passes scoped ADC through its real model runtime", async () => {
	const dir = mkdtempSync(join(tmpdir(), "fable-runtime-"));
	try {
		writeFileSync(join(dir, "models.json"), JSON.stringify(config));
		writeFileSync(join(dir, "auth.json"), JSON.stringify({
			"google-vertex-anthropic": { type: "api_key", key: "vertex-adc", env },
		}));
		const runtime = await ModelRuntime.create({
			modelsPath: join(dir, "models.json"), authPath: join(dir, "auth.json"), allowModelNetwork: false,
		});
		googleTokenExchange({ on() {}, registerProvider: runtime.registerProvider.bind(runtime) } as never);
		await runtime.refresh({ allowNetwork: false });
		assert.equal(runtime.getError(), undefined);
		assert.equal(runtime.hasConfiguredAuth(model.provider), true);
		const registered = runtime.getModel(model.provider, model.id)!;
		assert.ok(registered);
		assert.equal((await runtime.getAuth(registered))?.env?.GOOGLE_APPLICATION_CREDENTIALS, env.GOOGLE_APPLICATION_CREDENTIALS);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("Vertex connection requires explicit scoped ADC and does not change the shell environment", () => {
	assert.deepEqual(vertexConnection(env), {
		projectId: "test-project", region: "global", keyFilename: "/test-only/adc.json",
	});
	for (const key of Object.keys(env)) {
		assert.throws(() => vertexConnection({ ...env, [key]: undefined }), /provider-scoped/);
	}
});

test("Fable uses Vertex authentication and native Anthropic text, thinking, usage, and request hooks", async (t) => {
	stubAuth(t);
	let payloadCalls = 0;
	let responseCalls = 0;
	let providerEvents = 0;
	const stream = streamAnthropicVertex(model, normalizeContext({ messages: [
		{ role: "user", content: "Say OK", timestamp: Date.now() },
	] }), {
		env, reasoning: "high", maxTokens: 32, cacheRetention: "none",
		onPayload(payload) { payloadCalls++; return payload; },
		onResponse() { responseCalls++; },
		onProviderStreamEvent() { providerEvents++; },
		fetch: async (input, init) => {
			const request = new Request(input, init);
			assert.equal(request.url, "https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/anthropic/models/claude-fable-5-2:streamRawPredict");
			assert.equal(request.headers.get("authorization"), "Bearer test-only");
			assert.equal(request.headers.get("x-api-key"), null);
			const body = await request.json();
			assert.equal(body.anthropic_version, "vertex-2023-10-16");
			assert.equal(body.model, undefined);
			assert.equal(body.max_tokens, 32);
			assert.equal(body.thinking.type, "adaptive");
			assert.equal(body.output_config.effort, "high");
			return new Response(sse(textEvents), { headers: { "content-type": "text/event-stream" } });
		},
	});
	const result = await stream.result();
	assert.equal(result.stopReason, "stop", result.errorMessage);
	assert.equal(result.provider, "google-vertex-anthropic");
	assert.equal(result.content[0].text, "OK");
	assert.equal(result.usage.input, 7);
	assert.equal(result.usage.output, 3);
	assert.equal(payloadCalls, 1);
	assert.equal(responseCalls, 1);
	assert.equal(providerEvents, textEvents.length);
});

test("Fable tool calls keep native Anthropic argument assembly", async (t) => {
	stubAuth(t);
	const events = [
		textEvents[0],
		{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "read", input: {} } },
		{ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"path":"sample.txt"}' } },
		{ type: "content_block_stop", index: 0 },
		{ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
		textEvents.at(-1)!,
	];
	const result = await streamAnthropicVertex(model, normalizeContext({ messages: [] }), {
		env, cacheRetention: "none",
		fetch: async () => new Response(sse(events), { headers: { "content-type": "text/event-stream" } }),
	}).result();
	assert.equal(result.stopReason, "toolUse", result.errorMessage);
	assert.deepEqual(result.content[0], { type: "toolCall", id: "tool-1", name: "read", arguments: { path: "sample.txt" } });
});

test("Fable cancellation settles without sending a request", async (t) => {
	stubAuth(t);
	const controller = new AbortController();
	controller.abort();
	let requests = 0;
	const result = await streamAnthropicVertex(model, normalizeContext({ messages: [] }), {
		env, signal: controller.signal,
		fetch: async () => { requests++; throw new Error("must not send"); },
	}).result();
	assert.equal(result.stopReason, "aborted");
	assert.equal(requests, 0);
});

test("Fable quota failures stay visible without automatic retries", async (t) => {
	stubAuth(t);
	let requests = 0;
	const result = await streamAnthropicVertex(model, normalizeContext({ messages: [] }), {
		env,
		fetch: async () => {
			requests++;
			return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
				status: 429, headers: { "content-type": "application/json" },
			});
		},
	}).result();
	assert.equal(result.stopReason, "error");
	assert.match(result.errorMessage!, /429/);
	assert.equal(requests, 1);
});

for (const hasUI of [true, false]) {
	test(`ADC sign-in stays visible and clears after repair (${hasUI ? "UI" : "headless"})`, { timeout: 2000 }, async (t) => {
		let authCalls = 0;
		t.mock.method(GoogleAuth.prototype, "getClient", async () => {
			if (authCalls++ === 0) throw new Error("invalid_grant: invalid_rapt");
			return { getRequestHeaders: async () => new Headers({ authorization: "Bearer test-only" }) };
		});
		let entered!: () => void;
		const authStarted = new Promise<void>((resolve) => { entered = resolve; });
		let accept!: (code: number) => void;
		t.mock.method(childProcess, "spawn", () => {
			const child = { once(event: string, callback: (code: number) => void) {
				if (event === "exit") { accept = callback; entered(); }
				return child;
			} };
			return child;
		});
		const stderr: string[] = [];
		t.mock.method(console, "error", (text: string) => { stderr.push(text); });
		const handlers = new Map<string, (event: never, ctx: never) => void>();
		const providers = new Map<string, { streamSimple: typeof streamAnthropicVertex }>();
		const working: Array<string | undefined> = [];
		const statuses: Array<string | undefined> = [];
		const ctx = { hasUI, ui: {
			setWorkingMessage: (text?: string) => { working.push(text); },
			setStatus: (_key: string, text?: string) => { statuses.push(text); },
			notify() {},
		} };
		googleTokenExchange({
			on: (name: string, handler: (event: never, ctx: never) => void) => handlers.set(name, handler),
			registerProvider: (name: string, provider: { streamSimple: typeof streamAnthropicVertex }) => providers.set(name, provider),
		} as never);
		handlers.get("session_start")!({} as never, ctx as never);
		const controller = new AbortController();
		t.after(() => controller.abort());
		const result = providers.get("google-vertex-anthropic")!.streamSimple(model, normalizeContext({ messages: [] }), {
			env, cacheRetention: "none", signal: controller.signal,
			fetch: async () => new Response(sse(textEvents), { headers: { "content-type": "text/event-stream" } }),
		}).result();
		await Promise.race([authStarted, result.then((terminal) => {
			throw new Error(terminal.errorMessage ?? "Request finished before requesting sign-in");
		})]);
		if (hasUI) {
			assert.match(working.at(-1)!, /Waiting for Google sign-in \(ADC\)/);
			assert.match(statuses.at(-1)!, /Google sign-in required/);
		} else assert.match(stderr.at(-1)!, /Google sign-in required \(ADC\)/);
		accept(0);
		assert.equal((await result).stopReason, "stop");
		assert.equal(working.at(-1), undefined);
		assert.equal(statuses.at(-1), undefined);
	});
}

test("Google recovery registers both Vertex APIs without replacing their model catalogs", () => {
	const providers = new Map<string, any>();
	googleTokenExchange({ on() {}, registerProvider(id: string, provider: unknown) { providers.set(id, provider); } } as never);
	assert.equal(providers.get("google-vertex").api, "google-vertex");
	assert.equal(providers.get("google-vertex-anthropic").api, "anthropic-messages");
	assert.equal(providers.get("google-vertex-anthropic").models, undefined);
});
