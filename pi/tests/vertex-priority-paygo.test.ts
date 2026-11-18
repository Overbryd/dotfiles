import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { streamSimpleGoogleVertex, type Model, type SimpleStreamOptions } from "@earendil-works/pi-ai/compat";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import googleTokenExchange from "../extensions/google-token-exchange.ts";
import { withVertexPriorityPayGo } from "../lib/vertex-priority-paygo.ts";

const catalog = JSON.parse(readFileSync(new URL("../models.json", import.meta.url), "utf8"));
const models: Model<"google-vertex">[] = catalog.providers["google-vertex"].models.map(
	(model: Omit<Model<"google-vertex">, "provider">) => ({ ...model, provider: "google-vertex" }),
);
const argon = models.find((model) => model.id === "gemini-4-argon")!;
const context = normalizeContext({ messages: [{ role: "user", content: "Test", timestamp: 0 }] });
const apiKey = "fixture-key";
const env = { GOOGLE_CLOUD_PROJECT: "fixture-project", GOOGLE_CLOUD_LOCATION: "global" };
const shared = "x-vertex-ai-llm-request-type";
const priority = "x-vertex-ai-llm-shared-request-type";

function response(trafficType?: string) {
	const chunks = [
		{ candidates: [{ content: { parts: [{ text: "OK" }], role: "model" } }] },
		{ candidates: [{ finishReason: "STOP" }], usageMetadata: {
			promptTokenCount: 1100, cachedContentTokenCount: 100, candidatesTokenCount: 30,
			thoughtsTokenCount: 20, totalTokenCount: 1150, trafficType,
		} },
	];
	return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""), {
		headers: { "content-type": "text/event-stream" },
	});
}

function assertCost(usage: { cost: Model<"google-vertex">["cost"] & { total: number } }, input: number, output: number, read: number) {
	const billed = { input: input / 1000, output: output * 50 / 1e6, cacheRead: read / 10000, cacheWrite: 0 };
	const expected = { ...billed, total: billed.input + billed.output + billed.cacheRead };
	for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"] as const) {
		assert.equal(usage.cost[key].toFixed(12), expected[key].toFixed(12), key);
	}
}

test("scoped global Gemini requests send both priority headers and bill the served tier", async (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-30T23:59:59Z") });
	let traffic = "ON_DEMAND_PRIORITY";
	const requests: Request[] = [];
	t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
		requests.push(new Request(input, init));
		return response(traffic);
	});
	const stream = withVertexPriorityPayGo(streamSimpleGoogleVertex, () => true);
	const model = { ...argon, headers: { "X-Vertex-AI-LLM-Request-Type": "dedicated", "x-model-test": "preserved" } };
	const events: unknown[] = [];
	const options = { env, apiKey, reasoning: "high" as const,
		headers: { "X-Vertex-AI-LLM-Shared-Request-Type": "standard", "x-request-test": "preserved" },
		onProviderStreamEvent: (chunk: unknown) => { events.push(chunk); },
	};
	let result = await stream(model, context, options).result();
	assert.equal(result.stopReason, "stop", result.errorMessage);
	assert.equal(result.model, argon.id);
	assert.equal(result.usage.reasoning, 20);
	assertCost(result.usage, 3.60, 18, 0.18);
	assert.equal(events.length, 2);
	assert.match(requests[0].url, /aiplatform\.googleapis\.com\/v1\/projects\/fixture-project\/locations\/global\/publishers\/google\/models\/gemini-4-argon:streamGenerateContent/);
	assert.equal(requests[0].headers.get("x-goog-api-key"), apiKey);
	assert.equal(requests[0].headers.get(shared), "shared");
	assert.equal(requests[0].headers.get(priority), "priority");
	assert.equal(requests[0].headers.get("x-model-test"), "preserved");
	assert.equal(requests[0].headers.get("x-request-test"), "preserved");
	assert.equal(model.cost.input, 2);

	traffic = "ON_DEMAND";
	result = await stream(model, context, options).result();
	assertCost(result.usage, 2, 10, 0.10);

	t.mock.timers.tick(1000);
	result = await stream(model, context, options).result();
	assertCost(result.usage, 4, 20, 0.20);
	traffic = "ON_DEMAND_PRIORITY";
	const carbon = models.find((entry) => entry.id === "gemini-4-carbon")!;
	result = await stream(carbon, context, options).result();
	assertCost(result.usage, 7.20, 36, 0.36);
	const hydrogen = models.find((entry) => entry.id === "gemini-4-hydrogen")!;
	result = await stream(hydrogen, context, options).result();
	assertCost(result.usage, 2.70, 13.50, 0.135);
	traffic = "";
	result = await stream(hydrogen, context, options).result();
	assertCost(result.usage, 1.50, 7.50, 0.075);
});

