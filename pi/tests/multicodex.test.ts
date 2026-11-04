import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { TouchGrassGate } from "../extensions/touch-grass.ts";
import multicodex, {
	createStreamWrapper,
	formatAccountBar,
	formatOpenAIStatusAdvice,
	formatWorkspaceCredits,
	isCodexDownError,
	isUsageStale,
	parseUsageResponse,
	pickBestAccount,
} from "../extensions/multicodex.ts";

function account(email: string) {
	return {
		email,
		accessToken: "token",
		refreshToken: "refresh",
		expiresAt: Number.MAX_SAFE_INTEGER,
	};
}

function usage(usedPercent: number, balance: string, autoPurchaseRemaining: string, reached = false) {
	return {
		primary: { usedPercent },
		secondary: { usedPercent },
		credits: { hasCredits: Number(balance) > 0, unlimited: false, balance },
		spendControl: {
			reached,
			individualLimit: { remaining: autoPurchaseRemaining },
		},
		fetchedAt: Date.now(),
	};
}

test("aborting a touch-grass wait completes the provider stream", async () => {
	const accountManager = {
		waitUntilReady: async () => {},
		getAvailableManualAccount: () => undefined,
		hasManualAccount: () => false,
		activateBestAccount: async () => undefined,
		getNextStandardQuotaResetAt: () => Date.now() + 60_000,
	};
	const touchGrass = {
		isEnabled: () => true,
		waitUntil: async () => "aborted" as const,
	};
	const wrapped = createStreamWrapper(
		accountManager as never,
		(() => {
			throw new Error("base stream should not start");
		}) as never,
		() => touchGrass as never,
	);
	const stream = wrapped(
		{ api: "openai-codex-responses", provider: "openai-codex", id: "gpt-5.6-luna" } as never,
		{ messages: [] } as never,
	);
	const result = await Promise.race([
		stream.result(),
		new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50)),
	]);

	assert.notEqual(result, "timeout");
	assert.equal(typeof result === "object" ? result.stopReason : undefined, "aborted");
});

test("switching away from openai-codex during a touch-grass pause resumes on the newly selected provider", async () => {
	const gate = new TouchGrassGate();
	let selectedModel: any = { api: "openai-codex-responses", provider: "openai-codex", id: "gpt-6.1-sol", maxTokens: 65_536 };
	const forwardedCalls: Array<{ model: any; options: any }> = [];
	const accountManager = {
		waitUntilReady: async () => {},
		getAvailableManualAccount: () => undefined,
		hasManualAccount: () => false,
		activateBestAccount: async () => undefined,
		getNextStandardQuotaResetAt: () => Date.now() + 60_000,
	};
	const wrapped = createStreamWrapper(
		accountManager as never,
		(() => {
			throw new Error("codex stream should not start");
		}) as never,
		() => gate,
		{
			getSelectedModel: () => selectedModel,
			getThinkingLevel: () => "high",
			streamSelectedModel: (model, _context, options) => {
				forwardedCalls.push({ model, options });
				const redirected = createAssistantMessageEventStream();
				queueMicrotask(() => {
					redirected.push({
						type: "done",
						reason: "stop",
						message: {
							role: "assistant",
							api: model.api,
							provider: model.provider,
							model: model.id,
							content: [{ type: "text", text: "Resumed on Gemini" }],
							usage: {
								input: 10,
								output: 5,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 15,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
							},
							stopReason: "stop",
							timestamp: Date.now(),
						},
					});
					redirected.end();
				});
				return redirected;
			},
		},
	);

	const stream = wrapped(selectedModel, { messages: [] } as never, {
		apiKey: "codex-token",
		headers: { Authorization: "Bearer codex-token" },
		env: { OPENAI_API_KEY: "codex-only" },
		reasoning: "medium",
	});
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.match(gate.getPausedStatus() ?? "", /loop paused/);

	selectedModel = { api: "google-vertex", provider: "google-vertex", id: "gemini-4-argon", maxTokens: 65_536 };
	gate.clearPause();

	const result = await Promise.race([
		stream.result(),
		new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
	]);

	assert.notEqual(result, "timeout");
	assert.equal(typeof result === "object" ? result.provider : undefined, "google-vertex");
	assert.equal(typeof result === "object" ? result.model : undefined, "gemini-4-argon");
	assert.equal(forwardedCalls.length, 1);
	assert.equal(forwardedCalls[0]?.options?.apiKey, undefined);
	assert.equal(forwardedCalls[0]?.options?.headers, undefined);
	assert.equal(forwardedCalls[0]?.options?.env, undefined);
	assert.equal(forwardedCalls[0]?.options?.reasoning, "high");
	assert.equal(gate.getPausedStatus(), undefined);
});

