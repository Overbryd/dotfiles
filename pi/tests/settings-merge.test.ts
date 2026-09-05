import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const filterPath = new URL("../settings-merge.jq", import.meta.url);

function mergeSettings(runtime: Record<string, unknown>, managed: Record<string, unknown>) {
	const result = spawnSync("jq", ["-s", "-f", filterPath.pathname], {
		input: `${JSON.stringify(runtime)}\n${JSON.stringify(managed)}\n`,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	return JSON.parse(result.stdout) as Record<string, unknown>;
}

test("settings merge preserves Pi runtime model and thinking defaults", () => {
	const result = mergeSettings(
		{
			defaultProvider: "openai-codex",
			defaultModel: "gpt-5.6-terra",
			defaultThinkingLevel: "high",
			lastChangelogVersion: "0.84.2",
			transport: "sse",
		},
		{
			defaultProvider: "openai",
			defaultModel: "gpt-5.6-sol",
			defaultThinkingLevel: "medium",
			transport: "websocket",
		},
	);

	assert.equal(result.defaultProvider, "openai-codex");
	assert.equal(result.defaultModel, "gpt-5.6-terra");
	assert.equal(result.defaultThinkingLevel, "high");
	assert.equal(result.transport, "websocket");
	assert.equal(result.lastChangelogVersion, "0.84.2");
});

test("settings merge seeds managed defaults when Pi has none", () => {
	const managed = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
	const result = mergeSettings({ lastChangelogVersion: "0.84.2" }, managed);
	assert.equal(result.defaultProvider, "openai");
	assert.equal(result.defaultModel, "gpt-5.6-sol");
	assert.equal(result.defaultThinkingLevel, "medium");
	assert.deepEqual(result.enabledModels, []);
});
