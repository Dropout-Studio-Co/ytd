import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	REMOVED_AGENT_ERROR,
	parseArgs,
	profileFromArgs,
	resolveCli,
	saveSettings,
	type Settings
} from "../src/settings.ts";

const dirs: string[] = [];
function configPath() {
	const dir = mkdtempSync(join(tmpdir(), "ytd-args-"));
	dirs.push(dir);
	return join(dir, "config.json");
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const source = "https://youtu.be/dQw4w9WgXcQ";

test("boolean flags reject a value or a repeat instead of reading either as on", () => {
	expect(parseArgs(["--perf", "--verbose", "--transcribe"])).toEqual({
		command: "run",
		perf: true,
		verbose: true,
		transcribe: true
	});
	expect(() => parseArgs(["--perf=1"])).toThrow("--perf does not take a value");
	expect(() => parseArgs(["--verbose", "--verbose"])).toThrow("was supplied more than once");
});

test("numeric flags accept an inline value and enforce their documented range", () => {
	expect(parseArgs(["--fetch-concurrency=8", "--max-attempts", "2"])).toEqual({
		command: "run",
		fetchConcurrency: 8,
		maxAttempts: 2
	});
	// Zero pacing is a real setting: it asks for no spacing rather than being read as absent.
	expect(parseArgs(["--fetch-pacing-ms", "0"]).fetchPacingMs).toBe(0);
	for (const argv of [
		["--fetch-concurrency", "0"],
		["--fetch-concurrency", "65"],
		["--extract-concurrency", "33"],
		["--max-attempts", "11"],
		["--context-tokens", "4095"],
		["--timeout-ms", "0"],
		["--fetch-pacing-ms", "600001"]
	])
		expect(() => parseArgs(argv), argv.join(" ")).toThrow("Invalid");
});

test("a missing, empty or flag-like value is refused rather than consumed", () => {
	for (const argv of [["--model"], ["--model="], ["--model", "--perf"], ["--fetch-concurrency"]])
		expect(() => parseArgs(argv), argv.join(" ")).toThrow("requires a value");
});

test("one positional source is accepted, and only for the run command", () => {
	expect(parseArgs([source]).url).toBe(source);
	expect(parseArgs(["settings"]).command).toBe("settings");
	expect(parseArgs(["agents", "add"]).command).toBe("add");
	// `ytd agents` is not a command, so it stays what it has always been: a (later rejected) source.
	expect(parseArgs(["agents"])).toEqual({ command: "run", url: "agents" });
	expect(() => parseArgs([source, "extra"])).toThrow("Unexpected argument: extra");
	expect(() => parseArgs(["settings", source])).toThrow("Unexpected argument");
});

test("help is terminal wherever it is written, and never a runtime", () => {
	expect(parseArgs(["--help"]).command).toBe("help");
	expect(parseArgs(["-h"]).command).toBe("help");
	expect(parseArgs([source, "--help"]).command).toBe("help");
	expect(parseArgs(["--help", source]).command).toBe("help");
});

test("a model change drops inherited limits, while an effort change keeps them", () => {
	const settings: Settings = {
		version: 1,
		recent: [],
		adapters: {},
		selected: {
			agent: "claude",
			model: "opus",
			effort: "high",
			contextTokens: 200_000,
			timeoutMs: 5000
		}
	};
	expect(profileFromArgs(parseArgs(["--model", "sonnet"]), settings)).toEqual({
		agent: "claude",
		model: "sonnet"
	});
	expect(profileFromArgs(parseArgs(["--model", "sonnet", "--effort", "low"]), settings)).toEqual({
		agent: "claude",
		model: "sonnet",
		effort: "low"
	});
	// Nothing about the selected model changed, so its reported window and timeout still apply.
	expect(profileFromArgs(parseArgs(["--effort", "low"]), settings)).toEqual({
		agent: "claude",
		model: "opus",
		effort: "low",
		contextTokens: 200_000,
		timeoutMs: 5000
	});
});

test("a trusted adapter is carried with its profile, and an unknown agent is refused", () => {
	const custom = { executable: "/usr/local/bin/wrap", args: ["--model", "{model}"] };
	const settings: Settings = { version: 1, recent: [], adapters: { wrap: custom } };
	expect(profileFromArgs(parseArgs(["--agent", "wrap", "--model", "m"]), settings)).toEqual({
		agent: "wrap",
		model: "m",
		custom
	});
	expect(() => profileFromArgs(parseArgs(["--agent", "nope", "--model", "m"]), settings)).toThrow(
		"Unknown or invalid agent/model: nope"
	);
});

test("the removed agent stays refused unless a trusted wrapper owns the name", () => {
	const settings: Settings = { version: 1, recent: [], adapters: {} };
	expect(() =>
		profileFromArgs(parseArgs(["--agent", "freebuff", "--model", "m"]), settings)
	).toThrow(REMOVED_AGENT_ERROR);
	const custom = { executable: "/bin/true", args: [] };
	expect(
		profileFromArgs(parseArgs(["--agent", "freebuff", "--model", "m"]), {
			...settings,
			adapters: { freebuff: custom }
		})
	).toEqual({ agent: "freebuff", model: "m", custom });
});

test("run controls map only the flags that were given, never invented defaults", async () => {
	const path = configPath();
	const selected = { agent: "claude", model: "opus", effort: "high" };
	saveSettings({ version: 1, selected, recent: [selected], adapters: {} }, path);
	const bare = await resolveCli([source], { path, interactive: false });
	expect(bare?.run).toEqual({
		replaceRouting: false,
		concurrency: {},
		perf: false,
		verbose: false
	});
	const flagged = await resolveCli(
		[
			source,
			"--perf",
			"--verbose",
			"--fetch-concurrency=6",
			"--extract-concurrency",
			"3",
			"--fetch-pacing-ms",
			"0",
			"--max-attempts",
			"2"
		],
		{ path, interactive: false }
	);
	expect(flagged?.run.concurrency).toEqual({
		fetch: 6,
		extract: 3,
		fetchPacingMs: 0,
		maxAttempts: 2
	});
	expect(flagged?.run.perf).toBe(true);
	expect(flagged?.run.verbose).toBe(true);
	expect(flagged?.run.transcription).toBeUndefined();
	// The saved selection is still what an unflagged run uses.
	expect(flagged?.profile).toEqual(selected);
});

test("local transcription is one explicit request with its own engine paths", async () => {
	const path = configPath();
	const selected = { agent: "claude", model: "opus" };
	saveSettings({ version: 1, selected, recent: [selected], adapters: {} }, path);
	const transcribed = await resolveCli(
		[source, "--transcribe", "--whisper-command", "/opt/whisper-cli", "--whisper-model", "/m.bin"],
		{ path, interactive: false }
	);
	expect(transcribed?.run.transcription).toEqual({
		enabled: true,
		command: "/opt/whisper-cli",
		model: "/m.bin"
	});
	// Engine paths without the switch never turn transcription on.
	const off = await resolveCli([source, "--whisper-model", "/m.bin"], { path, interactive: false });
	expect(off?.run.transcription).toBeUndefined();
});