test("refreshes usage after agent settles rather than after every turn", () => {
	const events: string[] = [];
	multicodex({
		on(event: string) {
			events.push(event);
		},
		registerProvider() {},
		registerCommand() {},
		events: {
			on() { return () => {}; },
			emit() {},
		},
	} as never);

	assert.equal(events.includes("turn_end"), false);
	assert.equal(events.includes("agent_settled"), true);
});

test("registerProvider preserves Pi's dynamic models-store catalog instead of overwriting models with static compat data", () => {
	let registeredConfig: Record<string, unknown> | undefined;
	multicodex({
		on() {},
		registerProvider(_id: string, config: Record<string, unknown>) {
			registeredConfig = config;
		},
		registerCommand() {},
		getThinkingLevel: () => "medium",
		events: {
			on() { return () => {}; },
			emit() {},
		},
	} as never);

	assert.ok(registeredConfig);
	assert.equal(registeredConfig.models, undefined);
});

test("model_select keeps touch-grass paused across codex models without quota and clears it when switching providers", async () => {
	const handlers = new Map<string, (event: any, ctx: any) => void>();
	const gate = new TouchGrassGate();
	multicodex({
		on(event: string, handler: (event: any, ctx: any) => void) {
			handlers.set(event, handler);
		},
		registerProvider() {},
		registerCommand() {},
		getThinkingLevel: () => "medium",
		events: {
			on() { return () => {}; },
			emit(_channel: string, payload: { accept?: (controller: unknown) => void }) {
				payload?.accept?.(gate);
			},
		},
	} as never);

	const waiting = gate.waitUntil(Date.now() + 60_000);
	const codexModel = { provider: "openai-codex", id: "gpt-5.6-luna" };
	handlers.get("model_select")?.(
		{ model: codexModel, previousModel: { provider: "openai-codex", id: "gpt-6.1-sol" }, source: "set" },
		{ hasUI: false, model: codexModel },
	);
	assert.match(gate.getPausedStatus() ?? "", /loop paused/);

	const geminiModel = { provider: "google-vertex", id: "gemini-4-argon" };
	handlers.get("model_select")?.(
		{ model: geminiModel, previousModel: codexModel, source: "set" },
		{ hasUI: false, model: geminiModel },
	);
	assert.equal(await waiting, "resumed");
	assert.equal(gate.getPausedStatus(), undefined);
});

test("parseUsageResponse reads workspace credits and spend control", () => {
	assert.deepEqual(
		parseUsageResponse({
			rate_limit: {
				primary_window: { used_percent: 40 },
				secondary_window: { used_percent: 80 },
			},
			credits: { has_credits: true, unlimited: false, balance: "42.5" },
			spend_control: {
				reached: false,
				individual_limit: {
					limit: "100",
					used: "42.5",
					remaining: "57.5",
					remaining_percent: 58,
					reset_at: 1_800_000_000,
				},
			},
			rate_limit_reached_type: { type: "workspace_member_usage_limit_reached" },
		}),
		{
			primary: { usedPercent: 40, resetAt: undefined, limitWindowSeconds: undefined },
			secondary: { usedPercent: 80, resetAt: undefined, limitWindowSeconds: undefined },
			credits: { hasCredits: true, unlimited: false, balance: "42.5" },
			spendControl: {
				reached: false,
				individualLimit: {
					limit: "100",
					used: "42.5",
					remaining: "57.5",
					remainingPercent: 58,
					resetAt: 1_800_000_000_000,
				},
			},
			rateLimitReachedType: "workspace_member_usage_limit_reached",
		},
	);
});

