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

function harness(
	classifications: any[] = [assistantClassification("routine")],
	initialProvider = "openai",
	initialModelId = "gpt-5.6-sol",
) {
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
	models.set("openai/gpt-6-astra", {
		id: "gpt-6-astra",
		provider: "openai",
		api: "openai-responses",
		reasoning: true,
	});
	let currentModel = models.get(`${initialProvider}/${initialModelId}`)!;
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
			pi.setThinkingLevel(thinkingLevel);
			await handlers.get("model_select")?.({ model, previousModel, source: "set" }, context);
			return true;
		},
		getThinkingLevel() {
			return thinkingLevel;
		},
		setThinkingLevel(level: string) {
			if (currentModel.id === "gpt-6-astra" && level === "minimal") level = "low";
			const previousLevel = thinkingLevel;
			thinkingLevel = level;
			if (level !== previousLevel) handlers.get("thinking_level_select")?.({ level, previousLevel }, context);
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
		models,
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

test("supports explicit Astra profiles on API and future Codex without classification", async () => {
	for (const profile of ["astra:high", "api/astra:high", "codex/astra:high"]) {
		const h = harness();
		h.models.set("openai-codex/gpt-6-astra", {
			...h.models.get("openai/gpt-6-astra")!,
			provider: "openai-codex",
			api: "openai-codex-responses",
		});
		await h.handlers.get("session_start")?.({}, h.context);
		await h.commands.get("profile").handler(profile, h.context);
		await h.handlers.get("before_agent_start")?.({ prompt: "Small change" }, h.context);

		assert.equal(h.modelId, "gpt-6-astra", profile);
		assert.equal(h.providerId, profile.startsWith("codex/") ? "openai-codex" : "openai");
		assert.equal(h.thinkingLevel, "high");
		assert.equal(h.classifierCalls, 0);
		assert.match(h.statuses.at(-1)?.[1] ?? "", /locked (api|codex)\/astra:high/);
		assert.equal(h.entries.at(-1).data.sessionModelId, "gpt-6-astra");
	}
});

test("auto Astra selects model once and only reclassifies thinking on later prompts", async () => {
	for (const command of ["auto api/astra", "auto codex/astra", "auto astra"]) {
		const invalid = assistantClassification("routine");
		invalid.content[0].text = "not json";
		const h = harness([assistantClassification("economy"), assistantClassification("critical"), invalid], "openai-codex");
		h.models.set("openai-codex/gpt-6-astra", {
			...h.models.get("openai/gpt-6-astra")!,
			provider: "openai-codex",
			api: "openai-codex-responses",
		});
		const provider = command === "auto api/astra" ? "openai" : "openai-codex";
		await h.handlers.get("session_start")?.({}, h.context);
		await h.commands.get("profile").handler("sol:high", h.context);
		await h.commands.get("profile").handler(command, h.context);
		assert.equal(h.modelId, "gpt-6-astra", command);
		assert.equal(h.providerId, provider);
		assert.equal(h.thinkingLevel, "high");
		assert.equal(h.classifierCalls, 0);
		assert.equal(h.entries.at(-1).data.mode, "auto");

		for (const effort of ["medium", "xhigh", "high"]) {
			await h.handlers.get("session_start")?.({ reason: "reload" }, h.context);
			await h.handlers.get("before_agent_start")?.({ prompt: "Next task" }, h.context);
			assert.equal(h.modelId, "gpt-6-astra", command);
			assert.equal(h.providerId, provider);
			assert.equal(h.thinkingLevel, effort);
		}
		assert.deepEqual(h.classifierProviders, [provider, provider, provider]);
	}
});

test("auto Codex Astra failure preserves current model, effort, and lock", async () => {
	const h = harness();
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("sol:low", h.context);
	const previousEntries = [...h.entries];
	await h.commands.get("profile").handler("auto codex/astra", h.context);
	assert.equal(h.providerId, "openai");
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.thinkingLevel, "low");
	assert.deepEqual(h.entries, previousEntries);
	assert.match(h.notifications.at(-1) ?? "", /openai-codex\/gpt-6-astra is unavailable/);
	await h.handlers.get("before_agent_start")?.({ prompt: "Continue" }, h.context);
	assert.equal(h.classifierCalls, 0);
});

