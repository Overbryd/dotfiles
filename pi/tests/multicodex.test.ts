import assert from "node:assert/strict";
import test from "node:test";
import multicodex, {
	formatOpenAIStatusAdvice,
	formatStatusUsage,
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

test("refreshes usage after agent settles rather than after every turn", () => {
	const events: string[] = [];
	multicodex({
		on(event: string) {
			events.push(event);
		},
		registerProvider() {},
		registerCommand() {},
	} as never);

	assert.equal(events.includes("turn_end"), false);
	assert.equal(events.includes("agent_settled"), true);
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

test("formatStatusUsage omits left wording", () => {
	assert.equal(
		formatStatusUsage({
			primary: { usedPercent: 40, limitWindowSeconds: 5 * 60 * 60 },
			secondary: { usedPercent: 80, limitWindowSeconds: 7 * 24 * 60 * 60 },
			fetchedAt: Date.now(),
		}),
		"5h 60% · 7d 20%",
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