test("formatWorkspaceCredits shows balance, auto-purchase headroom, and reset", () => {
	const withReset = {
		...usage(100, "42.5", "57.5"),
		spendControl: { reached: false, individualLimit: { remaining: "57.5", resetAt: Date.now() + 60 * 60 * 1000 } },
	};
	assert.equal(
		formatWorkspaceCredits(withReset),
		"credits 42.5 · auto-purchase 57.5 left reset 1h",
	);
	assert.equal(
		formatWorkspaceCredits(usage(100, "0", "0", true)),
		"credits none · auto-purchase exhausted",
	);
});

test("pickBestAccount keeps free quota priority", () => {
	const lowCredit = account("low@example.com");
	const highCredit = account("high@example.com");
	const selected = pickBestAccount(
		[lowCredit, highCredit],
		new Map([
			[lowCredit.email, usage(99, "1", "1")],
			[highCredit.email, usage(100, "100", "100")],
		]),
	);

	assert.equal(selected?.email, lowCredit.email);
});

test("pickBestAccount requires both 5h and weekly quota before avoiding credits", () => {
	const weeklyExhausted = account("weekly@example.com");
	const normalQuota = account("normal@example.com");
	const selected = pickBestAccount(
		[weeklyExhausted, normalQuota],
		new Map([
			[weeklyExhausted.email, { ...usage(50, "100", "100"), secondary: { usedPercent: 100 } }],
			[normalQuota.email, usage(99, "0", "0")],
		]),
	);

	assert.equal(selected?.email, normalQuota.email);
});

test("pickBestAccount balances exhausted quota by remaining credits", () => {
	const lowCredit = account("low@example.com");
	const highCredit = account("high@example.com");
	const selected = pickBestAccount(
		[lowCredit, highCredit],
		new Map([
			[lowCredit.email, usage(100, "10", "90")],
			[highCredit.email, usage(100, "25", "75")],
		]),
	);

	assert.equal(selected?.email, highCredit.email);
});

test("pickBestAccount uses auto-purchase headroom when credit balances tie", () => {
	const lowHeadroom = account("low@example.com");
	const highHeadroom = account("high@example.com");
	const selected = pickBestAccount(
		[lowHeadroom, highHeadroom],
		new Map([
			[lowHeadroom.email, usage(100, "25", "10")],
			[highHeadroom.email, usage(100, "25", "75")],
		]),
	);

	assert.equal(selected?.email, highHeadroom.email);
});

test("pickBestAccount still uses normal quota when auto-purchase is exhausted", () => {
	const normalQuota = account("normal@example.com");
	const creditsOnly = account("credits@example.com");
	const selected = pickBestAccount(
		[normalQuota, creditsOnly],
		new Map([
			[normalQuota.email, usage(90, "0", "0", true)],
			[creditsOnly.email, usage(100, "10", "10")],
		]),
	);

	assert.equal(selected?.email, normalQuota.email);
});

test("pickBestAccount skips accounts with neither normal quota nor credits", () => {
	const exhausted = account("exhausted@example.com");
	const available = account("available@example.com");
	const selected = pickBestAccount(
		[exhausted, available],
		new Map([
			[exhausted.email, usage(100, "0", "0", true)],
			[available.email, usage(100, "10", "10")],
		]),
	);

	assert.equal(selected?.email, available.email);
});

