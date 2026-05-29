import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type TurnMode = "execution" | "review" | "research" | "planning";
type Verbosity = "low" | "medium" | "high";
type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type ProfileState = {
	active: boolean;
	modelId?: string;
	provider?: string;
	api?: string;
	agentRunActive: boolean;
	mode?: TurnMode;
	highStakes: boolean;
	manualThinking?: ThinkingLevel;
	reasoningEffort?: ReasoningEffort;
	verbosity?: Verbosity;
	reasoningSummary?: "concise";
	lastPrompt?: string;
	lastReasoningDrops: number;
	lastPayloadTouched: boolean;
};

type PayloadRecord = Record<string, unknown>;

const STATUS_KEY = "openai-agent";
const TARGET_MODEL_PATTERNS = [/^gpt-5\.[45](?:$|-)/, /codex/i];
const SUPPORTED_APIS = new Set(["openai-responses", "openai-codex-responses", "azure-openai-responses"]);
const REASONING_ORDER: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh"];
const HIGH_STAKES_TERMS = [
	"security",
	"authentication",
	"authorization",
	"encryption",
	"secrets",
	"credentials",
	"payments",
	"billing",
	"production",
	"migration",
	"database",
	"schema",
	"terraform",
	"kubernetes",
	"rollback",
	"incident",
	"data loss",
];
const MODE_PATTERNS: Record<TurnMode, RegExp[]> = {
	execution: [
		/\bimplement\b/i,
		/\bimplementation\b/i,
		/\bbuild\b/i,
		/\bcreate\b/i,
		/\badd\b/i,
		/\bedit\b/i,
		/\bupdate\b/i,
		/\bchange\b/i,
		/\brefactor\b/i,
		/\bwire\b/i,
		/\bpatch\b/i,
		/\bmodify\b/i,
		/\bship\b/i,
	],
	review: [
		/\breview\b/i,
		/\bdebug\b/i,
		/\bdebugging\b/i,
		/\bdiagnose\b/i,
		/\bdiagnostic\b/i,
		/\broot cause\b/i,
		/\baudit\b/i,
		/\binspect\b/i,
		/\bfailing\b/i,
		/\bfailure\b/i,
		/\bbug\b/i,
		/\berror\b/i,
		/\bregression\b/i,
		/\btrace\b/i,
	],
	research: [
		/\bresearch\b/i,
		/\binvestigate\b/i,
		/\bexplore\b/i,
		/\bcompare\b/i,
		/\bcomparison\b/i,
		/\bbenchmark\b/i,
		/\bexplain\b/i,
		/\bunderstand\b/i,
		/\banalyze\b/i,
		/\banalysis\b/i,
		/\bpros\s+and\s+cons\b/i,
		/\btradeoffs?\b/i,
		/\bwhat is\b/i,
		/\bhow does\b/i,
	],
	planning: [
		/\bplan\b/i,
		/\bplanning\b/i,
		/\bapproach\b/i,
		/\barchitecture\b/i,
		/\barchitectural\b/i,
		/\bdesign\b/i,
		/\broadmap\b/i,
		/\bstrategy\b/i,
		/\boutline\b/i,
		/\bspec\b/i,
		/\bproposal\b/i,
		/\bdecision\b/i,
		/\bshould we\b/i,
		/\boptions\b/i,
	],
};

function isRecord(value: unknown): value is PayloadRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function clonePayload<T>(value: T): T {
	try {
		return structuredClone(value);
	} catch {
		return value;
	}
}

function getCurrentModelInfo(ctx: ExtensionContext) {
	const model = ctx.model;
	const provider = typeof model?.provider === "string" ? model.provider : undefined;
	const api = typeof model?.api === "string" ? model.api : undefined;
	const modelId = typeof model?.id === "string" ? model.id : undefined;
	return { model, provider, api, modelId };
}

function isActiveForContext(ctx: ExtensionContext) {
	const { modelId, api } = getCurrentModelInfo(ctx);
	return (
		!!modelId && TARGET_MODEL_PATTERNS.some((pattern) => pattern.test(modelId)) && !!api && SUPPORTED_APIS.has(api)
	);
}

function countMatches(text: string, patterns: RegExp[]) {
	let count = 0;
	for (const pattern of patterns) {
		if (pattern.test(text)) count++;
	}
	return count;
}

