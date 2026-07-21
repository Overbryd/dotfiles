import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { getApiProvider, getModels } from "@earendil-works/pi-ai/compat";
import type {
	Api,
	AssistantMessageEvent,
	Context,
	Model,
	SimpleStreamOptions,
	Usage,
} from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "openai-codex";
const STATUS_KEY = "multicodex";
const STORAGE_VERSION = 1;
const MAX_ROTATION_RETRIES = 5;
const USAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const USAGE_TIMEOUT_MS = 10 * 1000;
const USAGE_MAX_ATTEMPTS = 3;
const USAGE_RETRY_BASE_MS = 750;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;
const HELP =
	"Usage: /multicodex [show|accounts|add <email>|use <email>|refresh [email|all]|reauth <email>|remove <email>|reset [manual|quota|all]|path|help]";
const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_DEVICE_USER_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const OPENAI_CODEX_DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token";
const OPENAI_CODEX_DEVICE_VERIFY_URL = "https://auth.openai.com/codex/device";
const OPENAI_CODEX_DEVICE_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";
const OPENAI_CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CODEX_DEVICE_TIMEOUT_MS = 15 * 60 * 1000;

const ZERO_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

type OAuthCredentials = {
	access: string;
	refresh: string;
	expires: number;
	accountId?: string;
};

type Account = {
	email: string;
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	accountId?: string;
	lastUsed?: number;
	quotaExhaustedUntil?: number;
	needsReauth?: boolean;
};

type StorageData = {
	version: number;
	accounts: Account[];
	activeEmail?: string;
};

type UsageWindow = {
	usedPercent?: number;
	resetAt?: number;
	limitWindowSeconds?: number;
};

type UsageSnapshot = {
	primary?: UsageWindow;
	secondary?: UsageWindow;
	fetchedAt: number;
};

