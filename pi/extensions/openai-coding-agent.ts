import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type ProfileState = {
	active: boolean;
	modelId?: string;
	provider?: string;
	api?: string;
	thinkingLevel?: string;
};

type PayloadRecord = Record<string, unknown>;

const STATUS_KEY = "openai-agent";
const TARGET_MODEL_PATTERNS = [/^gpt-5\.[456](?:$|-)/, /codex/i];
const SUPPORTED_PROVIDERS = new Set(["openai", "openai-codex", "azure-openai-responses"]);
const SUPPORTED_APIS = new Set(["openai-responses", "openai-codex-responses", "azure-openai-responses"]);

function isRecord(value: unknown): value is PayloadRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function getCurrentModelInfo(ctx: ExtensionContext) {
	const model = ctx.model;
	const provider = typeof model?.provider === "string" ? model.provider : undefined;
	const api = typeof model?.api === "string" ? model.api : undefined;
	const modelId = typeof model?.id === "string" ? model.id : undefined;
	return { model, provider, api, modelId };
}

function isActiveForContext(ctx: ExtensionContext) {
	const { model, modelId, provider, api } = getCurrentModelInfo(ctx);
	return (
		model?.reasoning === true &&
		!!modelId &&
		TARGET_MODEL_PATTERNS.some((pattern) => pattern.test(modelId)) &&
		!!provider &&
		SUPPORTED_PROVIDERS.has(provider) &&
		!!api &&
		SUPPORTED_APIS.has(api)
	);
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
			"Do not use shell commands or scripts to edit the file.",
		].join(" "),
	};

	return Array.isArray(content) ? [...content, hint] : [hint];
}

function buildReport(state: ProfileState) {
	return [
		`OpenAI native controls: ${state.active ? "active" : "inactive"}`,
		`model: ${state.provider && state.modelId ? `${state.provider}/${state.modelId}` : "unknown"}`,
		`api: ${state.api ?? "unknown"}`,
		`Pi thinking level: ${state.thinkingLevel ?? "unknown"}`,
		"reasoning payload: provider-managed",
		"text verbosity: provider-managed",
	].join("\n");
}

function applyStatus(ctx: ExtensionContext, state: ProfileState) {
	if (!ctx.hasUI) return;
	if (!state.active) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	const theme = ctx.ui.theme;
	const badge = theme.fg("accent", "openai");
	const details = theme.fg("dim", ` ${state.modelId}:${state.thinkingLevel ?? "default"}`);
	ctx.ui.setStatus(STATUS_KEY, `${badge}${details}`);
}

export const __openaiCodingAgentInternals = {
	appendEditRetryHint,
	buildReport,
	isActiveForContext,
	isEditUniquenessError,
};

export default function openaiCodingAgentExtension(pi: ExtensionAPI) {
	const state: ProfileState = { active: false };

	const syncState = (ctx: ExtensionContext) => {
		const { provider, api, modelId } = getCurrentModelInfo(ctx);
		state.active = isActiveForContext(ctx);
		state.provider = provider;
		state.api = api;
		state.modelId = modelId;
		state.thinkingLevel = String(pi.getThinkingLevel());
		applyStatus(ctx, state);
	};

	pi.on("session_start", (_event, ctx) => {
		syncState(ctx);
	});

	pi.on("model_select", (_event, ctx) => {
		syncState(ctx);
	});

	pi.on("thinking_level_select", (_event, ctx) => {
		syncState(ctx);
	});

	pi.on("before_agent_start", (_event, ctx) => {
		syncState(ctx);
	});

	pi.on("tool_result", (event) => {
		if (event.toolName !== "edit" || !event.isError || !isEditUniquenessError(event.content)) return;
		return { content: appendEditRetryHint(event.content) };
	});

	pi.registerCommand("openai-agent", {
		description: "Show provider-native OpenAI reasoning status",
		handler: async (_args, ctx) => {
			syncState(ctx);
			const report = buildReport(state);
			if (ctx.hasUI) {
				ctx.ui.notify(report, "info");
			} else {
				console.log(report);
			}
		},
	});
}