test("pickBestAccount refuses credit fallback while touch grass is enabled", () => {
	const creditsOnly = account("credits@example.com");
	const selected = pickBestAccount(
		[creditsOnly],
		new Map([[creditsOnly.email, usage(100, "100", "100")]]),
		new Set(),
		false,
	);

	assert.equal(selected, undefined);
});

test("pickBestAccount allows deliberate credits after a standard quota cooldown", () => {
	const creditsOnly = {
		...account("credits@example.com"),
		quotaExhaustedUntil: Date.now() + 60 * 60 * 1000,
	};
	const usageByEmail = new Map([[creditsOnly.email, usage(100, "100", "100")]]);

	assert.equal(pickBestAccount([creditsOnly], usageByEmail, new Set(), false), undefined);
	assert.equal(pickBestAccount([creditsOnly], usageByEmail, new Set(), true)?.email, creditsOnly.email);
});

test("pickBestAccount compares total credit and auto-purchase capacity", () => {
	const largerBalance = account("balance@example.com");
	const largerTotal = account("total@example.com");
	const selected = pickBestAccount(
		[largerBalance, largerTotal],
		new Map([
			[largerBalance.email, usage(100, "40", "10")],
			[largerTotal.email, usage(100, "30", "100")],
		]),
	);

	assert.equal(selected?.email, largerTotal.email);
});

test("isUsageStale refreshes as soon as a normal quota window resets", () => {
	const now = Date.now();
	assert.equal(
		isUsageStale({ ...usage(100, "10", "10"), primary: { usedPercent: 100, resetAt: now }, fetchedAt: now }, now),
		true,
	);
});

test("isUsageStale refreshes when credit headroom resets", () => {
	const now = Date.now();
	const snapshot = {
		...usage(100, "10", "10"),
		spendControl: { reached: false, individualLimit: { remaining: "10", resetAt: now } },
	};
	assert.equal(isUsageStale(snapshot, now), true);
});

test("formatAccountBar renders remaining quota, spent credits, and precise resets", () => {
	const now = Date.now();
	assert.equal(
		formatAccountBar(
			"email@account.com",
			{
				primary: { usedPercent: 72, resetAt: now + 72 * 60 * 1000, limitWindowSeconds: 5 * 60 * 60 },
				secondary: { usedPercent: 38, resetAt: now + 76 * 60 * 60 * 1000, limitWindowSeconds: 7 * 24 * 60 * 60 },
				spendControl: {
					reached: false,
					individualLimit: { used: "100", remainingPercent: 62, resetAt: now + 27 * 24 * 60 * 60 * 1000 },
				},
				fetchedAt: now,
			},
			now,
		),
		"email@account.com · 5h ██░░░░░░ 28% 1h12m · 7d █████░░░ 62% 3d4h · C █████░░░ 100 27d",
	);
});

test("formatAccountBar rounds consumed credits to the nearest integer", () => {
	const now = Date.now();
	assert.match(
		formatAccountBar(
			"credits@example.com",
			{
				spendControl: {
					individualLimit: { used: "1144.13", remainingPercent: 50, resetAt: now + 24 * 60 * 60 * 1000 },
				},
				fetchedAt: now,
			},
			now,
		),
		/C ████░░░░ 1,144 1d$/,
	);
});

test("isCodexDownError recognizes endpoint outage responses", () => {
	assert.equal(isCodexDownError("usage request failed: HTTP 404"), true);
	assert.equal(isCodexDownError("Not Found"), true);
	assert.equal(isCodexDownError("You have hit your ChatGPT usage limit"), false);
});

test("formatOpenAIStatusAdvice reports Codex component state", () => {
	assert.equal(
		formatOpenAIStatusAdvice({
			status: { description: "Minor Service Outage", indicator: "minor" },
			components: [
				{ name: "Codex API", status: "partial_outage" },
				{ name: "ChatGPT", status: "operational" },
			],
		}),
		"OpenAI status: Minor Service Outage; Codex API is partial outage. See https://status.openai.com/",
	);
});