type ProviderLike = {
	streamSimple(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AsyncIterable<AssistantMessageEvent>;
};

class UsageHttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

function agentDir() {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

const STORAGE_FILE = join(agentDir(), "codex-accounts.json");
const AUTH_FILE = join(agentDir(), "auth.json");

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
	const parts = token.split(".");
	if (parts.length !== 3 || !parts[1]) return undefined;

	try {
		const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
		const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function getProfileEmail(accessToken: string): string | undefined {
	const profile = decodeJwtPayload(accessToken)?.["https://api.openai.com/profile"];
	if (!isRecord(profile)) return undefined;
	const email = profile.email;
	return typeof email === "string" && email.trim() ? email.trim() : undefined;
}

function getAccountId(accessToken: string): string | undefined {
	const auth = decodeJwtPayload(accessToken)?.["https://api.openai.com/auth"];
	if (!isRecord(auth)) return undefined;
	const accountId = auth.chatgpt_account_id;
	return typeof accountId === "string" && accountId.trim() ? accountId.trim() : undefined;
}

function normalizeAccount(value: unknown): Account | undefined {
	if (!isRecord(value)) return undefined;
	const email = typeof value.email === "string" ? value.email.trim() : "";
	const accessToken = typeof value.accessToken === "string" ? value.accessToken : "";
	const refreshToken = typeof value.refreshToken === "string" ? value.refreshToken : "";
	const expiresAt = typeof value.expiresAt === "number" ? value.expiresAt : 0;
	if (!email || !accessToken || !refreshToken || !Number.isFinite(expiresAt)) return undefined;

	return {
		email,
		accessToken,
		refreshToken,
		expiresAt,
		accountId: typeof value.accountId === "string" && value.accountId.trim() ? value.accountId.trim() : undefined,
		lastUsed: typeof value.lastUsed === "number" ? value.lastUsed : undefined,
		quotaExhaustedUntil: typeof value.quotaExhaustedUntil === "number" ? value.quotaExhaustedUntil : undefined,
		needsReauth: typeof value.needsReauth === "boolean" ? value.needsReauth : undefined,
	};
}

function loadStorage(): StorageData {
	try {
		if (!existsSync(STORAGE_FILE)) return { version: STORAGE_VERSION, accounts: [] };
		const raw = JSON.parse(readFileSync(STORAGE_FILE, "utf8")) as unknown;
		if (!isRecord(raw)) return { version: STORAGE_VERSION, accounts: [] };
		const accounts = Array.isArray(raw.accounts) ? raw.accounts.map(normalizeAccount).filter(Boolean) : [];
		return {
			version: STORAGE_VERSION,
			accounts: accounts as Account[],
			activeEmail: typeof raw.activeEmail === "string" ? raw.activeEmail : undefined,
		};
	} catch (error) {
		console.error(`[multicodex] failed to load ${STORAGE_FILE}: ${messageFromUnknown(error)}`);
		return { version: STORAGE_VERSION, accounts: [] };
	}
}

function saveStorage(data: StorageData) {
	try {
		mkdirSync(dirname(STORAGE_FILE), { recursive: true, mode: 0o700 });
		writeFileSync(
			STORAGE_FILE,
			JSON.stringify({ version: STORAGE_VERSION, accounts: data.accounts, activeEmail: data.activeEmail }, null, 2),
			{ encoding: "utf8", mode: 0o600 },
		);
		chmodSync(STORAGE_FILE, 0o600);
	} catch (error) {
		console.error(`[multicodex] failed to save ${STORAGE_FILE}: ${messageFromUnknown(error)}`);
	}
}

function loadPiCodexAuth(): Account | undefined {
	try {
		if (!existsSync(AUTH_FILE)) return undefined;
		const raw = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as unknown;
		if (!isRecord(raw)) return undefined;
		const entry = raw[PROVIDER_ID];
		if (!isRecord(entry) || entry.type !== "oauth") return undefined;

		const access = typeof entry.access === "string" ? entry.access : undefined;
		const refresh = typeof entry.refresh === "string" ? entry.refresh : undefined;
		const expires = typeof entry.expires === "number" ? entry.expires : undefined;
		if (!access || !refresh || !expires) return undefined;

		const accountId =
			typeof entry.accountId === "string" ? entry.accountId : typeof entry.account_id === "string" ? entry.account_id : undefined;
		return {
			email: getProfileEmail(access) || `pi auth ${accountId?.slice(0, 8) || "openai-codex"}`,
			accessToken: access,
			refreshToken: refresh,
			expiresAt: expires,
			accountId,
		};
	} catch {
		return undefined;
	}
}

function normalizeUsedPercent(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return Math.min(100, Math.max(0, value));
}

function normalizeResetAt(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value > 100_000_000_000 ? value : value * 1000;
}

function normalizeResetAfterSeconds(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return Date.now() + Math.max(0, value) * 1000;
}

function normalizeLimitWindowSeconds(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
	return value;
}

function parseUsageWindow(value: unknown): UsageWindow | undefined {
	if (!isRecord(value)) return undefined;
	const usedPercent = normalizeUsedPercent(value.used_percent);
	const resetAt = normalizeResetAfterSeconds(value.reset_after_seconds) ?? normalizeResetAt(value.reset_at);
	const limitWindowSeconds = normalizeLimitWindowSeconds(value.limit_window_seconds);
	if (usedPercent === undefined && resetAt === undefined && limitWindowSeconds === undefined) return undefined;
	return { usedPercent, resetAt, limitWindowSeconds };
}

function additionalRateLimits(value: unknown) {
	if (!isRecord(value)) return [];
	const raw = value.additional_rate_limits;
	const values = Array.isArray(raw) ? raw : Object.values(isRecord(raw) ? raw : {});
	return values
		.map((entry) => (isRecord(entry) && isRecord(entry.rate_limit) ? entry.rate_limit : undefined))
		.filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function parseUsageResponse(value: unknown): Omit<UsageSnapshot, "fetchedAt"> {
	const rateLimit = isRecord(value) && isRecord(value.rate_limit) ? value.rate_limit : {};
	let primary = parseUsageWindow(rateLimit.primary_window);
	let secondary = parseUsageWindow(rateLimit.secondary_window);

	for (const extraRateLimit of additionalRateLimits(value)) {
		primary = primary ?? parseUsageWindow(extraRateLimit.primary_window);
		secondary = secondary ?? parseUsageWindow(extraRateLimit.secondary_window);
		if (primary && secondary) break;
	}

	return { primary, secondary };
}

function getNextResetAt(usage?: UsageSnapshot): number | undefined {
	const values = [usage?.primary?.resetAt, usage?.secondary?.resetAt].filter((value): value is number => typeof value === "number");
	return values.length > 0 ? Math.min(...values) : undefined;
}

function getWeeklyResetAt(usage?: UsageSnapshot): number | undefined {
	return typeof usage?.secondary?.resetAt === "number" ? usage.secondary.resetAt : undefined;
}

function getMaxUsedPercent(usage?: UsageSnapshot): number | undefined {
	const values = [usage?.primary?.usedPercent, usage?.secondary?.usedPercent].filter(
		(value): value is number => typeof value === "number",
	);
	return values.length > 0 ? Math.max(...values) : undefined;
}

function isUsageUntouched(usage?: UsageSnapshot): boolean {
	return usage?.primary?.usedPercent === 0 && usage?.secondary?.usedPercent === 0;
}

function formatResetAt(resetAt?: number): string {
	if (!resetAt) return "unknown";
	const minutes = Math.max(0, Math.round((resetAt - Date.now()) / 60_000));
	if (minutes <= 0) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

function withLinkedTimeout(parentSignal: AbortSignal | undefined, timeoutMs: number) {
	const controller = new AbortController();
	const abort = () => controller.abort();
	if (parentSignal?.aborted) controller.abort();
	parentSignal?.addEventListener("abort", abort, { once: true });
	const timeout = setTimeout(abort, timeoutMs);
	timeout.unref?.();
	return {
		controller,
		clear() {
			clearTimeout(timeout);
			parentSignal?.removeEventListener("abort", abort);
		},
	};
}

function createLinkedAbortController(parentSignal?: AbortSignal) {
	const controller = new AbortController();
	const abort = () => controller.abort();
	if (parentSignal?.aborted) controller.abort();
	parentSignal?.addEventListener("abort", abort, { once: true });
	return controller;
}

async function readTokenResponse(response: Response, action: "login" | "refresh"): Promise<OAuthCredentials> {
	const text = await response.text();
	if (!response.ok) throw new Error(`OpenAI Codex token ${action} failed: HTTP ${response.status} ${text}`);

	const json = JSON.parse(text) as unknown;
	if (!isRecord(json)) throw new Error(`OpenAI Codex token ${action} response was not an object`);
	const accessToken = typeof json.access_token === "string" ? json.access_token : undefined;
	const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : undefined;
	const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
	if (!accessToken || !refreshToken || !expiresIn) {
		throw new Error(`OpenAI Codex token ${action} response missing fields`);
	}

	const accountId = getAccountId(accessToken);
	if (!accountId) throw new Error("OpenAI Codex token did not include account id");
	return {
		access: accessToken,
		refresh: refreshToken,
		expires: Date.now() + expiresIn * 1000,
		accountId,
	};
}

async function refreshOpenAICodexToken(refreshToken: string): Promise<OAuthCredentials> {
	const response = await fetch(OPENAI_CODEX_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: OPENAI_CODEX_CLIENT_ID,
		}),
	});
	return readTokenResponse(response, "refresh");
}

type DeviceAuthInfo = {
	deviceAuthId: string;
	userCode: string;
	intervalSeconds: number;
};

async function startOpenAICodexDeviceAuth(signal?: AbortSignal): Promise<DeviceAuthInfo> {
	const response = await fetch(OPENAI_CODEX_DEVICE_USER_CODE_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ client_id: OPENAI_CODEX_CLIENT_ID }),
		signal,
	});
	const text = await response.text();
	if (!response.ok) throw new Error(`OpenAI Codex device login failed: HTTP ${response.status} ${text}`);

	const json = JSON.parse(text) as unknown;
	if (!isRecord(json)) throw new Error("OpenAI Codex device login response was not an object");
	const deviceAuthId = typeof json.device_auth_id === "string" ? json.device_auth_id : undefined;
	const userCode = typeof json.user_code === "string" ? json.user_code : undefined;
	const rawInterval = typeof json.interval === "string" ? Number(json.interval) : json.interval;
	const intervalSeconds = typeof rawInterval === "number" && Number.isFinite(rawInterval) ? rawInterval : undefined;
	if (!deviceAuthId || !userCode || intervalSeconds === undefined) {
		throw new Error("OpenAI Codex device login response missing fields");
	}
	return { deviceAuthId, userCode, intervalSeconds };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new Error("Login cancelled"));
		const timeout = setTimeout(resolve, ms);
		const abort = () => {
			clearTimeout(timeout);
			reject(new Error("Login cancelled"));
		};
		signal?.addEventListener("abort", abort, { once: true });
	});
}