function classifyMode(prompt: string): TurnMode {
	const text = prompt.toLowerCase();
	const scores: Record<TurnMode, number> = {
		execution: countMatches(text, MODE_PATTERNS.execution),
		review: countMatches(text, MODE_PATTERNS.review),
		research: countMatches(text, MODE_PATTERNS.research),
		planning: countMatches(text, MODE_PATTERNS.planning),
	};

	const ranking: TurnMode[] = ["planning", "review", "research", "execution"];
	let best: TurnMode = "execution";
	let bestScore = scores.execution;
	for (const mode of ranking) {
		const score = scores[mode];
		if (score > bestScore || (score === bestScore && ranking.indexOf(mode) < ranking.indexOf(best))) {
			best = mode;
			bestScore = score;
		}
	}
	return bestScore > 0 ? best : "execution";
}

function isHighStakes(prompt: string) {
	const text = prompt.toLowerCase();
	return HIGH_STAKES_TERMS.some((term) => text.includes(term));
}

function floorFromThinkingLevel(level: ThinkingLevel): ReasoningEffort {
	switch (level) {
		case "off":
			return "none";
		case "minimal":
			return "low";
		case "low":
			return "low";
		case "medium":
			return "medium";
		case "high":
			return "high";
		case "xhigh":
			return "xhigh";
	}
}

function maxReasoning(a: ReasoningEffort, b: ReasoningEffort): ReasoningEffort {
	return REASONING_ORDER[Math.max(REASONING_ORDER.indexOf(a), REASONING_ORDER.indexOf(b))] ?? a;
}

function bumpReasoning(effort: ReasoningEffort): ReasoningEffort {
	const index = REASONING_ORDER.indexOf(effort);
	return REASONING_ORDER[Math.min(index + 1, REASONING_ORDER.length - 1)] ?? effort;
}

function baseProfileForMode(mode: TurnMode): { reasoningEffort: ReasoningEffort; verbosity: Verbosity } {
	switch (mode) {
		case "execution":
			return { reasoningEffort: "none", verbosity: "low" };
		case "review":
			return { reasoningEffort: "low", verbosity: "low" };
		case "research":
		case "planning":
			return { reasoningEffort: "medium", verbosity: "medium" };
	}
}

function computeProfile(prompt: string, manualThinking: ThinkingLevel) {
	const mode = classifyMode(prompt);
	const stakes = isHighStakes(prompt);
	const base = baseProfileForMode(mode);
	const bumped = stakes ? bumpReasoning(base.reasoningEffort) : base.reasoningEffort;
	const reasoningEffort = maxReasoning(bumped, floorFromThinkingLevel(manualThinking));
	const reasoningSummary = reasoningEffort === "none" ? undefined : "concise";

	return {
		mode,
		highStakes: stakes,
		manualThinking,
		reasoningEffort,
		verbosity: base.verbosity,
		reasoningSummary,
	};
}

function isResponsesPayload(payload: unknown): payload is PayloadRecord {
	return isRecord(payload) && Array.isArray(payload.input);
}

function getPayloadVerbosity(payload: PayloadRecord): string | undefined {
	if (!isRecord(payload.text)) return undefined;
	return typeof payload.text.verbosity === "string" ? payload.text.verbosity : undefined;
}

function setPayloadVerbosity(payload: PayloadRecord, verbosity: Verbosity) {
	const nextText = isRecord(payload.text) ? { ...payload.text } : {};
	nextText.verbosity = verbosity;
	payload.text = nextText;
}

function setPayloadReasoning(
	payload: PayloadRecord,
	reasoningEffort: ReasoningEffort,
	reasoningSummary: "concise" | undefined,
) {
	if (reasoningEffort === "none") {
		payload.reasoning = { effort: "none" };
		return;
	}

	payload.reasoning = {
		effort: reasoningEffort,
		summary: reasoningSummary ?? "concise",
	};

	const include = Array.isArray(payload.include) ? [...payload.include] : [];
	if (!include.includes("reasoning.encrypted_content")) {
		include.push("reasoning.encrypted_content");
	}
	payload.include = include;
}

function isReasoningItem(item: unknown) {
	return isRecord(item) && item.type === "reasoning";
}

function isReasoningFollower(item: unknown) {
	return isRecord(item) && (item.type === "message" || item.type === "function_call");
}

function sanitizeOrphanReasoningItems(input: unknown[]) {
	const sanitized: unknown[] = [];
	let dropped = 0;

	for (let i = 0; i < input.length; i++) {
		const item = input[i];
		if (!isReasoningItem(item)) {
			sanitized.push(item);
			continue;
		}

		let end = i;
		while (end < input.length && isReasoningItem(input[end])) {
			end++;
		}

		const follower = input[end];
		if (isReasoningFollower(follower)) {
			sanitized.push(...input.slice(i, end));
		} else {
			dropped += end - i;
		}

		i = end - 1;
	}

	return { sanitized, dropped };
}

