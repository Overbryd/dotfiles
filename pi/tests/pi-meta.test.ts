import assert from "node:assert/strict";
import test from "node:test";
import piMeta, {
	completeWithFallback,
	lastAssistantResponse,
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

test("finds the last assistant response on the current branch", () => {
	const entries = [
		{
			type: "message",
			id: "assistant-1",
			parentId: null,
			timestamp: "2026-01-01T00:00:00Z",
			message: { role: "assistant", content: [{ type: "text", text: "Earlier response" }] },
		},
		{
			type: "message",
			id: "user-1",
			parentId: "assistant-1",
			timestamp: "2026-01-01T00:00:01Z",
			message: { role: "user", content: "Follow-up", timestamp: 1 },
		},
		{
			type: "message",
			id: "assistant-2",
			parentId: "user-1",
			timestamp: "2026-01-01T00:00:02Z",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "hidden" },
					{ type: "text", text: "Latest response" },
				],
			},
		},
	] as never[];

	assert.equal(lastAssistantResponse(entries), "Latest response");
});

test("create_session starts directly and optionally edits the last response", async () => {
	let handler: ((args: string, ctx: never) => Promise<void>) | undefined;
	piMeta({
		registerCommand(name: string, command: { handler: typeof handler }) {
			if (name === "pi") handler = command.handler;
		},
	} as never);

	const sent: string[] = [];
	const editorPrefills: string[] = [];
	let edit = false;
	let parentSession: string | undefined;
	const responseEntry = {
		type: "message",
		id: "assistant-1",
		parentId: null,
		timestamp: "2026-01-01T00:00:00Z",
		message: { role: "assistant", content: [{ type: "text", text: "Use this as the new prompt" }] },
	};
	const replacementCtx = {
		ui: { notify() {} },
		async sendUserMessage(message: string) {
			sent.push(message);
		},
	};
	const ctx = {
		hasUI: true,
		mode: "rpc",
		cwd: "/project",
		ui: {
			setStatus() {},
			notify() {},
			async editor(_title: string, prefill: string) {
				editorPrefills.push(prefill);
				return "Edited prompt";
			},
		},
		sessionManager: {
			getBranch: () => [responseEntry],
			getSessionFile: () => "/sessions/source.jsonl",
		},
		modelRegistry: {
			find: () => ({ provider: "test", id: "test" }),
			hasConfiguredAuth: () => true,
			async complete() {
				return {
					role: "assistant",
					stopReason: "stop",
					content: [
						{
							type: "toolCall",
							id: "create-1",
							name: "create_session",
							arguments: { edit },
						},
					],
					timestamp: Date.now(),
				};
			},
		},
		async newSession(options: {
			parentSession?: string;
			withSession?: (replacement: typeof replacementCtx) => Promise<void>;
		}) {
			parentSession = options.parentSession;
			await options.withSession?.(replacementCtx);
			return { cancelled: false };
		},
	};

	assert.ok(handler);
	await handler("create a new session from the last response", ctx as never);
	edit = true;
	await handler("let me edit the last response, then create a session from it", ctx as never);
	await Promise.resolve();
	assert.equal(parentSession, "/sessions/source.jsonl");
	assert.deepEqual(editorPrefills, ["Use this as the new prompt"]);
	assert.deepEqual(sent, ["Use this as the new prompt", "Edited prompt"]);
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