async function pollOpenAICodexDeviceAuth(device: DeviceAuthInfo, signal?: AbortSignal) {
	const deadline = Date.now() + OPENAI_CODEX_DEVICE_TIMEOUT_MS;
	let intervalMs = Math.max(1, device.intervalSeconds) * 1000;

	while (Date.now() < deadline) {
		await sleep(intervalMs, signal);
		const response = await fetch(OPENAI_CODEX_DEVICE_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ device_auth_id: device.deviceAuthId, user_code: device.userCode }),
			signal,
		});
		const text = await response.text();
		if (response.ok) {
			const json = JSON.parse(text) as unknown;
			if (!isRecord(json)) throw new Error("OpenAI Codex device token response was not an object");
			const authorizationCode = typeof json.authorization_code === "string" ? json.authorization_code : undefined;
			const codeVerifier = typeof json.code_verifier === "string" ? json.code_verifier : undefined;
			if (!authorizationCode || !codeVerifier) throw new Error("OpenAI Codex device token response missing fields");
			return { authorizationCode, codeVerifier };
		}
		if (response.status === 403 || response.status === 404 || text.includes("authorization_pending")) continue;
		if (text.includes("slow_down")) {
			intervalMs += 5000;
			continue;
		}
		throw new Error(`OpenAI Codex device token failed: HTTP ${response.status} ${text}`);
	}

	throw new Error("OpenAI Codex device login timed out");
}

async function exchangeOpenAICodexDeviceCode(code: string, verifier: string, signal?: AbortSignal): Promise<OAuthCredentials> {
	const response = await fetch(OPENAI_CODEX_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: OPENAI_CODEX_CLIENT_ID,
			code,
			code_verifier: verifier,
			redirect_uri: OPENAI_CODEX_DEVICE_REDIRECT_URI,
		}),
		signal,
	});
	return readTokenResponse(response, "login");
}

async function loginOpenAICodexDeviceCode(onDeviceCode: (device: DeviceAuthInfo) => void, signal?: AbortSignal) {
	const device = await startOpenAICodexDeviceAuth(signal);
	onDeviceCode(device);
	const token = await pollOpenAICodexDeviceAuth(device, signal);
	return exchangeOpenAICodexDeviceCode(token.authorizationCode, token.codeVerifier, signal);
}

function isTransientUsageStatus(status: number) {
	return [408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(status);
}

function retryAfterMs(headers: Headers): number | undefined {
	const retryAfterMs = headers.get("retry-after-ms");
	if (retryAfterMs) {
		const millis = Number(retryAfterMs);
		if (Number.isFinite(millis)) return Math.max(0, millis);
	}

	const retryAfter = headers.get("retry-after");
	if (!retryAfter) return undefined;
	const seconds = Number(retryAfter);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(retryAfter);
	return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function sleepForUsageRetry(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) return reject(new Error("Usage request cancelled"));
		const timeout = setTimeout(resolve, ms);
		const abort = () => {
			clearTimeout(timeout);
			reject(new Error("Usage request cancelled"));
		};
		signal?.addEventListener("abort", abort, { once: true });
	});
}

async function usageErrorFromResponse(response: Response) {
	const text = await response.text().catch(() => "");
	const snippet = text.trim().replace(/\s+/g, " ").slice(0, 160);
	return new UsageHttpError(`usage request failed: HTTP ${response.status}${snippet ? ` ${snippet}` : ""}`, response.status);
}

async function fetchUsage(accessToken: string, accountId: string | undefined, signal?: AbortSignal): Promise<UsageSnapshot> {
	let lastError: unknown;
	for (let attempt = 0; attempt < USAGE_MAX_ATTEMPTS; attempt++) {
		const { controller, clear } = withLinkedTimeout(signal, USAGE_TIMEOUT_MS);
		try {
			const headers: Record<string, string> = {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
				"User-Agent": "pi-multicodex",
			};
			if (accountId) headers["chatgpt-account-id"] = accountId;
			const response = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers, signal: controller.signal });
			if (response.ok) return { ...parseUsageResponse(await response.json()), fetchedAt: Date.now() };

			lastError = await usageErrorFromResponse(response);
			if (!isTransientUsageStatus(response.status) || attempt === USAGE_MAX_ATTEMPTS - 1) throw lastError;
			await sleepForUsageRetry(retryAfterMs(response.headers) ?? USAGE_RETRY_BASE_MS * 2 ** attempt, signal);
		} catch (error) {
			lastError = error;
			if (signal?.aborted) throw error;
			if (error instanceof UsageHttpError && !isTransientUsageStatus(error.status)) throw error;
			if (attempt === USAGE_MAX_ATTEMPTS - 1) throw error;
			await sleepForUsageRetry(USAGE_RETRY_BASE_MS * 2 ** attempt, signal);
		} finally {
			clear();
		}
	}
	throw lastError instanceof Error ? lastError : new Error(messageFromUnknown(lastError));
}

function isQuotaErrorMessage(message: string): boolean {
	return /\b429\b|quota|usage limit|rate.?limit|too many requests|limit reached/i.test(message);
}

