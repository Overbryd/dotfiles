import assert from "node:assert/strict";
import test from "node:test";
import {
	completeWithFallback,
	rankSessions,
	searchTreeEntries,
	type MetaModelCandidate,
} from "../extensions/pi-meta.ts";

const sessions = [
	{
		path: "/sessions/other.jsonl",
		id: "other",
		cwd: "/project",
		created: new Date("2026-01-01"),
		modified: new Date("2026-01-02"),
		messageCount: 4,
		firstMessage: "Refactor authentication",
		allMessagesText: "Discuss OAuth and login errors",
	},
	{
		path: "/sessions/analytics.jsonl",
		id: "analytics",
		cwd: "/project",
		name: "Revenue dashboard",
		created: new Date("2026-02-01"),
		modified: new Date("2026-02-02"),
		messageCount: 12,
		firstMessage: "Build reporting",
		allMessagesText: "Analytics attribution across marketing and sales",
	},
];

test("ranks sessions by contextual query terms", () => {
	const ranked = rankSessions(sessions, "analytics marketing sales", 5);
	assert.equal(ranked[0]?.path, "/sessions/analytics.jsonl");
	assert.match(ranked[0]?.snippet ?? "", /Analytics attribution/);
});

test("tree search exposes the response immediately before a matching sidequest", () => {
	const entries = [
		{
			type: "message",
			id: "user-1",
			parentId: null,
			timestamp: "2026-01-01T00:00:00Z",
			message: { role: "user", content: "Main task", timestamp: 1 },
		},
		{
			type: "message",
			id: "assistant-1",
			parentId: "user-1",
			timestamp: "2026-01-01T00:00:01Z",
			message: { role: "assistant", content: [{ type: "text", text: "Main-task answer" }] },
		},
		{
			type: "message",
			id: "sidequest",
			parentId: "assistant-1",
			timestamp: "2026-01-01T00:00:02Z",
			message: { role: "user", content: "SIDEQUEST investigate metrics", timestamp: 2 },
		},
	] as never[];

	const matches = searchTreeEntries(entries, "SIDEQUEST", 5);
	assert.equal(matches[0]?.entry.id, "sidequest");
	assert.equal(matches[0]?.ancestors.at(-1)?.id, "assistant-1");
	assert.match(matches[0]?.ancestors.at(-1)?.text ?? "", /Main-task answer/);
});

test("completion falls back when the preferred provider fails", async () => {
	const candidates: MetaModelCandidate[] = [
		{ provider: "preferred", model: "one", thinking: "medium" },
		{ provider: "fallback", model: "two", thinking: "low" },
	];
	const models = new Map([
		["preferred/one", { provider: "preferred", id: "one" }],
		["fallback/two", { provider: "fallback", id: "two" }],
	]);
	const attempted: string[] = [];
	const registry = {
		find(provider: string, model: string) {
			return models.get(`${provider}/${model}`);
		},
		hasConfiguredAuth() {
			return true;
		},
		async complete(model: { provider: string; id: string }) {
			attempted.push(`${model.provider}/${model.id}`);
			if (model.provider === "preferred") {
				return { stopReason: "error", errorMessage: "provider unavailable", content: [] };
			}
			return { stopReason: "stop", content: [{ type: "text", text: "ok" }] };
		},
	};

	const result = await completeWithFallback(registry as never, candidates, { messages: [] });
	assert.deepEqual(attempted, ["preferred/one", "fallback/two"]);
	assert.equal(result.candidate.provider, "fallback");
});
