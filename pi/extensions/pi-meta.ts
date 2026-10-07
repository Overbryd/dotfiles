import type {
	Api,
	AssistantMessage,
	Context,
	Message,
	Model,
	ModelThinkingLevel,
	Tool,
} from "@earendil-works/pi-ai";
import {
	BorderedLoader,
	getAgentDir,
	SessionManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type SessionEntry,
	type SessionInfo,
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";

const CONFIG_FILE = "pi-meta.json";
const STATUS_KEY = "pi-meta";
const MAX_TOOL_ROUNDS = 12;
const MAX_SESSION_EXCERPT_CHARS = 18_000;
const MAX_ENTRY_TEXT_CHARS = 800;

export type MetaModelCandidate = {
	provider: string;
	model: string;
	thinking?: ModelThinkingLevel;
};

type MetaConfig = {
	models: MetaModelCandidate[];
};

type SessionRank = {
	path: string;
	id: string;
	name?: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
	snippet: string;
	score: number;
};

type TreeEntrySummary = {
	id: string;
	parentId: string | null;
	type: string;
	role?: string;
	label?: string;
	text: string;
};

export type TreeSearchMatch = {
	entry: TreeEntrySummary;
	ancestors: TreeEntrySummary[];
	score: number;
};

type MetaAction =
	| { type: "switch_session"; path: string; label: string }
	| { type: "navigate_tree"; entryId: string; label: string };

type NavigationFrame = {
	type: "session" | "tree";
	sessionFile: string;
	leafId?: string;
};

type NavigationState = { stack: NavigationFrame[] };

type CompletionRegistry = {
	find(provider: string, modelId: string): Model<Api> | undefined;
	hasConfiguredAuth(model: Model<Api>): boolean;
	complete(model: Model<Api>, context: Context, options?: Record<string, unknown>): Promise<AssistantMessage>;
};

const DEFAULT_CONFIG: MetaConfig = {
	models: [
		{ provider: "openai-codex", model: "gpt-5.6-sol", thinking: "medium" },
		{ provider: "openai", model: "gpt-5.4", thinking: "medium" },
		{ provider: "amazon-bedrock", model: "eu.anthropic.claude-opus-5", thinking: "medium" },
		{ provider: "anthropic", model: "claude-opus-5", thinking: "medium" },
	],
};

const SearchSessionsParameters = Type.Object({
	query: Type.String({ description: "Words or concepts that identify the desired session" }),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
});

const InspectSessionParameters = Type.Object({
	path: Type.String({ description: "Exact path returned by search_sessions" }),
	query: Type.Optional(Type.String({ description: "Optional terms used to select relevant excerpts" })),
});

const SwitchSessionParameters = Type.Object({
	path: Type.String({ description: "Exact session path returned by search_sessions" }),
});

const SearchTreeParameters = Type.Object({
	query: Type.String({ description: "Words or concepts identifying a point in the current session tree" }),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
});

const InspectTreeEntryParameters = Type.Object({
	entryId: Type.String({ description: "Exact entry id returned by search_tree" }),
});

const NavigateTreeParameters = Type.Object({
	entryId: Type.String({ description: "Exact entry id to make the current session leaf" }),
});

const META_TOOLS: Tool[] = [
	{
		name: "search_sessions",
		description: "Search saved sessions for the current working directory. Returns ranked session paths and excerpts.",
		parameters: SearchSessionsParameters,
	},
	{
		name: "inspect_session",
		description: "Inspect one session returned by search_sessions before choosing it.",
		parameters: InspectSessionParameters,
	},
	{
		name: "switch_session",
		description: "Immediately select a saved session. Use the best match; do not ask for confirmation. The user can undo afterward.",
		parameters: SwitchSessionParameters,
	},
	{
		name: "search_tree",
		description: "Search every branch entry in the current session. Results include ancestors so you can choose a response before a matching request.",
		parameters: SearchTreeParameters,
	},
	{
		name: "inspect_tree_entry",
		description: "Inspect an entry and its nearby ancestors and children in the current session tree.",
		parameters: InspectTreeEntryParameters,
	},
	{
		name: "navigate_tree",
		description: "Immediately move the current session to an exact tree entry. Use the best match; do not ask for confirmation. The user can undo afterward.",
		parameters: NavigateTreeParameters,
	},
];

const SYSTEM_PROMPT = `You control the current Pi process from an isolated meta conversation.

Your primary jobs:
- Find and switch to saved sessions in the current working directory.
- Find and navigate to points in any branch of the current session tree.

Use tools instead of guessing. Search broadly, inspect when useful, then always choose the best result and call switch_session or navigate_tree without asking for confirmation. The user can undo navigation with /pi undo.

Interpret relative requests carefully. For example, "the last response before SIDEQUEST" means search for SIDEQUEST, inspect its ancestry, and navigate to the immediately preceding assistant response—not the SIDEQUEST user message.

The meta conversation is not part of the active coding session. Keep responses concise. If the request is not supported by the available tools, explain that limitation rather than pretending to run a slash command.`;

function navigationState(): NavigationState {
	const key = Symbol.for("dotfiles.pi-meta.navigation-state");
	const root = globalThis as unknown as Record<symbol, unknown>;
	if (!root[key]) root[key] = { stack: [] } satisfies NavigationState;
	return root[key] as NavigationState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function readConfig(): MetaConfig {
	const path = join(getAgentDir(), CONFIG_FILE);
	if (!existsSync(path)) return DEFAULT_CONFIG;
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (!isRecord(value) || !Array.isArray(value.models)) return DEFAULT_CONFIG;
		const models: MetaModelCandidate[] = [];
		for (const candidate of value.models) {
			if (!isRecord(candidate) || typeof candidate.provider !== "string" || typeof candidate.model !== "string") continue;
			if (
				candidate.thinking !== undefined &&
				!["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(String(candidate.thinking))
			) continue;
			models.push({
				provider: candidate.provider,
				model: candidate.model,
				thinking: candidate.thinking as ModelThinkingLevel | undefined,
			});
		}
		return models.length > 0 ? { models } : DEFAULT_CONFIG;
	} catch (error) {
		console.error(`pi-meta: failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return DEFAULT_CONFIG;
	}
}

function words(value: string): string[] {
	return [...new Set(value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) ?? [])].filter(
		(word) => word.length > 1,
	);
}

function scoreText(query: string, fields: Array<{ text: string; weight: number }>): number {
	const normalizedQuery = query.trim().toLowerCase();
	const terms = words(query);
	let score = 0;
	for (const field of fields) {
		const text = field.text.toLowerCase();
		if (normalizedQuery && text.includes(normalizedQuery)) score += field.weight * 8;
		for (const term of terms) {
			if (text.includes(term)) score += field.weight;
		}
	}
	return score;
}

function excerptAround(text: string, query: string, maxChars = 500): string {
	const compact = text.replace(/\s+/g, " ").trim();
	if (compact.length <= maxChars) return compact;
	const indexes = words(query)
		.map((term) => compact.toLowerCase().indexOf(term))
		.filter((index) => index >= 0);
	const center = indexes.length > 0 ? Math.min(...indexes) : 0;
	const start = Math.max(0, Math.min(compact.length - maxChars, center - Math.floor(maxChars / 3)));
	return `${start > 0 ? "…" : ""}${compact.slice(start, start + maxChars)}${start + maxChars < compact.length ? "…" : ""}`;
}

export function rankSessions(sessions: SessionInfo[], query: string, limit: number): SessionRank[] {
	return sessions
		.map((session) => ({
			session,
			score: scoreText(query, [
				{ text: session.name ?? "", weight: 12 },
				{ text: session.firstMessage, weight: 7 },
				{ text: session.allMessagesText, weight: 2 },
			]),
		}))
		.filter(({ score }) => score > 0 || !query.trim())
		.sort((left, right) => right.score - left.score || right.session.modified.getTime() - left.session.modified.getTime())
		.slice(0, limit)
		.map(({ session, score }) => ({
			path: session.path,
			id: session.id,
			name: session.name,
			modified: session.modified.toISOString(),
			messageCount: session.messageCount,
			firstMessage: excerptAround(session.firstMessage, query, 300),
			snippet: excerptAround(session.allMessagesText, query),
			score,
		}));
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => (isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : ""))
		.filter(Boolean)
		.join("\n");
}

function entryText(entry: SessionEntry): string {
	if (entry.type === "message") {
		if ("content" in entry.message) return contentText(entry.message.content);
		return "";
	}
	if (entry.type === "compaction" || entry.type === "branch_summary") return entry.summary;
	if (entry.type === "custom_message") return contentText(entry.content);
	if (entry.type === "session_info") return entry.name ?? "";
	return "";
}

function summarizeEntry(entry: SessionEntry, labels: Map<string, string>): TreeEntrySummary {
	return {
		id: entry.id,
		parentId: entry.parentId,
		type: entry.type,
		role: entry.type === "message" && "role" in entry.message ? entry.message.role : undefined,
		label: labels.get(entry.id),
		text: excerptAround(entryText(entry), "", MAX_ENTRY_TEXT_CHARS),
	};
}

function labelMap(entries: SessionEntry[]): Map<string, string> {
	const labels = new Map<string, string>();
	for (const entry of entries) {
		if (entry.type !== "label") continue;
		if (entry.label) labels.set(entry.targetId, entry.label);
		else labels.delete(entry.targetId);
	}
	return labels;
}

export function searchTreeEntries(entries: SessionEntry[], query: string, limit: number): TreeSearchMatch[] {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const labels = labelMap(entries);
	return entries
		.map((entry) => ({
			entry,
			score: scoreText(query, [
				{ text: labels.get(entry.id) ?? "", weight: 12 },
				{ text: entryText(entry), weight: 4 },
			]),
		}))
		.filter(({ score }) => score > 0)
		.sort((left, right) => right.score - left.score || right.entry.timestamp.localeCompare(left.entry.timestamp))
		.slice(0, limit)
		.map(({ entry, score }) => {
			const ancestors: SessionEntry[] = [];
			let parentId = entry.parentId;
			while (parentId && ancestors.length < 5) {
				const parent = byId.get(parentId);
				if (!parent) break;
				ancestors.unshift(parent);
				parentId = parent.parentId;
			}
			return {
				entry: summarizeEntry(entry, labels),
				ancestors: ancestors.map((ancestor) => summarizeEntry(ancestor, labels)),
				score,
			};
		});
}

export async function completeWithFallback(
	registry: CompletionRegistry,
	candidates: MetaModelCandidate[],
	context: Context,
	options: { signal?: AbortSignal } = {},
): Promise<{ response: AssistantMessage; candidate: MetaModelCandidate }> {
	const failures: string[] = [];
	for (const candidate of candidates) {
		const model = registry.find(candidate.provider, candidate.model);
		if (!model || !registry.hasConfiguredAuth(model)) {
			failures.push(`${candidate.provider}/${candidate.model}: unavailable or unauthenticated`);
			continue;
		}
		try {
			const response = await registry.complete(model, context, {
				reasoning: candidate.thinking ?? "medium",
				cacheRetention: "none",
				signal: options.signal,
			});
			if (response.stopReason === "aborted") throw new Error("meta request aborted");
			if (response.stopReason === "error") {
				failures.push(`${candidate.provider}/${candidate.model}: ${response.errorMessage ?? "provider error"}`);
				continue;
			}
			return { response, candidate };
		} catch (error) {
			if (options.signal?.aborted) throw error;
			failures.push(`${candidate.provider}/${candidate.model}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	throw new Error(`No configured meta model succeeded. ${failures.join("; ")}`);
}

function sessionExcerpt(manager: SessionManager, query: string): string {
	const entries = manager.getEntries();
	const ranked = entries
		.map((entry) => ({ entry, score: scoreText(query, [{ text: entryText(entry), weight: 1 }]) }))
		.filter(({ entry, score }) => score > 0 || !query)
		.sort((left, right) => right.score - left.score)
		.slice(0, 30)
		.sort((left, right) => left.entry.timestamp.localeCompare(right.entry.timestamp));
	const selected = ranked.length > 0 ? ranked : entries.slice(-20).map((entry) => ({ entry, score: 0 }));
	return selected
		.map(({ entry }) => JSON.stringify(summarizeEntry(entry, labelMap(entries))))
		.join("\n")
		.slice(0, MAX_SESSION_EXCERPT_CHARS);
}

function textResult(value: unknown): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
	return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function errorResult(message: string) {
	return { ...textResult(message), isError: true };
}

async function executeMetaTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ExtensionCommandContext,
	setAction: (action: MetaAction) => void,
) {
	if (name === "search_sessions") {
		const query = typeof args.query === "string" ? args.query : "";
		const limit = typeof args.limit === "number" ? args.limit : 5;
		return textResult(rankSessions(await SessionManager.list(ctx.cwd), query, limit));
	}

	if (name === "inspect_session" || name === "switch_session") {
		const path = typeof args.path === "string" ? args.path : "";
		const sessions = await SessionManager.list(ctx.cwd);
		const session = sessions.find((candidate) => candidate.path === path);
		if (!session) return errorResult("Session path is not a saved session for the current working directory.");
		if (name === "switch_session") {
			setAction({ type: "switch_session", path, label: session.name || session.firstMessage || session.id });
			return textResult(`Switch scheduled: ${session.name || session.firstMessage || session.id}`);
		}
		const query = typeof args.query === "string" ? args.query : "";
		return textResult({
			path: session.path,
			name: session.name,
			modified: session.modified.toISOString(),
			messageCount: session.messageCount,
			excerpts: sessionExcerpt(SessionManager.open(path), query),
		});
	}

	if (name === "search_tree") {
		const query = typeof args.query === "string" ? args.query : "";
		const limit = typeof args.limit === "number" ? args.limit : 5;
		return textResult(searchTreeEntries(ctx.sessionManager.getEntries(), query, limit));
	}

	if (name === "inspect_tree_entry" || name === "navigate_tree") {
		const entryId = typeof args.entryId === "string" ? args.entryId : "";
		const entries = ctx.sessionManager.getEntries();
		const entry = entries.find((candidate) => candidate.id === entryId);
		if (!entry) return errorResult("Unknown entry id in the current session.");
		if (name === "navigate_tree") {
			const summary = summarizeEntry(entry, labelMap(entries));
			setAction({ type: "navigate_tree", entryId, label: summary.text || `${summary.type} ${summary.id}` });
			return textResult(`Tree navigation scheduled: ${summary.role ?? summary.type} ${summary.text}`);
		}
		const byId = new Map(entries.map((candidate) => [candidate.id, candidate]));
		const nearby: TreeEntrySummary[] = [];
		let current: SessionEntry | undefined = entry;
		for (let count = 0; current && count < 6; count++) {
			nearby.unshift(summarizeEntry(current, labelMap(entries)));
			current = current.parentId ? byId.get(current.parentId) : undefined;
		}
		const children = entries
			.filter((candidate) => candidate.parentId === entry.id)
			.slice(0, 10)
			.map((candidate) => summarizeEntry(candidate, labelMap(entries)));
		return textResult({ ancestorsAndEntry: nearby, children });
	}

	return errorResult(`Unknown meta tool: ${name}`);
}

function responseText(response: AssistantMessage): string {
	return response.content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

async function runMetaTurn(
	ctx: ExtensionCommandContext,
	messages: Message[],
	prompt: string,
	candidates: MetaModelCandidate[],
	signal?: AbortSignal,
): Promise<{ text: string; action?: MetaAction; model: string }> {
	messages.push({ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() });
	let action: MetaAction | undefined;
	let lastModel = "";

	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		const { response, candidate } = await completeWithFallback(
			ctx.modelRegistry as unknown as CompletionRegistry,
			candidates,
			{ systemPrompt: SYSTEM_PROMPT, messages, tools: META_TOOLS },
			{ signal },
		);
		lastModel = `${candidate.provider}/${candidate.model}`;
		messages.push(response);
		const calls = response.content.filter((part) => part.type === "toolCall");
		if (calls.length === 0) return { text: responseText(response) || "Done.", action, model: lastModel };

		for (const call of calls) {
			let result;
			try {
				result = await executeMetaTool(call.name, call.arguments, ctx, (nextAction) => {
					action = nextAction;
				});
			} catch (error) {
				result = errorResult(error instanceof Error ? error.message : String(error));
			}
			messages.push({
				role: "toolResult",
				toolCallId: call.id,
				toolName: call.name,
				content: result.content,
				isError: result.isError ?? false,
				timestamp: Date.now(),
			});
		}
		if (action) return { text: action.label, action, model: lastModel };
	}
	throw new Error(`Meta-agent exceeded ${MAX_TOOL_ROUNDS} tool rounds`);
}

async function applyAction(action: MetaAction, ctx: ExtensionCommandContext): Promise<void> {
	const currentSessionFile = ctx.sessionManager.getSessionFile();
	if (!currentSessionFile) throw new Error("Current session is ephemeral; navigation cannot be undone.");

	if (action.type === "switch_session") {
		const frame: NavigationFrame = { type: "session", sessionFile: currentSessionFile };
		const result = await ctx.switchSession(action.path, {
			withSession: async (replacementCtx) => {
				navigationState().stack.push(frame);
				replacementCtx.ui.notify(`Switched session: ${action.label}\nUndo: /pi undo`, "info");
			},
		});
		if (result.cancelled) ctx.ui.notify("Session switch cancelled", "warning");
		return;
	}

	const leafId = ctx.sessionManager.getLeafId();
	if (!leafId) throw new Error("Current tree position cannot be restored.");
	const result = await ctx.navigateTree(action.entryId, { summarize: false });
	if (!result.cancelled) {
		navigationState().stack.push({ type: "tree", sessionFile: currentSessionFile, leafId });
		ctx.ui.notify(`Navigated tree: ${action.label}\nUndo: /pi undo`, "info");
	}
}

async function undoNavigation(ctx: ExtensionCommandContext): Promise<void> {
	const frame = navigationState().stack.pop();
	if (!frame) {
		ctx.ui.notify("Nothing to undo", "warning");
		return;
	}

	const restoreTree = async (targetCtx: ExtensionCommandContext) => {
		if (!frame.leafId) throw new Error("Previous tree position is unavailable.");
		const result = await targetCtx.navigateTree(frame.leafId, { summarize: false });
		if (result.cancelled) throw new Error("Tree navigation was cancelled.");
		targetCtx.ui.notify("Returned to the previous tree position", "info");
	};

	try {
		if (frame.type === "tree" && ctx.sessionManager.getSessionFile() === frame.sessionFile) {
			await restoreTree(ctx);
			return;
		}
		const result = await ctx.switchSession(frame.sessionFile, {
			withSession: async (replacementCtx) => {
				if (frame.type === "tree") await restoreTree(replacementCtx);
				else replacementCtx.ui.notify("Returned to the previous session", "info");
			},
		});
		if (result.cancelled) throw new Error("Session switch was cancelled.");
	} catch (error) {
		navigationState().stack.push(frame);
		throw error;
	}
}

async function promptWithLoader<T>(ctx: ExtensionCommandContext, task: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
	if (ctx.mode !== "tui") return task(new AbortController().signal);
	const result = await ctx.ui.custom<{ value: T } | { error: string } | undefined>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, "Asking Pi meta-agent...");
		loader.onAbort = () => done(undefined);
		task(loader.signal)
			.then((value) => done({ value }))
			.catch((error) => done({ error: error instanceof Error ? error.message : String(error) }));
		return loader;
	});
	if (result && "error" in result) throw new Error(result.error);
	return result?.value;
}