function buildSystemContract() {
	return [
		"GPT-5/Codex caveman + tool contract:",
		"- Talk terse like smart caveman. Technical substance stay. Fluff die.",
		"- Active every response unless user says `stop caveman` or `normal mode`.",
		"- Default direct execution. Keep scope tight. Short progress notes.",
		"- Use tools decisively for implementation work. No long narrated reasoning.",
		"- Ask only when blocked by ambiguity or risk.",
		"- File edits: use edit for existing text files. Use write only for new files or full overwrite.",
		"- Never use bash, Python, Perl, Ruby, Node, sed -i, tee, cat, echo, or redirection to mutate project files.",
		"- Bash is for inspection, search, tests, formatters, package commands, and temp scratch files under /tmp only.",
		"- If edit needs exact oldText, read the file or narrow region first, then call edit with path and edits[].",
		"- edit oldText must match exactly once. For repeated snippets, include nearest stable parent/context lines before and after.",
		"- If edit says oldText is not unique, immediately read that file region and retry edit with more surrounding context.",
		"- If edit fails, read affected lines and retry edit. Do not switch to shell rewrite.",
		"- Multiple changes in one file: one edit call with multiple edits[]. Each oldText must be unique; give each repeated block distinct context.",
		"- Code changes: focused edits, validate when practical, brief result + follow-ups.",
		"- Review/debug/plan/research: structured, concrete, still terse.",
		"- Drop articles, filler, pleasantries, hedging. Fragments OK. Short words. Technical terms exact. Code blocks unchanged.",
		"- Use normal clarity for security warnings, irreversible actions, risky multi-step sequences, or when user asks to clarify.",
		"- No hidden chain-of-thought. If rationale needed, keep it short and decision-focused.",
	].join("\n");
}

function truncatePrompt(prompt: string | undefined, max = 120) {
	if (!prompt) return undefined;
	return prompt.length <= max ? prompt : `${prompt.slice(0, max - 1)}…`;
}

function buildStatusText(ctx: ExtensionContext, state: ProfileState) {
	const theme = ctx.ui.theme;
	const badge = theme.fg("accent", "g5/codex");
	if (!state.active) return undefined;
	if (!state.mode || !state.reasoningEffort || !state.verbosity) {
		return `${badge}${theme.fg("dim", " ready")}`;
	}
	const tail = `${state.mode}:${state.reasoningEffort}/${state.verbosity}`;
	const suffix = state.highStakes ? theme.fg("warning", " !") : "";
	return `${badge}${theme.fg("dim", ` ${tail}`)}${suffix}`;
}

function applyStatus(ctx: ExtensionContext, state: ProfileState) {
	if (!ctx.hasUI) return;
	ctx.ui.setStatus(STATUS_KEY, buildStatusText(ctx, state));
}

function isEditUniquenessError(content: unknown) {
	const text = Array.isArray(content)
		? content.map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : "")).join("\n")
		: "";

	return text.includes("Each oldText must be unique") || text.includes("oldText must match a unique");
}

function appendEditRetryHint(content: unknown) {
	const hint = {
		type: "text",
		text: [
			"Next action: use read on this file around the repeated matches, then retry edit with oldText that includes enough surrounding context to match exactly once.",
			"Do not use bash, Python, Perl, Ruby, Node, sed, tee, cat, echo, or redirection to edit the file.",
		].join(" "),
	};

	return Array.isArray(content) ? [...content, hint] : [hint];
}

function buildReport(state: ProfileState) {
	const lines = [
		`openai coding agent extension: ${state.active ? "active" : "inactive"}`,
		`model: ${state.provider && state.modelId ? `${state.provider}/${state.modelId}` : "unknown"}`,
		`api: ${state.api ?? "unknown"}`,
		`agent run: ${state.agentRunActive ? "active" : "idle"}`,
		`mode: ${state.mode ?? "n/a"}`,
		`high-stakes: ${state.highStakes ? "yes" : "no"}`,
		`manual thinking: ${state.manualThinking ?? "unknown"}`,
		`reasoning effort: ${state.reasoningEffort ?? "n/a"}`,
		`verbosity: ${state.verbosity ?? "n/a"}`,
		`reasoning summary: ${state.reasoningSummary ?? "off"}`,
		`last payload touched: ${state.lastPayloadTouched ? "yes" : "no"}`,
		`last orphan reasoning drops: ${state.lastReasoningDrops}`,
	];
	if (state.lastPrompt) lines.push(`last prompt: ${state.lastPrompt}`);
	return lines.join("\n");
}