test("bare auto snapshots the current provider/model and persists thinking-only mode", async () => {
	const invalid = assistantClassification("routine");
	invalid.content[0].text = "not json";
	const h = harness([assistantClassification("complex"), invalid], "openai-codex", "gpt-5.6-terra");
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("auto", h.context);
	assert.equal(h.entries.at(-1).data.autoScope, "thinking");
	assert.equal(h.entries.at(-1).data.sessionModelId, "gpt-5.6-terra");
	assert.equal(h.entries.at(-1).data.providerId, "openai-codex");
	assert.equal(h.classifierCalls, 0);

	for (const event of ["session_start", "session_tree"]) {
		await h.handlers.get(event)?.({}, h.context);
		await h.handlers.get("before_agent_start")?.({ prompt: "Debug this" }, h.context);
		assert.equal(h.providerId, "openai-codex");
		assert.equal(h.modelId, "gpt-5.6-terra");
		assert.equal(h.thinkingLevel, "high");
		assert.match(h.statuses.at(-1)?.[1] ?? "", /auto-thinking codex\/terra:high/);
	}
});

test("qualified auto pins any supported model, including full model IDs", async () => {
	for (const [command, provider, model] of [
		["auto api/terra", "openai", "gpt-5.6-terra"],
		["auto codex/luna", "openai-codex", "gpt-5.6-luna"],
		["auto openai/gpt-6-astra", "openai", "gpt-6-astra"],
		["auto openai-codex/gpt-5.5", "openai-codex", "gpt-5.5"],
	]) {
		const h = harness([assistantClassification("economy")]);
		h.models.set("openai-codex/gpt-5.5", { ...h.models.get("openai-codex/gpt-5.6-sol")!, id: "gpt-5.5" });
		await h.handlers.get("session_start")?.({}, h.context);
		await h.commands.get("profile").handler(command, h.context);
		assert.equal(h.providerId, provider, command);
		assert.equal(h.modelId, model, command);
		assert.equal(h.entries.at(-1).data.autoScope, "thinking");
		await h.handlers.get("before_agent_start")?.({ prompt: "Small change" }, h.context);
		for (let i = 0; i < 4; i++) {
			await h.handlers.get("tool_result")?.({ toolName: "edit", isError: false }, h.context);
			await h.handlers.get("tool_result")?.({ toolName: "bash", input: { command: "npm test" }, isError: true }, h.context);
		}
		assert.equal(h.providerId, provider, command);
		assert.equal(h.modelId, model, command);
		assert.equal(h.thinkingLevel, "high");
	}
});

test("provider-only auto releases Astra pin and routes within the normal family", async () => {
	for (const provider of ["api", "codex", "openai", "openai-codex"]) {
		const expectedProvider = provider === "api" || provider === "openai" ? "openai" : "openai-codex";
		const h = harness([assistantClassification("complex"), assistantClassification("economy")]);
		await h.handlers.get("session_start")?.({}, h.context);
		await h.commands.get("profile").handler("auto api/astra", h.context);
		await h.commands.get("profile").handler(`auto ${provider}`, h.context);
		assert.equal(h.providerId, expectedProvider);
		assert.equal(h.modelId, "gpt-5.6-sol");
		assert.equal(h.entries.at(-1).data.autoScope, "family");
		for (const model of ["gpt-5.6-sol", "gpt-5.6-terra"]) {
			await h.handlers.get("session_start")?.({ reason: "reload" }, h.context);
			await h.handlers.get("before_agent_start")?.({ prompt: "Next task" }, h.context);
			assert.equal(h.modelId, model);
			assert.equal(h.providerId, expectedProvider);
			assert.match(h.statuses.at(-1)?.[1] ?? "", /auto-family/);
		}
		await h.commands.get("profile").handler("status", h.context);
		assert.match(h.notifications.at(-1) ?? "", /auto scope: family/);
	}
});

