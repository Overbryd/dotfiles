import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../models.json", import.meta.url), "utf8"));
const vertex = config.providers["google-vertex"].models;

for (const [id, name, input, output, cacheRead] of [
	["gemini-4-argon", "Gemini 4 Argon", 2, 10, 0.1],
	["gemini-4-carbon", "Gemini 4 Carbon", 2, 10, 0.1],
	["gemini-4-hydrogen", "Gemini 4 Hydrogen", 1.5, 7.5, 0.075],
] as const) {
	test(`Vertex exposes ${id} with supported thinking levels and synchronous output limits`, () => {
		const matches = vertex.filter((model: { id: string }) => model.id === id);
		assert.equal(matches.length, 1, `${id} must be registered exactly once`);
		const model = matches[0];
		assert.equal(model.name, name);
		assert.equal(model.api, "google-vertex");
		assert.equal(model.baseUrl, "https://{location}-aiplatform.googleapis.com");
		assert.equal(model.reasoning, true);
		assert.deepEqual(model.input, ["text", "image"]);
		assert.deepEqual(model.cost, { input, output, cacheRead, cacheWrite: 0 });
		assert.equal(model.contextWindow, 1048576);
		assert.equal(model.maxTokens, 65536);
		assert.deepEqual(model.thinkingLevelMap, {
			off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null,
		});
	});
}
