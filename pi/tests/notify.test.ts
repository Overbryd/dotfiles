import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
	notificationChannels,
	registerNotify,
	summarizeNotification,
} from "../extensions/notify.ts";

test("summarizes the final assistant response for a notification", () => {
	const entries = [
		{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Old" }] } },
		{
			type: "message",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "## Done\nUpdated [the worker](https://example.test) and all tests pass." }],
			},
		},
	];
	assert.equal(summarizeNotification(entries), "Done Updated the worker and all tests pass.");
});

test("routes local Mac sessions locally and remote or detached sessions to push", () => {
	assert.deepEqual(notificationChannels({}, "darwin", undefined), ["local"]);
	assert.deepEqual(notificationChannels({ SSH_CONNECTION: "client" }, "darwin", true), ["push"]);
	assert.deepEqual(notificationChannels({ TMUX: "socket" }, "darwin", false), ["push"]);
	assert.deepEqual(notificationChannels({}, "linux", undefined), ["push"]);
	assert.deepEqual(notificationChannels({ PI_NOTIFY_MODE: "both" }, "darwin", true), ["local", "push"]);
});

function harness(env: NodeJS.ProcessEnv = { NOTIFY_URL: "https://ntfy.sh/test" }) {
	const handlers = new Map<string, (event: any, ctx: any) => unknown>();
	const commands = new Map<string, any>();
	const entries: any[] = [
		{ id: "answer", type: "message", message: { role: "assistant", content: [{ type: "text", text: "Ready to review." }] } },
	];
	const local: Array<[string, string]> = [];
	const pushes: string[] = [];
	const notices: string[] = [];
	const pi = {
		on(event: string, handler: (event: any, ctx: any) => unknown) {
			handlers.set(event, handler);
		},
		registerCommand(name: string, command: any) {
			commands.set(name, command);
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
	};
	const ctx = {
		mode: "tui",
		hasUI: true,
		isIdle: () => true,
		hasPendingMessages: () => false,
		sessionManager: {
			getBranch: () => entries,
			getLeafId: () => "answer",
		},
		ui: { notify: (message: string) => notices.push(message) },
	};

	registerNotify(pi as never, {
		env,
		platform: "darwin",
		stdoutIsTTY: true,
		getTmuxState: () => ({ attached: true, target: "work:2.0 tests" }),
		notifyLocal: (title, summary) => local.push([title, summary]),
		notifyPush: (summary) => pushes.push(summary),
	});
	return { commands, ctx, entries, handlers, local, notices, pushes };
}

test("notifies once after Pi fully settles", async () => {
	const h = harness();
	await h.handlers.get("session_start")?.({}, h.ctx);
	await h.handlers.get("agent_settled")?.({}, h.ctx);
	await h.handlers.get("agent_settled")?.({}, h.ctx);

	assert.equal(h.local.length, 1);
	assert.match(h.local[0]?.[0] ?? "", /Pi needs you.*work:2\.0 tests/);
	assert.equal(h.local[0]?.[1], "Ready to review.");
	assert.deepEqual(h.pushes, []);
});

test("session command disables and restores notifications", async () => {
	const h = harness({ NOTIFY_URL: "https://ntfy.sh/test", SSH_CONNECTION: "client" });
	await h.handlers.get("session_start")?.({}, h.ctx);
	await h.commands.get("notify").handler("off", h.ctx);
	await h.handlers.get("agent_settled")?.({}, h.ctx);
	assert.deepEqual(h.pushes, []);
	assert.deepEqual(h.entries.at(-1)?.data, { version: 1, enabled: false });

	await h.handlers.get("session_start")?.({ reason: "reload" }, h.ctx);
	await h.commands.get("notify").handler("status", h.ctx);
	assert.match(h.notices.at(-1) ?? "", /disabled.*ntfy configured/i);
});

test("random-pet generates short topic-safe names", () => {
	const script = fileURLToPath(new URL("../../.bin/random-pet", import.meta.url));
	const generated = new Set<string>();
	for (let index = 0; index < 10; index++) {
		const result = spawnSync("/bin/sh", [script], { encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout.trim(), /^[a-z]+-[a-z]+-[-_A-Za-z0-9]{8}$/);
		generated.add(result.stdout.trim());
	}
	assert.equal(generated.size, 10);
});

test("notify CLI stores configuration and publishes through curl", () => {
	const root = mkdtempSync(join(tmpdir(), "notify-test-"));
	const bin = join(root, "bin");
	mkdirSync(bin);
	const argsFile = join(root, "curl-args");
	const bodyFile = join(root, "curl-body");
	const fakeCurl = join(bin, "curl");
	writeFileSync(fakeCurl, `#!/bin/sh\nprintf '%s\\n' "$@" > "$FAKE_CURL_ARGS"\ncat > "$FAKE_CURL_BODY"\n`);
	chmodSync(fakeCurl, 0o755);
	for (const [name, body] of [
		["hostname", "printf 'mac-mini\\n'"],
		["tmux", "printf 'mobile:4.1 agent\\n'"],
	] as const) {
		const path = join(bin, name);
		writeFileSync(path, `#!/bin/sh\n${body}\n`);
		chmodSync(path, 0o755);
	}
	const script = fileURLToPath(new URL("../../.bin/notify", import.meta.url));
	const env = {
		...process.env,
		HOME: root,
		PATH: `${bin}:${process.env.PATH}`,
		FAKE_CURL_ARGS: argsFile,
		FAKE_CURL_BODY: bodyFile,
		TMUX: "",
		SSH_CONNECTION: "",
		NOTIFY_URL: "",
		NOTIFY_TOKEN: "",
	};

	const setup = spawnSync("/bin/sh", [script, "setup", "agent-test-secret"], { env, encoding: "utf8" });
	assert.equal(setup.status, 0, setup.stderr);
	assert.match(setup.stdout, /https:\/\/ntfy\.sh\/agent-test-secret/);

	const sent = spawnSync("/bin/sh", [script, "send", "--title", "Pi test", "--", "Ready now"], {
		env,
		encoding: "utf8",
	});
	assert.equal(sent.status, 0, sent.stderr);
	assert.match(readFileSync(argsFile, "utf8"), /Title: Pi test/);
	assert.match(readFileSync(argsFile, "utf8"), /https:\/\/ntfy\.sh\/agent-test-secret/);
	assert.equal(readFileSync(bodyFile, "utf8"), "Ready now\n");

	const withProvenance = spawnSync("/bin/sh", [script, "send", "Tmux needs attention"], {
		env: { ...env, TMUX: "socket" },
		encoding: "utf8",
	});
	assert.equal(withProvenance.status, 0, withProvenance.stderr);
	assert.match(readFileSync(argsFile, "utf8"), /Title: Agent needs you · mac-mini · mobile:4\.1 agent/);

	const generated = spawnSync("/bin/sh", [script, "setup"], { env, encoding: "utf8" });
	assert.equal(generated.status, 0, generated.stderr);
	assert.match(generated.stdout, /https:\/\/ntfy\.sh\/[a-z]+-[a-z]+-[-_A-Za-z0-9]{8}/);

	const existing = spawnSync("/bin/sh", [script, "setup", "--topic", "https://push.example.test/my-pets"], {
		env,
		encoding: "utf8",
	});
	assert.equal(existing.status, 0, existing.stderr);
	assert.match(existing.stdout, /https:\/\/push\.example\.test\/my-pets/);
});