function isAccountAvailable(account: Account, now: number): boolean {
	if (account.needsReauth) return false;
	return !account.quotaExhaustedUntil || account.quotaExhaustedUntil <= now;
}

function pickBestAccount(accounts: Account[], usageByEmail: Map<string, UsageSnapshot>, excludeEmails = new Set<string>()): Account | undefined {
	const now = Date.now();
	const available = accounts.filter((account) => isAccountAvailable(account, now) && !excludeEmails.has(account.email));
	if (available.length === 0) return undefined;

	const withUsage = available.filter((account) => usageByEmail.has(account.email));
	const untouched = withUsage.filter((account) => isUsageUntouched(usageByEmail.get(account.email)));
	const candidates = untouched.length > 0 ? untouched : withUsage;
	if (candidates.length === 0) return available[Math.floor(Math.random() * available.length)];

	return candidates
		.map((account) => ({
			account,
			used: getMaxUsedPercent(usageByEmail.get(account.email)) ?? 100,
			weeklyReset: getWeeklyResetAt(usageByEmail.get(account.email)) ?? Number.MAX_SAFE_INTEGER,
		}))
		.sort((a, b) => a.used - b.used || a.weeklyReset - b.weeklyReset)[0]?.account;
}

class AccountManager {
	private data = loadStorage();
	private piAuthAccount: Account | undefined;
	private usageCache = new Map<string, UsageSnapshot>();
	private usageErrors = new Map<string, string>();
	private usagePromises = new Map<string, Promise<UsageSnapshot | undefined>>();
	private refreshPromises = new Map<string, Promise<string>>();
	private manualEmail: string | undefined;
	private stateChangeHandlers = new Set<() => void>();
	private warningHandler: ((message: string) => void) | undefined;
	private warnedAuthFailures = new Set<string>();
	private warnedUsageFailures = new Map<string, string>();
	private readyPromise: Promise<void> = Promise.resolve();
	private readyResolve: (() => void) | undefined;

	beginInitialization() {
		this.readyPromise = new Promise((resolve) => {
			this.readyResolve = resolve;
		});
	}

	markReady() {
		this.readyResolve?.();
		this.readyResolve = undefined;
	}

	waitUntilReady() {
		return this.readyPromise;
	}

	setWarningHandler(handler?: (message: string) => void) {
		this.warningHandler = handler;
	}

	resetSessionWarnings() {
		this.warnedAuthFailures.clear();
		this.warnedUsageFailures.clear();
	}

	onStateChange(handler: () => void) {
		this.stateChangeHandlers.add(handler);
		return () => this.stateChangeHandlers.delete(handler);
	}

	private notifyStateChanged() {
		for (const handler of this.stateChangeHandlers) handler();
	}

	private save() {
		saveStorage(this.data);
	}

	loadPiAuth() {
		const imported = loadPiCodexAuth();
		if (!imported || this.data.accounts.some((account) => account.email === imported.email)) {
			this.piAuthAccount = undefined;
		} else {
			this.piAuthAccount = imported;
		}
		this.notifyStateChanged();
	}

	getAccounts() {
		return this.piAuthAccount ? [...this.data.accounts, this.piAuthAccount] : this.data.accounts;
	}

	getManagedAccounts() {
		return this.data.accounts;
	}

	getAccount(email: string) {
		if (this.piAuthAccount?.email === email) return this.piAuthAccount;
		return this.data.accounts.find((account) => account.email === email);
	}

	isPiAuthAccount(account: Account) {
		return this.piAuthAccount === account;
	}

	addOrUpdateAccount(identifier: string, credentials: OAuthCredentials) {
		const email = getProfileEmail(credentials.access) || identifier.trim();
		const existing = this.data.accounts.find((account) => account.email === email);
		const accountId = credentials.accountId || getAccountId(credentials.access);
		if (existing) {
			existing.accessToken = credentials.access;
			existing.refreshToken = credentials.refresh;
			existing.expiresAt = credentials.expires;
			existing.accountId = accountId;
			existing.needsReauth = undefined;
			this.warnedAuthFailures.delete(email);
			this.save();
			this.notifyStateChanged();
			return existing;
		}

		const account: Account = {
			email,
			accessToken: credentials.access,
			refreshToken: credentials.refresh,
			expiresAt: credentials.expires,
			accountId,
		};
		this.data.accounts.push(account);
		this.data.activeEmail = email;
		this.save();
		this.notifyStateChanged();
		return account;
	}

	removeAccount(email: string) {
		const index = this.data.accounts.findIndex((account) => account.email === email);
		if (index < 0) return false;
		this.data.accounts.splice(index, 1);
		if (this.data.activeEmail === email) this.data.activeEmail = this.data.accounts[0]?.email;
		if (this.manualEmail === email) this.manualEmail = undefined;
		this.usageCache.delete(email);
		this.save();
		this.notifyStateChanged();
		return true;
	}

	getActiveAccount() {
		const manual = this.getManualAccount();
		if (manual) return manual;
		if (this.data.activeEmail) return this.getAccount(this.data.activeEmail);
		return this.data.accounts[0] || this.piAuthAccount;
	}

	getManualAccount() {
		return this.manualEmail ? this.getAccount(this.manualEmail) : undefined;
	}

	hasManualAccount() {
		return Boolean(this.manualEmail);
	}

	setManualAccount(email: string) {
		const account = this.getAccount(email);
		if (!account) return false;
		this.manualEmail = email;
		account.lastUsed = Date.now();
		this.notifyStateChanged();
		return true;
	}

	clearManualAccount() {
		const hadManual = Boolean(this.manualEmail);
		this.manualEmail = undefined;
		if (hadManual) this.notifyStateChanged();
		return hadManual;
	}

	clearAllQuotaExhaustion() {
		let count = 0;
		let managedChanged = false;
		for (const account of this.getAccounts()) {
			if (!account.quotaExhaustedUntil) continue;
			account.quotaExhaustedUntil = undefined;
			count++;
			if (!this.isPiAuthAccount(account)) managedChanged = true;
		}
		if (managedChanged) this.save();
		if (count > 0) this.notifyStateChanged();
		return count;
	}