test("bare auto after family routing pins the last actual selection", async () => {
	const h = harness([assistantClassification("economy"), assistantClassification("complex")]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("auto api", h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Small change" }, h.context);
	assert.equal(h.modelId, "gpt-5.6-terra");
	await h.commands.get("profile").handler("auto", h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Debug race" }, h.context);
	assert.equal(h.modelId, "gpt-5.6-terra");
	assert.equal(h.thinkingLevel, "high");
});

test("older saved profiles retain family routing except for explicitly selected Astra", async () => {
	for (const [modelId, expectedScope] of [["gpt-5.6-terra", "family"], ["gpt-6-astra", "thinking"]]) {
		const h = harness([assistantClassification("complex")], "openai", modelId);
		h.entries.push({
			type: "custom",
			customType: "openai-auto-profile",
			data: { version: 1, mode: "auto", providerId: "openai", sessionModelId: modelId, source: "classifier", effort: "medium" },
		});
		await h.handlers.get("session_start")?.({ reason: "resume" }, h.context);
		await h.commands.get("profile").handler("status", h.context);
		assert.match(h.notifications.at(-1) ?? "", new RegExp(`auto scope: ${expectedScope}`));
		await h.handlers.get("before_agent_start")?.({ prompt: "Complex debugging" }, h.context);
		assert.equal(h.modelId, expectedScope === "thinking" ? modelId : "gpt-5.6-sol");
	}
});

test("family fallback and escalation stay in the selected provider's normal family", async () => {
	const invalid = assistantClassification("routine");
	invalid.content[0].text = "not json";
	const h = harness([invalid, assistantClassification("economy")]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("auto api/astra", h.context);
	await h.commands.get("profile").handler("auto codex", h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Small change" }, h.context);
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.providerId, "openai-codex");
	await h.handlers.get("before_agent_start")?.({ prompt: "Next change" }, h.context);
	assert.equal(h.modelId, "gpt-5.6-terra");
	for (let i = 0; i < 3; i++) {
		await h.handlers.get("tool_result")?.({ toolName: "edit", isError: false }, h.context);
		await h.handlers.get("tool_result")?.({ toolName: "bash", input: { command: "npm test" }, isError: true }, h.context);
	}
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.providerId, "openai-codex");
	assert.equal(h.thinkingLevel, "high");
});

test("invalid auto target leaves current profile unchanged", async () => {
	const h = harness();
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("auto api/terra", h.context);
	const previousEntries = [...h.entries];
	for (const command of ["auto unknown/sol", "auto api/nonexistent", "auto api/astra/extra", "auto api/astra:high"]) {
		await h.commands.get("profile").handler(command, h.context);
		assert.deepEqual(h.entries, previousEntries, command);
		assert.equal(h.providerId, "openai");
		assert.equal(h.modelId, "gpt-5.6-terra");
	}
});

test("Astra profile reports Pi's clamped effort instead of unsupported minimal", async () => {
	const h = harness();
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("astra:minimal", h.context);
	assert.equal(h.modelId, "gpt-6-astra");
	assert.equal(h.thinkingLevel, "low");
	assert.equal(h.entries.length, 1);
	assert.equal(h.entries.at(-1).data.effort, "low");
	assert.match(h.statuses.at(-1)?.[1] ?? "", /locked api\/astra:low/);
	assert.match(h.notifications.at(-1) ?? "", /Profile locked: api\/astra:low/);
});

test("unavailable Codex Astra leaves current selection and auto mode unchanged", async () => {
	const h = harness();
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("codex/astra:high", h.context);
	assert.equal(h.providerId, "openai");
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.thinkingLevel, "medium");
	assert.equal(h.entries.length, 0);
	assert.match(h.notifications.at(-1) ?? "", /openai-codex\/gpt-6-astra is unavailable/);
	await h.handlers.get("before_agent_start")?.({ prompt: "Small change" }, h.context);
	assert.equal(h.classifierCalls, 1);
});

test("automatic profiles never choose Astra without prior selection", async () => {
	for (const task of ["economy", "routine", "complex", "critical"]) {
		const h = harness([assistantClassification(task)]);
		await h.handlers.get("session_start")?.({}, h.context);
		await h.handlers.get("before_agent_start")?.({ prompt: "Do the task" }, h.context);
		assert.notEqual(h.modelId, "gpt-6-astra", task);
	}
});

test("selected Astra stays selected after auto, reload, and classifier failure", async () => {
	const invalid = assistantClassification("routine");
	invalid.content[0].text = "not json";
	const h = harness([assistantClassification("economy"), assistantClassification("critical"), invalid]);
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("astra:high", h.context);
	await h.commands.get("profile").handler("auto", h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Small task" }, h.context);
	assert.equal(h.modelId, "gpt-6-astra");
	assert.equal(h.thinkingLevel, "medium");

	await h.handlers.get("session_start")?.({ reason: "reload" }, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Security review" }, h.context);
	assert.equal(h.modelId, "gpt-6-astra");
	await h.handlers.get("before_agent_start")?.({ prompt: "Continue" }, h.context);
	assert.equal(h.modelId, "gpt-6-astra");
	assert.match(h.notifications.at(-1) ?? "", /using astra high/i);
	assert.deepEqual(h.classifierProviders, ["openai", "openai", "openai"]);
});

test("honors Astra chosen at Pi startup", async () => {
	const h = harness([assistantClassification("economy")], "openai", "gpt-6-astra");
	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Small task" }, h.context);
	assert.equal(h.modelId, "gpt-6-astra");
});

test("Astra verification escalation keeps the model and never lowers effort", async () => {
	for (const task of ["routine", "complex", "critical"]) {
		const h = harness([assistantClassification(task)], "openai", "gpt-6-astra");
		await h.handlers.get("session_start")?.({}, h.context);
		await h.handlers.get("before_agent_start")?.({ prompt: "Work on tests" }, h.context);
		for (let i = 0; i < 4; i++) {
			await h.handlers.get("tool_result")?.({ toolName: "edit", isError: false }, h.context);
			await h.handlers.get("tool_result")?.({ toolName: "bash", input: { command: "npm test" }, isError: true }, h.context);
		}
		assert.equal(h.modelId, "gpt-6-astra", task);
		assert.equal(h.thinkingLevel, task === "critical" ? "xhigh" : "high");
		if (task === "routine") assert.match(h.notifications.at(-1) ?? "", /escalated to astra:high/);
	}
});

test("switching an Astra session to unreleased Codex does not silently change provider or model", async () => {
	const h = harness();
	await h.handlers.get("session_start")?.({}, h.context);
	await h.commands.get("profile").handler("astra:high", h.context);
	await h.commands.get("profile").handler("provider codex", h.context);
	assert.equal(h.providerId, "openai");
	assert.equal(h.modelId, "gpt-6-astra");
	assert.match(h.notifications.at(-1) ?? "", /openai-codex\/gpt-6-astra is unavailable/);
	await h.handlers.get("before_agent_start")?.({ prompt: "Continue" }, h.context);
	assert.equal(h.classifierCalls, 0);

	h.models.set("openai-codex/gpt-6-astra", {
		...h.models.get("openai/gpt-6-astra")!,
		provider: "openai-codex",
		api: "openai-codex-responses",
	});
	await h.commands.get("profile").handler("auto codex/astra", h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Continue" }, h.context);
	assert.equal(h.providerId, "openai-codex");
	assert.equal(h.modelId, "gpt-6-astra");
	assert.deepEqual(h.classifierProviders, ["openai-codex"]);
});

test("parses strict classifier output and rejects invalid profiles", () => {
	assert.deepEqual(parseClassification('{"task":"complex","confidence":0.8,"rationale":"multi-file"}'), {
		task: "complex",
		confidence: 0.8,
		rationale: "multi-file",
	});
	assert.equal(parseClassification('{"task":"fast","confidence":1}'), undefined);
	assert.equal(parseClassification("not json"), undefined);
});

test("family routing chooses Terra or Sol according to task without a model pin", () => {
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
	assert.equal(solRoutine.modelId, "gpt-5.6-terra");
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
	assert.match(h.statuses.at(-1)?.[1] ?? "", /auto-family api\/sol:medium/i);
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

test("expected red tests do not escalate until the same check stalls after two fixes", async () => {
	const h = harness([assistantClassification("economy", 0.98)]);
	const failedCheck = {
		toolName: "bash",
		input: { command: "python3 -m unittest discover -s tests -p 'test_*.py'" },
		isError: true,
		content: [{ type: "text", text: "FAILED (errors=1)\nCommand exited with code 1" }],
	};
	const successfulEdit = { toolName: "edit", input: {}, isError: false, content: [{ type: "text", text: "Updated file" }] };

	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Use red/green TDD for this small change" }, h.context);
	assert.equal(h.modelId, "gpt-5.6-terra");

	await h.handlers.get("tool_result")?.(failedCheck, h.context);
	assert.equal(h.modelId, "gpt-5.6-terra");
	assert.equal(h.thinkingLevel, "medium");

	await h.handlers.get("tool_result")?.(successfulEdit, h.context);
	await h.handlers.get("tool_result")?.(failedCheck, h.context);
	assert.equal(h.modelId, "gpt-5.6-terra");

	await h.handlers.get("tool_result")?.(successfulEdit, h.context);
	await h.handlers.get("tool_result")?.(failedCheck, h.context);
	assert.equal(h.modelId, "gpt-5.6-sol");
	assert.equal(h.thinkingLevel, "high");
	assert.equal(h.notifications.some((message) => /xhigh/.test(message)), false);
});

test("a passing verification resets stalled-check tracking", async () => {
	const h = harness([assistantClassification("economy", 0.98)]);
	const check = (isError: boolean) => ({
		toolName: "bash",
		input: { command: "npm test" },
		isError,
		content: [{ type: "text", text: isError ? "1 test failed" : "10 tests passed" }],
	});
	const edit = { toolName: "edit", input: {}, isError: false, content: [] };

	await h.handlers.get("session_start")?.({}, h.context);
	await h.handlers.get("before_agent_start")?.({ prompt: "Small tested change" }, h.context);
	await h.handlers.get("tool_result")?.(check(true), h.context);
	await h.handlers.get("tool_result")?.(edit, h.context);
	await h.handlers.get("tool_result")?.(check(false), h.context);
	await h.handlers.get("tool_result")?.(check(true), h.context);
	await h.handlers.get("tool_result")?.(edit, h.context);
	await h.handlers.get("tool_result")?.(check(true), h.context);

	assert.equal(h.modelId, "gpt-5.6-terra");
	assert.equal(h.thinkingLevel, "medium");
});
