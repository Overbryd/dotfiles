import assert from "node:assert/strict";
import test from "node:test";
import multicodex, {
	formatWorkspaceCredits,
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

test("formatWorkspaceCredits shows balance and auto-purchase headroom", () => {
	assert.equal(
		formatWorkspaceCredits(usage(100, "42.5", "57.5")),
		"credits 42.5 · auto-purchase 57.5 left",
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

test("pickBestAccount skips exhausted auto-purchase accounts", () => {
	const exhausted = account("exhausted@example.com");
	const available = account("available@example.com");
	const selected = pickBestAccount(
		[exhausted, available],
		new Map([
			[exhausted.email, usage(90, "100", "0", true)],
			[available.email, usage(100, "10", "10")],
		]),
	);

	assert.equal(selected?.email, available.email);
});