	clearExpiredExhaustion() {
		const now = Date.now();
		let managedChanged = false;
		let anyChanged = false;
		for (const account of this.getAccounts()) {
			if (!account.quotaExhaustedUntil || account.quotaExhaustedUntil > now) continue;
			account.quotaExhaustedUntil = undefined;
			anyChanged = true;
			if (!this.isPiAuthAccount(account)) managedChanged = true;
		}
		if (managedChanged) this.save();
		if (anyChanged) this.notifyStateChanged();
	}

	getCachedUsage(email: string) {
		return this.usageCache.get(email);
	}

	getLastUsageError(email: string) {
		return this.usageErrors.get(email);
	}

	getAccountsNeedingReauth() {
		return this.getAccounts().filter((account) => account.needsReauth);
	}

	private markNeedsReauth(account: Account) {
		account.needsReauth = true;
		if (!this.isPiAuthAccount(account)) this.save();
		this.notifyStateChanged();
	}

	notifyAuthFailure(account: Account, error: unknown) {
		this.markNeedsReauth(account);
		if (this.warnedAuthFailures.has(account.email)) return;
		this.warnedAuthFailures.add(account.email);
		const hint = this.isPiAuthAccount(account) ? "/login openai-codex" : `/multicodex reauth ${account.email}`;
		this.warningHandler?.(`MultiCodex skipped ${account.email}: ${messageFromUnknown(error)}. Repair with ${hint}.`);
	}

	async ensureValidToken(account: Account) {
		if (account.needsReauth) throw new Error(`${account.email}: re-authentication required`);
		if (Date.now() < account.expiresAt - 5 * 60 * 1000) return account.accessToken;

		if (this.isPiAuthAccount(account)) {
			const fresh = loadPiCodexAuth();
			if (fresh && fresh.email === account.email && Date.now() < fresh.expiresAt - 5 * 60 * 1000) {
				Object.assign(account, fresh);
				this.notifyStateChanged();
				return account.accessToken;
			}
			throw new Error(`${account.email}: pi auth expired; run /login openai-codex`);
		}

		const inflight = this.refreshPromises.get(account.email);
		if (inflight) return inflight;

		const promise = (async () => {
			try {
				const next = await refreshOpenAICodexToken(account.refreshToken);
				account.accessToken = next.access;
				account.refreshToken = next.refresh;
				account.expiresAt = next.expires;
				account.accountId = next.accountId || getAccountId(next.access);
				account.needsReauth = undefined;
				this.save();
				this.notifyStateChanged();
				return account.accessToken;
			} catch (error) {
				this.markNeedsReauth(account);
				throw error;
			} finally {
				this.refreshPromises.delete(account.email);
			}
		})();

		this.refreshPromises.set(account.email, promise);
		return promise;
	}

	async refreshUsageForAccount(account: Account, options: { force?: boolean; signal?: AbortSignal } = {}) {
		if (account.needsReauth) return this.usageCache.get(account.email);
		const cached = this.usageCache.get(account.email);
		if (cached && !options.force && Date.now() - cached.fetchedAt < USAGE_CACHE_TTL_MS) return cached;

		const inflight = this.usagePromises.get(account.email);
		if (inflight) return inflight;

		const promise = (async () => {
			try {
				const token = await this.ensureValidToken(account);
				const usage = await fetchUsage(token, account.accountId, options.signal);
				this.usageCache.set(account.email, usage);
				this.usageErrors.delete(account.email);
				this.warnedUsageFailures.delete(account.email);
				this.notifyStateChanged();
				return usage;
			} catch (error) {
				const message = messageFromUnknown(error);
				this.usageErrors.set(account.email, message);
				if (options.force || this.warnedUsageFailures.get(account.email) !== message) {
					this.warnedUsageFailures.set(account.email, message);
					this.warningHandler?.(`MultiCodex usage fetch failed for ${account.email}: ${message}`);
				}
				return cached;
			} finally {
				this.usagePromises.delete(account.email);
			}
		})();

		this.usagePromises.set(account.email, promise);
		return promise;
	}

	async refreshUsageForAllAccounts(options: { force?: boolean; signal?: AbortSignal } = {}) {
		await Promise.all(this.getAccounts().map((account) => this.refreshUsageForAccount(account, options)));
	}

	async refreshStaleUsage(accounts: Account[], signal?: AbortSignal) {
		const stale = accounts.filter((account) => {
			const cached = this.usageCache.get(account.email);
			return !cached || Date.now() - cached.fetchedAt >= USAGE_CACHE_TTL_MS;
		});
		await Promise.all(stale.map((account) => this.refreshUsageForAccount(account, { force: true, signal })));
	}

	async activateBestAccount(options: { excludeEmails?: Set<string>; signal?: AbortSignal } = {}) {
		this.clearExpiredExhaustion();
		const accounts = this.getAccounts();
		await this.refreshStaleUsage(accounts, options.signal);
		const selected = pickBestAccount(accounts, this.usageCache, options.excludeEmails);
		if (!selected) return undefined;
		this.data.activeEmail = selected.email;
		if (!this.isPiAuthAccount(selected)) this.save();
		this.notifyStateChanged();
		return selected;
	}

	getAvailableManualAccount(excludeEmails = new Set<string>()) {
		const manual = this.getManualAccount();
		if (!manual || excludeEmails.has(manual.email) || !isAccountAvailable(manual, Date.now())) return undefined;
		return manual;
	}

	async handleQuotaExceeded(account: Account, signal?: AbortSignal) {
		const usage = await this.refreshUsageForAccount(account, { force: true, signal });
		const resetAt = getNextResetAt(usage);
		account.quotaExhaustedUntil = resetAt && resetAt > Date.now() ? resetAt : Date.now() + QUOTA_COOLDOWN_MS;
		if (!this.isPiAuthAccount(account)) this.save();
		this.notifyStateChanged();
	}
}