export default function piMeta(pi: ExtensionAPI) {
	pi.registerCommand("pi", {
		description: "Ask an isolated meta-agent to control Pi sessions and branches",
		getArgumentCompletions: (prefix) =>
			["undo", "back", "help"]
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				console.log("/pi requires interactive UI");
				return;
			}
			const initial = args.trim();
			if (["undo", "back", "switch back"].includes(initial.toLowerCase())) {
				try {
					await undoNavigation(ctx);
				} catch (error) {
					ctx.ui.notify(`Undo failed: ${error instanceof Error ? error.message : String(error)}`, "error");
				}
				return;
			}
			if (initial.toLowerCase() === "help") {
				ctx.ui.notify("/pi <request> starts an isolated session/tree navigation assistant. Escape, /exit, or /quit leaves it. /pi undo (or /pi back) reverses the last navigation.", "info");
				return;
			}

			const messages: Message[] = [];
			const candidates = readConfig().models;
			let prompt = initial || (await ctx.ui.input("Pi meta-agent", "What should Pi do?")) || "";
			while (prompt.trim() && !["/exit", "/quit", "exit", "quit"].includes(prompt.trim().toLowerCase())) {
				ctx.ui.setStatus(STATUS_KEY, "meta");
				let result;
				try {
					result = await promptWithLoader(ctx, (signal) => runMetaTurn(ctx, messages, prompt, candidates, signal));
				} catch (error) {
					ctx.ui.setStatus(STATUS_KEY, undefined);
					ctx.ui.notify(`Pi meta-agent failed: ${error instanceof Error ? error.message : String(error)}`, "error");
					return;
				}
				ctx.ui.setStatus(STATUS_KEY, undefined);
				if (!result) {
					ctx.ui.notify("Pi meta-agent cancelled", "info");
					return;
				}
				if (result.action) {
					try {
						await applyAction(result.action, ctx);
					} catch (error) {
						ctx.ui.notify(`Navigation failed: ${error instanceof Error ? error.message : String(error)}`, "error");
					}
					return;
				}
				ctx.ui.notify(`${result.text}\n\n[${result.model}]`, "info");
				prompt = (await ctx.ui.input("Pi meta-agent", "Follow up, or Escape to return")) || "";
			}
			ctx.ui.setStatus(STATUS_KEY, undefined);
		},
	});
}
