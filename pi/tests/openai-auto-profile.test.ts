import assert from "node:assert/strict";
import test from "node:test";
import openAIAutoProfile, {
	__openAIAutoProfileInternals,
	type AutoProfileDecision,
} from "../extensions/openai-auto-profile.ts";

const { parseClassification, resolveAutoDecision } = __openAIAutoProfileInternals;

type Handler = (event: any, context: any) => unknown;

function assistantClassification(task: string, confidence = 0.95) {
	return {
		role: "assistant",
		content: [{ type: "text", text: JSON.stringify({ task, confidence, rationale: "test" }) }],
		usage: {
			input: 100,
			output: 20,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 120,
			cost: { input: 0.00002, output: 0.000024, cacheRead: 0, cacheWrite: 0, total: 0.000044 },
		},
	};
}

function harness(classifications: any[] = [assistantClassification("routine")], initialProvider = "openai") {
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, any>();
	const entries: any[] = [];
	const statuses: Array<[string, string | undefined]> = [];
	const notifications: string[] = [];
	const workingMessages: Array<string | undefined> = [];
	const models = new Map(
		["openai", "openai-codex"].flatMap((provider) =>
			["sol", "terra", "luna"].map((name) => [
				`${provider}/gpt-5.6-${name}`,
				{
					id: `gpt-5.6-${name}`,
					provider,
					api: provider === "openai" ? "openai-responses" : "openai-codex-responses",
					reasoning: true,
				},
			]),
		),
	);
	let currentModel = models.get(`${initialProvider}/gpt-5.6-sol`)!;
	let thinkingLevel = "medium";
	let responseIndex = 0;
	let classifierCalls = 0;
	const classifierProviders: string[] = [];

	const pi = {
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		async setModel(model: any) {
			const previousModel = currentModel;
			currentModel = model;
			context.model = model;
			await handlers.get("model_select")?.({ model, previousModel, source: "set" }, context);
			return true;
		},
		getThinkingLevel() {
			return thinkingLevel;
		},
		setThinkingLevel(level: string) {
			const previousLevel = thinkingLevel;
			thinkingLevel = level;
			handlers.get("thinking_level_select")?.({ level, previousLevel }, context);
		},
	};

	const context: any = {
		model: currentModel,
		cwd: "/tmp/project",
		hasUI: true,
		ui: {
			theme: { fg: (_color: string, text: string) => text },
			setStatus(key: string, value: string | undefined) {
				statuses.push([key, value]);
			},
			notify(message: string) {
				notifications.push(message);
			},
			setWorkingMessage(message?: string) {
				workingMessages.push(message);
			},
		},
		getContextUsage() {
			return { tokens: 20_000, contextWindow: 272_000, percent: 7.4 };
		},
		sessionManager: {
			getBranch() {
				return entries;
			},
			getEntries() {
				return entries;
			},
		},
		modelRegistry: {
			find(provider: string, id: string) {
				return models.get(`${provider}/${id}`);
			},
			async complete(model: any, requestContext: any, options: any) {
				assert.equal(model.id, "gpt-5.6-luna");
				classifierProviders.push(model.provider);
				assert.equal(options.reasoning, "minimal");
				assert.equal(options.maxTokens, 512);
				assert.equal(options.cacheRetention, "none");
				assert.match(requestContext.messages[0].content[0].text, /<request>/);
				classifierCalls++;
				return classifications[Math.min(responseIndex++, classifications.length - 1)];
			},
		},
	};

	openAIAutoProfile(pi as never);
	return {
		commands,
		context,
		entries,
		handlers,
		notifications,
		statuses,
		workingMessages,
		get classifierCalls() {
			return classifierCalls;
		},
		classifierProviders,
		get modelId() {
			return currentModel.id;
		},
		get providerId() {
			return currentModel.provider;
		},
		get thinkingLevel() {
			return thinkingLevel;
		},
	};
}

test("parses strict classifier output and rejects invalid profiles", () => {
	assert.deepEqual(parseClassification('{"task":"complex","confidence":0.8,"rationale":"multi-file"}'), {
		task: "complex",
		confidence: 0.8,
		rationale: "multi-file",
	});
	assert.equal(parseClassification('{"task":"fast","confidence":1}'), undefined);
	assert.equal(parseClassification("not json"), undefined);
});

test("keeps Sol sticky but upgrades Terra when later work becomes complex", () => {
	const economy: AutoProfileDecision = resolveAutoDecision(
		{ task: "economy", confidence: 0.95, rationale: "bounded" },
		undefined,
		false,
	);
	assert.deepEqual({ modelId: economy.modelId, effort: economy.effort }, { modelId: "gpt-5.6-terra", effort: "medium" });

	const solRoutine = resolveAutoDecision(
		{ task: "economy", confidence: 0.99, rationale: "small" },
		"gpt-5.6-sol",
		false,
	);
	assert.equal(solRoutine.modelId, "gpt-5.6-sol");
	assert.equal(solRoutine.effort, "medium");

	const upgraded = resolveAutoDecision(
		{ task: "complex", confidence: 0.9, rationale: "debugging" },
		"gpt-5.6-terra",
		false,
	);
	assert.equal(upgraded.modelId, "gpt-5.6-sol");
	assert.equal(upgraded.effort, "high");

	const risky = resolveAutoDecision(
		{ task: "economy", confidence: 0.99, rationale: "small production change" },
		undefined,
		true,
	);
	assert.equal(risky.modelId, "gpt-5.6-sol");
	assert.equal(risky.effort, "high");
});