function createErrorEvent(model: Model<Api>, message: string): AssistantMessageEvent {
	return {
		type: "error",
		reason: "error",
		error: {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: ZERO_USAGE,
			stopReason: "error",
			errorMessage: message,
			timestamp: Date.now(),
		},
	} as AssistantMessageEvent;
}

function createStreamWrapper(accountManager: AccountManager, baseProvider: ProviderLike) {
	return (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => {
		const stream = createAssistantMessageEventStream();

		void (async () => {
			try {
				await accountManager.waitUntilReady();
				const excludedEmails = new Set<string>();

				for (let attempt = 0; attempt <= MAX_ROTATION_RETRIES; attempt++) {
					let account = accountManager.getAvailableManualAccount(excludedEmails);
					const usingManual = Boolean(account);
					if (!account) {
						if (accountManager.hasManualAccount()) accountManager.clearManualAccount();
						account = await accountManager.activateBestAccount({ excludeEmails: excludedEmails, signal: options?.signal });
					}
					if (!account) throw new Error("No available MultiCodex accounts. Use /multicodex add <email>.");

					let token: string;
					try {
						token = await accountManager.ensureValidToken(account);
					} catch (error) {
						accountManager.notifyAuthFailure(account, error);
						if (usingManual) accountManager.clearManualAccount();
						excludedEmails.add(account.email);
						if (attempt < MAX_ROTATION_RETRIES) continue;
						throw error;
					}

					const abortController = createLinkedAbortController(options?.signal);
					const inner = baseProvider.streamSimple(
						{ ...model, provider: PROVIDER_ID, api: "openai-codex-responses", headers: { ...(model.headers || {}), "X-Multicodex-Account": account.email } },
						context,
						{ ...options, apiKey: token, signal: abortController.signal },
					);

					let forwardedAny = false;
					let retry = false;
					for await (const event of inner) {
						if (event.type === "error") {
							const message = event.error.errorMessage || "";
							if (isQuotaErrorMessage(message) && !forwardedAny && attempt < MAX_ROTATION_RETRIES) {
								await accountManager.handleQuotaExceeded(account, options?.signal);
								if (usingManual) accountManager.clearManualAccount();
								excludedEmails.add(account.email);
								abortController.abort();
								retry = true;
								break;
							}
							stream.push(event);
							stream.end();
							return;
						}

						forwardedAny = true;
						stream.push(event);
						if (event.type === "done") {
							stream.end();
							return;
						}
					}

					if (retry) continue;
					stream.end();
					return;
				}
			} catch (error) {
				stream.push(createErrorEvent(model, `MultiCodex failed: ${messageFromUnknown(error)}`));
				stream.end();
			}
		})();

		return stream;
	};
}

function toModelDefinitions(models: readonly Model<Api>[]) {
	return models.map((model) => ({
		id: model.id,
		name: model.name,
		reasoning: model.reasoning,
		thinkingLevelMap: model.thinkingLevelMap,
		input: [...model.input],
		cost: { ...model.cost },
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
	}));
}

function activeApiKey(accountManager: AccountManager) {
	const active = accountManager.getActiveAccount();
	if (active && !active.needsReauth) return active.accessToken;
	return accountManager.getAccounts().find((account) => !account.needsReauth && account.accessToken)?.accessToken || "pending-login";
}

function windowLabel(window: UsageWindow | undefined, fallback: string) {
	if (!window?.limitWindowSeconds) return fallback;
	const hours = Math.round(window.limitWindowSeconds / 3600);
	if (hours >= 24 * 6) return "7d";
	if (hours >= 24) return `${Math.round(hours / 24)}d`;
	return `${hours}h`;
}

function secondaryWindowLabel(usage: UsageSnapshot | undefined) {
	if (!usage?.secondary?.limitWindowSeconds) return "7d";
	const hours = Math.round(usage.secondary.limitWindowSeconds / 3600);
	if (hours < 24) return `${hours}h`;
	if (hours >= 24 * 6) return "7d";
	if (
		typeof usage.secondary.resetAt === "number" &&
		typeof usage.primary?.resetAt === "number" &&
		usage.secondary.resetAt - usage.primary.resetAt >= 3 * 24 * 60 * 60 * 1000
	) {
		return "7d";
	}
	return `${Math.round(hours / 24)}d`;
}

function formatUsage(accountManager: AccountManager, account: Account) {
	const usage = accountManager.getCachedUsage(account.email);
	const primary = usage?.primary?.usedPercent === undefined ? "?" : `${Math.round(usage.primary.usedPercent)}%`;
	const secondary = usage?.secondary?.usedPercent === undefined ? "?" : `${Math.round(usage.secondary.usedPercent)}%`;
	const error = accountManager.getLastUsageError(account.email);
	const summary = `${windowLabel(usage?.primary, "5h")} ${primary} reset ${formatResetAt(usage?.primary?.resetAt)} · ${secondaryWindowLabel(usage)} ${secondary} reset ${formatResetAt(usage?.secondary?.resetAt)}`;
	return error ? `${summary} · usage error: ${error}` : summary;
}

function formatAccount(accountManager: AccountManager, account: Account) {
	const tags = [
		accountManager.getActiveAccount()?.email === account.email ? "active" : undefined,
		accountManager.getManualAccount()?.email === account.email ? "manual" : undefined,
		accountManager.isPiAuthAccount(account) ? "pi-auth" : undefined,
		account.needsReauth ? "reauth" : undefined,
		account.quotaExhaustedUntil && account.quotaExhaustedUntil > Date.now() ? "quota" : undefined,
	]
		.filter(Boolean)
		.join(", ");
	return `${account.email}${tags ? ` [${tags}]` : ""} — ${formatUsage(accountManager, account)}`;
}

function notify(ctx: ExtensionCommandContext | ExtensionContext, message: string, level: "info" | "warning" | "error" = "info") {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else console.log(message);
}

function isStaleContextError(error: unknown) {
	return messageFromUnknown(error).includes("ctx is stale");
}

function updateStatus(ctx: ExtensionContext, accountManager: AccountManager) {
	if (!ctx.hasUI) return;
	if (ctx.model?.provider !== PROVIDER_ID) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	const account = accountManager.getActiveAccount();
	if (!account) {
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("warning", "MultiCodex no account"));
		return;
	}

	const usage = accountManager.getCachedUsage(account.email);
	const primaryLeft = usage?.primary?.usedPercent === undefined ? "?" : `${Math.round(100 - usage.primary.usedPercent)}%`;
	const secondaryLeft = usage?.secondary?.usedPercent === undefined ? "?" : `${Math.round(100 - usage.secondary.usedPercent)}%`;
	ctx.ui.setStatus(
		STATUS_KEY,
		ctx.ui.theme.fg("muted", `Codex ${account.email} · ${windowLabel(usage?.primary, "5h")} ${primaryLeft} left · ${secondaryWindowLabel(usage)} ${secondaryLeft} left`),
	);
}

