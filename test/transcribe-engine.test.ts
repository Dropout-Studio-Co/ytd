import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	LOCAL_TRANSCRIPTION_MARKER,
	isLocalTranscript,
	localTranscript,
	localTranscriptionPath,
	resolveEngine
} from "../src/transcribe.ts";

const id = "dQw4w9WgXcQ";
const dirs: string[] = [];
function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "ytd-engine-"));
	dirs.push(dir);
	const model = join(dir, "ggml-model.bin");
	writeFileSync(model, "model");
	return { dir, model };
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("engine settings are floored rather than passed through as given", () => {
	const { model } = fixture();
	const resolved = resolveEngine({
		command: process.execPath,
		model,
		threads: 0,
		timeoutMs: 1
	});
	if (!resolved.ok) throw new Error(resolved.reason);
	// A zero thread count or a one-millisecond timeout cannot be honoured; the engine gets the
	// smallest values that can actually do the work instead of an invalid invocation.
	expect(resolved.engine).toEqual({
		command: process.execPath,
		model,
		language: "en",
		threads: 1,
		timeoutMs: 60_000
	});
	const requested = resolveEngine({
		command: process.execPath,
		model,
		threads: 2.9,
		language: "ur",
		timeoutMs: 90_000
	});
	if (!requested.ok) throw new Error(requested.reason);
	expect(requested.engine.threads).toBe(2);
	expect(requested.engine.language).toBe("ur");
	expect(requested.engine.timeoutMs).toBe(90_000);
});

test("transcript identity is validated before it becomes a cache path", () => {
	const { dir } = fixture();
	expect(localTranscriptionPath(id, dir)).toBe(join(dir, "videos", `${id}.local.txt`));
	for (const bad of ["", "short", "../escape", `${id}.txt`])
		expect(() => localTranscriptionPath(bad, dir), bad).toThrow("Invalid video identity");
});

test("generated speech is labelled, and an empty or absent cache is not knowledge", () => {
	const { dir } = fixture();
	mkdirSync(join(dir, "videos"), { recursive: true });
	expect(localTranscript(id, dir)).toBeNull();
	writeFileSync(localTranscriptionPath(id, dir), "   \n");
	expect(localTranscript(id, dir)).toBeNull();
	writeFileSync(localTranscriptionPath(id, dir), "Recovered speech\n");
	expect(localTranscript(id, dir)).toBe(`${LOCAL_TRANSCRIPTION_MARKER}\nRecovered speech`);
	expect(isLocalTranscript(localTranscript(id, dir)!)).toBe(true);
	// Published captions are never mistaken for generated speech, and the marker must lead.
	expect(isLocalTranscript("Published captions")).toBe(false);
	expect(isLocalTranscript(`Text before\n${LOCAL_TRANSCRIPTION_MARKER}`)).toBe(false);
});
