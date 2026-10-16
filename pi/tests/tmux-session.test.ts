import assert from "node:assert/strict";
import test from "node:test";
import { registerTmuxSessionSync, type TmuxSessionClient, type TmuxWindowState } from "../extensions/tmux-session.ts";

function harness(initialName?: string) {
	const handlers = new Map<string, (event: any, ctx: any) => unknown>();
	let sessionName = initialName;
	let tick = () => {};
	let stopped = false;
	const namesSetByTmux: string[] = [];
	const renamedWindows: string[] = [];
	let state: TmuxWindowState | undefined = {
		windowId: "@1",
		name: "shell",
		automaticRename: false,
		piPaneCount: 1,
	};
	const client: TmuxSessionClient = {
		mark: () => true,
		clear() {},
		windowState: () => state,
		renameWindow(_windowId, name) {
			renamedWindows.push(name);
			if (state) state = { ...state, name, automaticRename: false };
			return true;
		},
	};
	const pi = {
		on(event: string, handler: (event: any, ctx: any) => unknown) {
			handlers.set(event, handler);
		},
		getSessionName: () => sessionName,
		setSessionName(name: string) {
			sessionName = name;
			namesSetByTmux.push(name);
		},
	};
	registerTmuxSessionSync(pi as never, {
		client,
		schedule(callback) {
			tick = callback;
			return () => {
				stopped = true;
			};
		},
	});
	const ctx = { sessionManager: { getSessionFile: () => "/session.jsonl", getSessionId: () => "session-id" } };
	return {
		ctx,
		handlers,
		namesSetByTmux,
		renamedWindows,
		setPiName(name: string) {
			sessionName = name;
		},
		setState(next: TmuxWindowState) {
			state = next;
		},
		stopped: () => stopped,
		tick: () => tick(),
	};
}

test("Pi session rename propagates to a window carrying one Pi", async () => {
	const h = harness("old");
	await h.handlers.get("session_start")?.({ reason: "startup" }, h.ctx);
	h.setPiName("TODAY");
	await h.handlers.get("session_info_changed")?.({ type: "session_info_changed", name: "TODAY" }, h.ctx);

	assert.deepEqual(h.renamedWindows, ["TODAY"]);
});

test("explicit tmux window rename propagates to Pi", async () => {
	const h = harness("old");
	await h.handlers.get("session_start")?.({ reason: "startup" }, h.ctx);
	h.setState({ windowId: "@1", name: "SES-177", automaticRename: false, piPaneCount: 1 });
	h.tick();

	assert.deepEqual(h.namesSetByTmux, ["SES-177"]);
});

test("automatic tmux names are ignored and an existing Pi name wins after they settle", async () => {
	const h = harness("named-session");
	await h.handlers.get("session_start")?.({ reason: "startup" }, h.ctx);
	h.setState({ windowId: "@1", name: "node", automaticRename: true, piPaneCount: 1 });
	h.tick();
	h.tick();

	assert.deepEqual(h.namesSetByTmux, []);
	assert.deepEqual(h.renamedWindows, ["named-session"]);
});

test("automatic tmux names and multi-Pi windows do not propagate", async () => {
	const h = harness("old");
	await h.handlers.get("session_start")?.({ reason: "startup" }, h.ctx);
	h.setState({ windowId: "@1", name: "node", automaticRename: true, piPaneCount: 1 });
	h.tick();
	h.setState({ windowId: "@1", name: "shared", automaticRename: false, piPaneCount: 2 });
	h.tick();
	h.setPiName("new-pi-name");
	await h.handlers.get("session_info_changed")?.({ type: "session_info_changed", name: "new-pi-name" }, h.ctx);

	assert.deepEqual(h.namesSetByTmux, []);
	assert.deepEqual(h.renamedWindows, []);
});

test("startup aligns an existing Pi name after panes have registered and shutdown stops polling", async () => {
	const h = harness("named-session");
	await h.handlers.get("session_start")?.({ reason: "startup" }, h.ctx);
	assert.deepEqual(h.renamedWindows, []);

	h.tick();
	assert.deepEqual(h.renamedWindows, ["named-session"]);
	await h.handlers.get("session_shutdown")?.({}, h.ctx);
	assert.equal(h.stopped(), true);
});