function safelyUpdateStatus(ctx: ExtensionContext, accountManager: AccountManager) {
	try {
		updateStatus(ctx, accountManager);
	} catch (error) {
		if (!isStaleContextError(error)) throw error;
	}
}

async function refreshStatus(ctx: ExtensionContext, accountManager: AccountManager) {
	safelyUpdateStatus(ctx, accountManager);
	const account = accountManager.getActiveAccount();
	if (account && ctx.model?.provider === PROVIDER_ID) await accountManager.refreshUsageForAccount(account);
	safelyUpdateStatus(ctx, accountManager);
}

async function loginAndUse(_pi: ExtensionAPI, ctx: ExtensionCommandContext, accountManager: AccountManager, identifier: string) {
	const trimmed = identifier.trim();
	if (!trimmed) {
		notify(ctx, "Missing account identifier/email.", "warning");
		return;
	}
	if (!ctx.hasUI) {
		console.log("MultiCodex login needs interactive UI.");
		return;
	}

	const controller = new AbortController();
	try {
		const credentials = await loginOpenAICodexDeviceCode((device) => {
			const message = `Open ${OPENAI_CODEX_DEVICE_VERIFY_URL} and enter code: ${device.userCode}`;
			notify(ctx, message, "info");
			console.log(`[multicodex] ${trimmed}: ${message}`);
		}, controller.signal);

		const account = accountManager.addOrUpdateAccount(trimmed, credentials);
		accountManager.setManualAccount(account.email);
		await accountManager.refreshUsageForAccount(account, { force: true });
		notify(ctx, `Now using ${account.email}`, "info");
	} finally {
		controller.abort();
	}
}

async function useAccount(pi: ExtensionAPI, ctx: ExtensionCommandContext, accountManager: AccountManager, identifier: string) {
	const account = accountManager.getAccount(identifier.trim());
	if (!account) {
		await loginAndUse(pi, ctx, accountManager, identifier);
		return;
	}

	try {
		await accountManager.ensureValidToken(account);
		accountManager.setManualAccount(account.email);
		notify(ctx, `Now using ${account.email}`, "info");
	} catch {
		notify(ctx, `Stored auth for ${account.email} needs reauth. Starting login.`, "warning");
		await loginAndUse(pi, ctx, accountManager, account.email);
	}
}

function commandParts(args: string) {
	const trimmed = args.trim();
	if (!trimmed) return { command: "", rest: "" };
	const space = trimmed.indexOf(" ");
	if (space < 0) return { command: trimmed.toLowerCase(), rest: "" };
	return { command: trimmed.slice(0, space).toLowerCase(), rest: trimmed.slice(space + 1).trim() };
}

