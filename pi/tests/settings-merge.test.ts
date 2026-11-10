import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("settings merge excludes video skills from normal sessions", () => {
	const managed = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
	const result = mergeSettings({}, managed);
	assert.deepEqual(result.skills, [
		"!hyperframes*",
		"!general-video",
		"!media-use",
		"!talking-head-recut",
		"!software-tour-video",
		"!video-edit-prep",
		"!transcribe",
	]);
});

test("pi-settings deploys global Vertex routing without replacing other credentials or runtime defaults", () => {
	const home = mkdtempSync(join(tmpdir(), "pi-settings-"));
	const agentDir = join(home, ".pi", "agent");
	mkdirSync(agentDir, { recursive: true });
	const otherCredential = { type: "api_key", key: "test-only" };
	writeFileSync(join(agentDir, "auth.json"), JSON.stringify({
		"openai": otherCredential,
		"google-vertex": { type: "api_key", env: { GOOGLE_CLOUD_LOCATION: "eu" } },
	}));
	writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
		defaultProvider: "openai-codex", defaultModel: "gpt-6.1-sol",
	}));
	try {
		const result = spawnSync("make", ["pi-settings", `HOME=${home}`], {
			cwd: new URL("../../", import.meta.url),
			env: { ...process.env, HOME: home },
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr);
		const auth = JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf8"));
		assert.equal(auth["google-vertex"].env.GOOGLE_CLOUD_LOCATION, "global");
		assert.equal(auth["google-vertex"].env.GOOGLE_CLOUD_PROJECT, "gen-lang-client-0951766844");
		assert.equal(auth["google-vertex"].env.GOOGLE_APPLICATION_CREDENTIALS,
			join(home, "Work/Parlant/.config/gcloud-parlant/application_default_credentials.json"));
		assert.deepEqual(auth.openai, otherCredential);
		assert.equal(statSync(join(agentDir, "auth.json")).mode & 0o777, 0o600);
		assert.equal(JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")).defaultProvider, "openai-codex");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("settings merge seeds managed defaults when Pi has none", () => {
	const managed = JSON.parse(readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
	const result = mergeSettings({ lastChangelogVersion: "0.84.2" }, managed);
	assert.equal(result.defaultProvider, "openai");
	assert.equal(result.defaultModel, "gpt-6.1-sol");
	assert.equal(result.defaultThinkingLevel, "medium");
	assert.deepEqual(result.enabledModels, []);
});
