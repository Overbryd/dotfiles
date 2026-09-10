import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

test("dotfiles setup installs pi-inspect dependencies and links the package for auto-discovery", () => {
	const home = mkdtempSync(join(tmpdir(), "pi-inspect-setup-"));
	try {
		for (const target of ["pi-inspect", "dotfiles"]) {
			const result = spawnSync("make", ["-nB", target, `DOTFILES_ROOT=${root}`], {
				cwd: root,
				env: { ...process.env, HOME: home },
				encoding: "utf8",
			});
			assert.equal(result.status, 0, result.stderr);
			assert.ok(result.stdout.includes("npm ci --ignore-scripts --prefix pi-inspect"), result.stdout);
			assert.ok(result.stdout.includes(`ln -svfn ${root}/pi-inspect ${home}/.pi/agent/extensions/pi-inspect`), result.stdout);
		}
		// Exercise linking without installing dependencies or touching the real home.
		for (let run = 0; run < 2; run++) {
			const result = spawnSync("make", ["-o", "pi-inspect/node_modules/.package-lock.json", "pi-inspect", `DOTFILES_ROOT=${root}`], {
				cwd: root,
				env: { ...process.env, HOME: home },
				encoding: "utf8",
			});
			assert.equal(result.status, 0, result.stdout + result.stderr);
		}
		const installed = join(home, ".pi/agent/extensions/pi-inspect");
		assert.equal(realpathSync(installed), realpathSync(join(root, "pi-inspect")));
		const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
		assert.equal(manifest.name, "pi-inspect");
		assert.deepEqual(manifest.pi.extensions, ["./pi-extension/index.ts"]);
		assert.ok(existsSync(join(installed, manifest.pi.extensions[0])));
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