test("classifies every turn, selects Terra first, then upgrades to Sol", async () => {
	const h = harness([assistantClassification("economy", 0.96), assistantClassification("complex", 0.9)]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Rename this local variable" }, h.context);
	assert.equal(h.classifierCalls, 1);
	assert.equal(h.modelId, "gpt-5.6-terra");
	assert.equal(h.thinkingLevel, "medium");

	await h.handlers.get("before_agent_start")?.({ prompt: "Now debug the cross-service race" }, h.context);
	assert.equal(h.classifierCalls, 2);
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.thinkingLevel, "high");
	assert.equal(h.entries.filter((entry) => entry.customType === "openai-auto-profile").length, 2);
});

test("shows animated classification feedback until routing completes", async () => {
	let resolveClassification: (message: any) => void = () => {};
	const pending = new Promise<any>((resolve) => {
		resolveClassification = resolve;
	});
	const h = harness([pending]);
	await h.handlers.get("session_start")?.({}, h.context);
	const routing = h.handlers.get("before_agent_start")?.({ prompt: "Small change" }, h.context);
	await Promise.resolve();

	assert.match(h.statuses.at(-1)?.[1] ?? "", /classifying/i);
	assert.match(h.workingMessages.at(-1) ?? "", /classifying/i);

	resolveClassification(assistantClassification("routine"));
	await routing;
	assert.match(h.statuses.at(-1)?.[1] ?? "", /auto api\/sol:medium/i);
	assert.equal(h.workingMessages.at(-1), undefined);
});

test("keeps Codex for both classification and selected main model", async () => {
	const h = harness([assistantClassification("economy", 0.96)], "openai-codex");
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Rename this variable" }, h.context);
	assert.deepEqual(h.classifierProviders, ["openai-codex"]);
	assert.equal(h.providerId, "openai-codex");
	assert.equal(h.modelId, "gpt-5.6-terra");
});

test("session provider preference can explicitly switch locked API back to Codex auto", async () => {
	const h = harness([assistantClassification("routine")], "openai");
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("thinking_level_select")?.({ level: "high", previousLevel: "medium" }, h.context);
	await h.commands.get("profile").handler("auto codex", h.context);
	assert.equal(h.providerId, "openai-codex");

	await h.handlers.get("before_agent_start")?.({ prompt: "Focused implementation" }, h.context);
	assert.deepEqual(h.classifierProviders, ["openai-codex"]);
	assert.equal(h.providerId, "openai-codex");
});

test("falls back to Sol high when classifier output is invalid", async () => {
	const invalid = assistantClassification("routine");
	invalid.content[0].text = "not json";
	const h = harness([invalid]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Ambiguous request" }, h.context);
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.thinkingLevel, "high");
	assert.equal(h.notifications.filter((message) => /classifier failed/.test(message)).length, 1);
	assert.equal(h.entries.at(-1).data.classifierUsage.totalTokens, 120);
});

test("manual profile locks model and effort until auto is restored", async () => {
	const h = harness([assistantClassification("critical")]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("sol:medium", h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Production security migration" }, h.context);
	assert.equal(h.classifierCalls, 0);
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.thinkingLevel, "medium");

	await h.commands.get("profile").handler("auto", h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Production security migration" }, h.context);
	assert.equal(h.classifierCalls, 1);
	assert.equal(h.thinkingLevel, "xhigh");
});

test("external thinking changes create a manual lock", async () => {
	const h = harness();
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("thinking_level_select")?.({ level: "high", previousLevel: "medium" }, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Tiny edit" }, h.context);
	assert.equal(h.classifierCalls, 0);
});

test("restores profile state when navigating session branches", async () => {
	const h = harness([assistantClassification("routine"), assistantClassification("complex")]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "First request" }, h.context);
	await h.handlers.get("thinking_level_select")?.({ level: "high", previousLevel: "medium" }, h.context);
	h.entries.pop();

	await h.handlers.get("session_tree")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Branched request" }, h.context);
	assert.equal(h.classifierCalls, 2);
});

test("repeated tool failures escalate effort and Terra model", async () => {
	const h = harness([assistantClassification("economy", 0.98)]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Small test update" }, h.context);
	assert.equal(h.modelId, "gpt-5.6-terra");

	await h.handlers.get("tool_result")?.({ toolName: "bash", isError: true, content: [{ type: "text", text: "test failed" }] }, h.context);
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.thinkingLevel, "high");
});
