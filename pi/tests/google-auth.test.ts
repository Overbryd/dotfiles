import assert from "node:assert/strict";
import test from "node:test";
import { needsGoogleReauth, recoverGoogleStream, scopedGoogleEnv } from "../lib/google-auth.ts";

const failure = {
	type: "error",
	error: { role: "assistant", provider: "google-vertex", stopReason: "error", errorMessage: 'invalid_grant: invalid_rapt', content: [] },
};

test("phone repair holds the failed model request and resumes without a terminal error", async () => {
	const calls: string[] = [];
	let attempts = 0;
	async function* start() {
		calls.push("model");
		if (attempts++ === 0) yield failure;
		else yield { type: "done" };
	}
	const result = [];
	for await (const event of recoverGoogleStream(start, async () => { calls.push("phone"); })) result.push(event.type);
	assert.deepEqual(calls, ["model", "phone", "model"]);
	assert.deepEqual(result, ["done"]);
});

test("authentication repair is bounded and never replays emitted output or completed tools", async () => {
	let repairs = 0;
	async function* alwaysFails() { yield failure; }
	const result = [];
	for await (const event of recoverGoogleStream(alwaysFails, async () => { repairs++; })) result.push(event.type);
	assert.equal(repairs, 1);
	assert.deepEqual(result, ["error"]);
	async function* afterOutput() { yield { type: "toolcall_end" }; yield failure; }
	for await (const _ of recoverGoogleStream(afterOutput, async () => { repairs++; })) { /* consume */ }
	assert.equal(repairs, 1);
});

test("cancelled phone repair does not reissue the model request", async () => {
	let attempts = 0;
	async function* start() { attempts++; yield failure; }
	await assert.rejects(async () => {
		for await (const _ of recoverGoogleStream(start, async () => { throw new Error("cancelled"); })) { /* consume */ }
	}, /cancelled/);
	assert.equal(attempts, 1);
});

test("scope, permission, quota and other-provider failures never request Google sign-in", () => {
	for (const errorMessage of ["403 insufficientPermissions", "429 quota exceeded", "invalid_scope", "invalid_grant: configuration problem"]) {
		assert.equal(needsGoogleReauth({ ...failure.error, errorMessage }), false);
	}
	assert.equal(needsGoogleReauth({ ...failure.error, provider: "openai" }), false);
	assert.equal(needsGoogleReauth({ ...failure.error, stopReason: "aborted" }), false);
});

test("provider-scoped Vertex credentials strip ambient work-folder gcloud selectors", () => {
	const env = scopedGoogleEnv(
		{
			HOME: "/Users/partenkirchen",
			GOOGLE_APPLICATION_CREDENTIALS: "/Users/partenkirchen/Work/hibase/.google_application_credentials.json",
			GOOGLE_CLOUD_PROJECT: "wrong-project",
			CLOUDSDK_CONFIG: "/Users/partenkirchen/Work/HelloFresh/.config/gcloud",
			CLOUDSDK_CORE_ACCOUNT: "lukas.rieder@ext.hellofresh.com",
			CLOUDSDK_ACTIVE_CONFIG_NAME: "oht",
		},
		{
			GOOGLE_APPLICATION_CREDENTIALS: "/Users/partenkirchen/Work/Parlant/.config/gcloud-parlant/application_default_credentials.json",
			GOOGLE_CLOUD_PROJECT: "gen-lang-client-0951766844",
			GOOGLE_CLOUD_LOCATION: "global",
		},
	);
	assert.equal(
		env.GOOGLE_APPLICATION_CREDENTIALS,
		"/Users/partenkirchen/Work/Parlant/.config/gcloud-parlant/application_default_credentials.json",
	);
	assert.equal(env.GOOGLE_CLOUD_PROJECT, "gen-lang-client-0951766844");
	assert.equal(env.GOOGLE_CLOUD_LOCATION, "global");
	assert.equal(env.CLOUDSDK_CONFIG, undefined);
	assert.equal(env.CLOUDSDK_CORE_ACCOUNT, undefined);
	assert.equal(env.CLOUDSDK_ACTIVE_CONFIG_NAME, undefined);
});