test("leaves unselected tiers, unsupported models and non-global routes untouched; preserves ADC options", () => {
	let enabled = false;
	const signal = new AbortController().signal;
	const cases = [
		[argon, { env, apiKey }],
		[{ ...argon, id: "claude-fable-5-2", provider: "google-vertex-anthropic" }, { env }],
		[{ ...argon, id: "unsupported-model" }, { env }],
		[argon, { env: { ...env, GOOGLE_CLOUD_LOCATION: "us" } }],
	] satisfies Array<[Model<"google-vertex">, SimpleStreamOptions]>;
	for (const [model, options] of cases) {
		const stream = withVertexPriorityPayGo((actual, _context, actualOptions) => {
			assert.equal(actual, model);
			assert.equal(actualOptions, options);
			return {} as never;
		}, () => enabled);
		stream(model, context, options);
		enabled = true;
	}
	const adc = { env: { ...env, GOOGLE_APPLICATION_CREDENTIALS: "/fixture/no-real-adc.json" }, signal };
	const stream = withVertexPriorityPayGo((_model, _context, options) => {
		assert.equal(options?.env, adc.env);
		assert.equal(options?.apiKey, undefined);
		assert.equal(options?.signal, signal);
		assert.equal(options?.headers?.[priority], "priority");
		return {} as never;
	}, () => true);
	stream(argon, context, adc);
});

test("Priority PayGo is opt-in and restores on session resume and branch changes", async (t) => {
	const entries: unknown[] = [];
	const notifications: string[] = [];
	const statuses: Array<string | undefined> = [];
	const events = new Map<string, (_event: unknown, context: typeof ctx) => unknown>();
	const ctx = {
		hasUI: true, sessionManager: { getBranch: () => entries }, waitForIdle: async () => {},
		ui: { notify: (message: string) => notifications.push(message), setWorkingMessage() {},
			setStatus: (key: string, status?: string) => { if (key === "vertex-priority-paygo") statuses.push(status); } },
	};
	let command!: Parameters<ExtensionAPI["registerCommand"]>[1];
	let gemini!: typeof streamSimpleGoogleVertex;
	googleTokenExchange({
		on: (name: string, handler: (_event: unknown, context: typeof ctx) => unknown) => events.set(name, handler),
		registerCommand: (name: string, spec: typeof command) => { assert.equal(name, "priority-paygo"); command = spec; },
		registerProvider: (name: string, spec: { streamSimple: typeof gemini }) => {
			if (name === "google-vertex") gemini = spec.streamSimple;
		},
		appendEntry: (customType: string, data: boolean) => entries.push({ type: "custom", customType, data }),
	} as never);
	const tiers: Array<string | null> = [];
	t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
		tiers.push(new Request(input, init).headers.get(priority));
		return response("ON_DEMAND");
	});
	const send = async () => {
		const result = await gemini(argon, context, { env, apiKey, reasoning: "high" }).result();
		assert.equal(result.stopReason, "stop", result.errorMessage);
	};
	events.get("session_start")!({}, ctx);
	await command.handler("status", ctx as never);
	assert.match(notifications.at(-1)!, /off/);
	await send();
	await command.handler("on", ctx as never);
	assert.match(statuses.at(-1)!, /requested/);
	await send();
	await command.handler("off", ctx as never);
	await send();
	entries.pop(); // Tree navigation drops the "off" entry.
	events.get("session_tree")!({}, ctx);
	await send();
	events.get("session_shutdown")!({}, ctx);
	events.get("session_start")!({}, ctx);
	await send();
	assert.deepEqual(tiers, [null, "priority", null, "priority", "priority"]);
});
