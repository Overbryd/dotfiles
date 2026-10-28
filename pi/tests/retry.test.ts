import assert from "node:assert/strict";
import childProcess from "node:child_process";
import test from "node:test";
import retryExtension from "../extensions/retry.ts";

const reauthFailure = { role: "assistant", provider: "google-vertex", stopReason: "error", errorMessage: "invalid_grant: invalid_rapt" };
function harness(message = reauthFailure) {
	const calls: string[] = [];
	let handler: (args: string, context: never) => Promise<void>;
	const context = {
		mode: "rpc", hasUI: false, signal: undefined,
		model: { provider: "google-vertex" },
		sessionManager: { getBranch: () => [{ type: "message", message }] },
		modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, env: { GOOGLE_APPLICATION_CREDENTIALS: "/scoped/adc.json" } }) },
		ui: { setStatus() {}, notify() {} },
		async waitForIdle() { calls.push("idle"); },
		async retryLastTurn() { calls.push("retry"); },
	};
	retryExtension({ on() {}, registerCommand(_name: string, command: { handler: typeof handler }) { handler=command.handler; } } as never);
	return { calls, context, retry: (args="")=>handler(args,context as never) };
}

test("RPC retry delegates discovery to cooperative ensure without a terminal prompt", async (t) => {
	const h=harness();
	t.mock.method(childProcess,"spawn",(command: string,args: string[],options: childProcess.SpawnOptions)=>{
		assert.equal(command,"token-exchange"); assert.deepEqual(args.slice(0,4),["google","ensure","--for","adc"]);
		assert.equal(options.env?.GOOGLE_APPLICATION_CREDENTIALS,"/scoped/adc.json");assert.equal(options.stdio,"ignore");
		const child={once(event: string,callback: (code:number)=>void){if(event==="exit")queueMicrotask(()=>callback(0));return child;}};
		return child;
	});
	await h.retry();assert.deepEqual(h.calls,["idle","retry"]);
});

test("ensure failure never retries the failed model",async(t)=>{
	const h=harness();
	t.mock.method(childProcess,"spawn",()=>{
		const child={once(event:string,callback:(code:number)=>void){if(event==="exit")queueMicrotask(()=>callback(1));return child;}};return child;
	});
	await assert.rejects(h.retry(),/failed or was cancelled/);assert.deepEqual(h.calls,["idle"]);
});

test("skip-auth and unrelated errors never launch ensure",async()=>{
	const h=harness();await h.retry("--skip-auth");assert.deepEqual(h.calls,["idle","retry"]);
	for(const message of [{...reauthFailure,provider:"openai"},{...reauthFailure,errorMessage:"403 insufficientPermissions"},{...reauthFailure,stopReason:"aborted"}]){
		const other=harness(message);await other.retry();assert.deepEqual(other.calls,["idle","retry"]);
	}
});

test("switching provider or a newer successful response does not repair stale auth errors",async()=>{
	const h=harness();h.context.model.provider="openai";await h.retry();assert.deepEqual(h.calls,["idle","retry"]);
	const fresh=harness();fresh.context.sessionManager.getBranch=()=>[{type:"message",message:reauthFailure},{type:"message",message:{...reauthFailure,stopReason:"stop"}}];
	await fresh.retry();assert.deepEqual(fresh.calls,["idle","retry"]);
});