export const __openaiCodingAgentInternals = {
	classifyMode,
	computeProfile,
	sanitizeOrphanReasoningItems,
	setPayloadReasoning,
	setPayloadVerbosity,
	getPayloadVerbosity,
	buildSystemContract,
	isEditUniquenessError,
	appendEditRetryHint,
	floorFromThinkingLevel,
	bumpReasoning,
	maxReasoning,
	isHighStakes,
};

export default function openaiCodingAgentExtension(pi: ExtensionAPI) {
	const state: ProfileState = {
		active: false,
		agentRunActive: false,
		highStakes: false,
		lastReasoningDrops: 0,
		lastPayloadTouched: false,
	};

	const syncActivationState = (ctx: ExtensionContext) => {
		const { provider, api, modelId } = getCurrentModelInfo(ctx);
		state.active = isActiveForContext(ctx);
		state.provider = provider;
		state.api = api;
		state.modelId = modelId;
		if (!state.active) {
			state.agentRunActive = false;
			state.mode = undefined;
			state.highStakes = false;
			state.manualThinking = undefined;
			state.reasoningEffort = undefined;
			state.verbosity = undefined;
			state.reasoningSummary = undefined;
			state.lastPrompt = undefined;
			state.lastReasoningDrops = 0;
			state.lastPayloadTouched = false;
		}
		applyStatus(ctx, state);
	};

	pi.on("session_start", async (_event, ctx) => {
		syncActivationState(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		syncActivationState(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		syncActivationState(ctx);
		if (!state.active) return;

		const manualThinking = pi.getThinkingLevel() as ThinkingLevel;
		const profile = computeProfile(event.prompt, manualThinking);
		state.agentRunActive = true;
		state.mode = profile.mode;
		state.highStakes = profile.highStakes;
		state.manualThinking = manualThinking;
		state.reasoningEffort = profile.reasoningEffort;
		state.verbosity = profile.verbosity;
		state.reasoningSummary = profile.reasoningSummary;
		state.lastPrompt = truncatePrompt(event.prompt);
		state.lastPayloadTouched = false;
		state.lastReasoningDrops = 0;
		applyStatus(ctx, state);

		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildSystemContract()}`,
		};
	});

	pi.on("agent_end", async (_event, ctx) => {
		state.agentRunActive = false;
		applyStatus(ctx, state);
	});

	pi.on("tool_result", async (event) => {
		if (event.toolName !== "edit" || !event.isError || !isEditUniquenessError(event.content)) return;

		return { content: appendEditRetryHint(event.content) };
	});

	pi.on("before_provider_request", (event, ctx) => {
		syncActivationState(ctx);
		if (!state.active || !state.agentRunActive || !state.reasoningEffort || !state.verbosity) {
			return;
		}
		if (!isResponsesPayload(event.payload)) {
			return;
		}

		const payload = clonePayload(event.payload);
		if (!isResponsesPayload(payload)) {
			return;
		}

		const currentVerbosity = getPayloadVerbosity(payload);
		const shouldSetVerbosity =
			currentVerbosity === undefined || (state.api === "openai-codex-responses" && currentVerbosity === "medium");
		if (shouldSetVerbosity) {
			setPayloadVerbosity(payload, state.verbosity);
		}

		setPayloadReasoning(payload, state.reasoningEffort, state.reasoningSummary);

		const { sanitized, dropped } = sanitizeOrphanReasoningItems(payload.input as unknown[]);
		if (dropped > 0) {
			payload.input = sanitized;
		}

		state.lastReasoningDrops = dropped;
		state.lastPayloadTouched = true;
		applyStatus(ctx, state);
		return payload;
	});

	pi.registerCommand("openai-agent", {
		description: "Show OpenAI coding agent extension status",
		getArgumentCompletions: (prefix) => {
			const items = ["status", "verbose"].filter((item) => item.startsWith(prefix));
			return items.length > 0 ? items.map((item) => ({ value: item, label: item })) : null;
		},
		handler: async (_args, ctx) => {
			syncActivationState(ctx);
			const report = buildReport(state);
			if (ctx.hasUI) {
				const summary = state.active
					? `openai-agent ${state.mode ?? "ready"} ${state.reasoningEffort ?? "n/a"}/${state.verbosity ?? "n/a"}`
					: "openai-agent inactive";
				ctx.ui.notify(summary, "info");
			} else {
				console.log(report);
			}
		},
	});
}