async function chooseAccount(ctx: ExtensionCommandContext, accountManager: AccountManager, title: string) {
	const accounts = accountManager.getAccounts();
	if (accounts.length === 0) return undefined;
	if (!ctx.hasUI) return accounts[0]?.email;
	const selected = await ctx.ui.select(title, accounts.map((account) => formatAccount(accountManager, account)));
	return selected?.split(" — ")[0]?.replace(/ \[.*$/, "");
}

function refreshResultMessage(accountManager: AccountManager, accounts: Account[]) {
	const failures = accounts
		.map((account) => {
			const error = accountManager.getLastUsageError(account.email);
			return error ? `${account.email}: ${error}` : undefined;
		})
		.filter(Boolean);
	return failures.length > 0 ? `Refresh failed for ${failures.join("; ")}` : `Refreshed ${accounts.length} account${accounts.length === 1 ? "" : "s"}`;
}

export default function multicodex(pi: ExtensionAPI) {
	const accountManager = new AccountManager();
	const baseProvider = getApiProvider("openai-codex-responses") as ProviderLike | undefined;
	if (!baseProvider) throw new Error("OpenAI Codex API provider not available in this pi install");
	const baseModels = getModels(PROVIDER_ID) as readonly Model<Api>[];
	let lastContext: ExtensionContext | undefined;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;

	accountManager.setWarningHandler((message) => {
		try {
			if (lastContext?.hasUI) lastContext.ui.notify(message, "warning");
			else console.warn(message);
		} catch (error) {
			if (!isStaleContextError(error)) throw error;
			console.warn(message);
		}
	});
	accountManager.onStateChange(() => {
		if (lastContext) safelyUpdateStatus(lastContext, accountManager);
	});

	pi.registerProvider(PROVIDER_ID, {
		name: "OpenAI Codex (MultiCodex)",
		baseUrl: "https://chatgpt.com/backend-api",
		apiKey: activeApiKey(accountManager),
		api: "openai-codex-responses",
		streamSimple: createStreamWrapper(accountManager, baseProvider),
		models: toModelDefinitions(baseModels),
	});

	async function initialize(ctx: ExtensionContext) {
		lastContext = ctx;
		accountManager.resetSessionWarnings();
		accountManager.beginInitialization();
		try {
			accountManager.loadPiAuth();
			if (accountManager.getAccounts().length > 0) {
				if (!accountManager.getAvailableManualAccount()) accountManager.clearManualAccount();
				await accountManager.activateBestAccount();
			}
		} finally {
			accountManager.markReady();
			safelyUpdateStatus(ctx, accountManager);
		}
	}

	pi.on("session_start", (_event, ctx) => {
		void initialize(ctx);
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = setInterval(() => {
			if (lastContext) void refreshStatus(lastContext, accountManager);
		}, 60_000);
		refreshTimer.unref?.();
	});

	pi.on("model_select", (_event, ctx) => {
		lastContext = ctx;
		void refreshStatus(ctx, accountManager);
	});

	pi.on("turn_end", (_event, ctx) => {
		lastContext = ctx;
		void refreshStatus(ctx, accountManager);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = undefined;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		lastContext = undefined;
	});

	pi.registerCommand("multicodex", {
		description: "Manage local Codex account rotation with no npm package dependency",
		getArgumentCompletions: (prefix) => {
			const parts = commandParts(prefix);
			const commands = ["show", "accounts", "add", "use", "refresh", "reauth", "remove", "reset", "path", "help"];
			if (!parts.command || !prefix.includes(" ")) {
				return commands.filter((value) => value.startsWith(parts.command)).map((value) => ({ value, label: value }));
			}
			if (["use", "refresh", "reauth", "remove"].includes(parts.command)) {
				const values = parts.command === "refresh" ? ["all", ...accountManager.getAccounts().map((a) => a.email)] : accountManager.getAccounts().map((a) => a.email);
				return values.filter((value) => value.startsWith(parts.rest)).map((value) => ({ value: `${parts.command} ${value}`, label: value }));
			}
			if (parts.command === "reset") {
				return ["manual", "quota", "all"].filter((value) => value.startsWith(parts.rest)).map((value) => ({ value: `reset ${value}`, label: value }));
			}
			return null;
		},
		handler: async (args, ctx) => {
			const { command, rest } = commandParts(args);
			if (!command && ctx.hasUI) {
				const selected = await ctx.ui.select("MultiCodex", [
					"accounts - show accounts",
					"add - login new account",
					"use - select account",
					"refresh - refresh usage",
					"reset - clear manual/quota state",
					"path - show storage path",
				]);
				if (!selected) return;
				return pi.sendUserMessage(`/multicodex ${selected.split(" ")[0]}`, { deliverAs: "followUp" });
			}

			if (!command || command === "help") {
				notify(ctx, HELP, "info");
				return;
			}

			if (command === "show" || command === "accounts") {
				await accountManager.refreshUsageForAllAccounts();
				const lines = accountManager.getAccounts().map((account) => formatAccount(accountManager, account));
				notify(ctx, lines.length > 0 ? lines.join("\n") : "No MultiCodex accounts. Use /multicodex add <email>.", lines.length > 0 ? "info" : "warning");
				return;
			}

			if (command === "add") {
				const identifier = rest || (ctx.hasUI ? (await ctx.ui.input("Account email/label")) || "" : "");
				await loginAndUse(pi, ctx, accountManager, identifier);
				if (lastContext) await refreshStatus(lastContext, accountManager);
				return;
			}

			if (command === "use") {
				const email = rest || (await chooseAccount(ctx, accountManager, "Use MultiCodex account")) || "";
				await useAccount(pi, ctx, accountManager, email);
				if (lastContext) await refreshStatus(lastContext, accountManager);
				return;
			}

			if (command === "refresh") {
				const target = rest || "all";
				const refreshedAccounts: Account[] = [];
				if (target === "all") {
					refreshedAccounts.push(...accountManager.getAccounts());
					await accountManager.refreshUsageForAllAccounts({ force: true });
				} else {
					const account = accountManager.getAccount(target);
					if (!account) return notify(ctx, `Unknown account: ${target}`, "warning");
					refreshedAccounts.push(account);
					await accountManager.refreshUsageForAccount(account, { force: true });
				}
				const failed = refreshedAccounts.some((account) => accountManager.getLastUsageError(account.email));
				notify(ctx, refreshResultMessage(accountManager, refreshedAccounts), failed ? "warning" : "info");
				if (lastContext) await refreshStatus(lastContext, accountManager);
				return;
			}

			if (command === "reauth") {
				const email = rest || (await chooseAccount(ctx, accountManager, "Reauth MultiCodex account")) || "";
				const account = accountManager.getAccount(email);
				if (!account) return notify(ctx, `Unknown account: ${email}`, "warning");
				await loginAndUse(pi, ctx, accountManager, account.email);
				if (lastContext) await refreshStatus(lastContext, accountManager);
				return;
			}

			if (command === "remove") {
				const email = rest || (await chooseAccount(ctx, accountManager, "Remove MultiCodex account")) || "";
				const account = accountManager.getAccount(email);
				if (!account) return notify(ctx, `Unknown account: ${email}`, "warning");
				if (accountManager.isPiAuthAccount(account)) return notify(ctx, "Cannot remove ephemeral pi auth. Use /logout openai-codex if needed.", "warning");
				if (ctx.hasUI && !(await ctx.ui.confirm("Remove MultiCodex account", `Remove ${email}?`))) return;
				accountManager.removeAccount(email);
				notify(ctx, `Removed ${email}`, "info");
				if (lastContext) await refreshStatus(lastContext, accountManager);
				return;
			}

			if (command === "reset") {
				const target = rest || "all";
				const manualCleared = target === "manual" || target === "all" ? accountManager.clearManualAccount() : false;
				const quotaCleared = target === "quota" || target === "all" ? accountManager.clearAllQuotaExhaustion() : 0;
				notify(ctx, `Reset ${target}: manual=${manualCleared ? "yes" : "no"} quota=${quotaCleared}`, "info");
				if (lastContext) await refreshStatus(lastContext, accountManager);
				return;
			}

			if (command === "path") {
				notify(ctx, `storage=${STORAGE_FILE}\nauth=${AUTH_FILE}`, "info");
				return;
			}

			notify(ctx, `Unknown subcommand: ${command}\n${HELP}`, "warning");
		},
	});
}
