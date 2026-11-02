import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Process-level behaviour of the real entry point.
 *
 * Argument resolution is unit-tested elsewhere; what only a spawned process can prove is that a
 * refused invocation fails the way a script or CI expects: a non-zero exit, the reason on stderr,
 * and no half-written state under the operator's own home.
 */
const entry = join(import.meta.dir, "..", "src", "cli.ts");
const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function runCli(args: string[]) {
	const home = mkdtempSync(join(tmpdir(), "ytd-exit-"));
	homes.push(home);
	const child = Bun.spawnSync([process.execPath, entry, ...args], {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		timeout: 20_000,
		env: { ...process.env, HOME: home, TERM: "dumb", NO_COLOR: "1" }
	});
	return {
		code: child.exitCode,
		stdout: child.stdout.toString(),
		stderr: child.stderr.toString(),
		config: join(home, ".ytd", "config.json")
	};
}

test("help is a successful, silent-about-work exit", () => {
	const run = runCli(["--help"]);
	expect(run.code).toBe(0);
	expect(run.stdout).toContain("Usage: ytd [youtube-url]");
	expect(run.stderr).toBe("");
	// Help selects nothing, so there is no session and no invented runtime.
	expect(run.stdout).not.toContain("Total runtime:");
});

test("an unknown option fails with the reason on stderr and a non-zero exit", () => {
	const run = runCli(["--nope"]);
	expect(run.code).toBe(1);
	expect(run.stderr).toContain("Unknown argument: --nope");
	expect(run.stdout).not.toContain("Usage: ytd");
});

test("changing the agent without a model is refused before any work starts", () => {
	const run = runCli(["https://youtu.be/dQw4w9WgXcQ", "--agent", "codex"]);
	expect(run.code).toBe(1);
	expect(run.stderr).toContain("Changing agent requires --model");
	expect(run.stdout).not.toContain("Selected");
});

test("settings management without a terminal refuses and leaves config.json unwritten", () => {
	const run = runCli(["settings"]);
	expect(run.code).toBe(1);
	expect(run.stderr).toContain("interactive terminal");
	expect(existsSync(run.config)).toBe(false);
});
