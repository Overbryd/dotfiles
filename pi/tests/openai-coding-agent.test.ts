import assert from "node:assert/strict";
import test from "node:test";
import openaiCodingAgent from "../extensions/openai-coding-agent.ts";

type Handler = (event: any, context: any) => unknown;

function extensionHarness() {
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, any>();
	const statuses: Array<[string, string | undefined]> = [];
	const pi = {
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		getThinkingLevel() {
			return "medium";
		},
	};
	const context = {
		model: {
			id: "gpt-5.6-sol",
			provider: "openai",
			api: "openai-responses",
			reasoning: true,
		},
		hasUI: true,
		ui: {
			theme: { fg: (_color: string, text: string) => text },
			setStatus(key: string, value: string | undefined) {
				statuses.push([key, value]);
			},
			notify() {},
		},
	};

	openaiCodingAgent(pi as never);
	return { handlers, commands, statuses, context };
}

test("leaves system prompt and provider reasoning payload under Pi control", async () => {
	const { handlers, context } = extensionHarness();
	await handlers.get("session_start")?.({}, context);

	const beforeStart = await handlers.get("before_agent_start")?.(
		{ prompt: "Implement a small change", systemPrompt: "base prompt" },
		context,
	);
	assert.equal(beforeStart, undefined);

	const payload = {
		input: [],
		reasoning: { effort: "medium", context: "all_turns", mode: "standard" },
		text: { verbosity: "medium" },
	};
	const replacement = await handlers.get("before_provider_request")?.({ payload }, context);
	assert.equal(replacement, undefined);
	assert.deepEqual(payload, {
		input: [],
		reasoning: { effort: "medium", context: "all_turns", mode: "standard" },
		text: { verbosity: "medium" },
	});
});

test("adds focused recovery guidance after edit uniqueness errors", async () => {
	const { handlers, context } = extensionHarness();
	const result = await handlers.get("tool_result")?.(
		{
			toolName: "edit",
			isError: true,
			content: [{ type: "text", text: "oldText must match a unique region" }],
		},
		context,
	);

	assert.equal(result.content.length, 2);
	assert.match(result.content[1].text, /use read/);
});

test("reports Pi thinking level without calling it a manual floor", async () => {
	const { commands, context } = extensionHarness();
	assert.equal(commands.has("openai-agent"), true);
	assert.match(commands.get("openai-agent").description, /native/i);
	await commands.get("openai-agent").handler("status", context);
});
