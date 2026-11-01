import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Manifest, stableHash } from "../src/manifest.ts";

const dirs: string[] = [];
function fixtures() {
	const dir = mkdtempSync(join(tmpdir(), "ytd-scope-"));
	dirs.push(dir);
	return { dir, manifest: new Manifest("scope", dir) };
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const video = (id: string) => ({ id, title: id.toUpperCase() });

test("run-scoped reads and writes refuse to invent a run", () => {
	const { manifest } = fixtures();
	try {
		expect(() => manifest.total()).toThrow("Select a run");
		expect(() => manifest.checkpoint("publication:content", {})).toThrow("Select a run");
		expect(() => manifest.hasPublicationPlans()).toThrow("Select a run");
		expect(() => manifest.rows(["anything"])).toThrow("Select a run");
	} finally {
		manifest.close();
	}
});

test("a row outside this run is refused instead of silently forgotten", () => {
	const { manifest } = fixtures();
	try {
		manifest.beginRun({ source: "s", model: "m" });
		manifest.addVideos([video("a")]);
		expect(() => manifest.setStatus("other", "failed")).toThrow("outside the selected run");
		expect(() => manifest.setTitle("other", "Title")).toThrow("outside the selected run");
	} finally {
		manifest.close();
	}
});

test("progress is counted per status and batch reads deduplicate identities", () => {
	const { manifest } = fixtures();
	try {
		manifest.beginRun({ source: "s", model: "m" });
		manifest.addVideos([video("a"), video("b"), video("c")]);
		manifest.setStatus("a", "distilled");
		manifest.setStatus("b", "no_captions");
		expect(manifest.total()).toBe(3);
		expect(manifest.counts()).toEqual({ distilled: 1, no_captions: 1, pending: 1 });
		// Repeats collapse, unknown identities are simply absent, and both survivors come back.
		expect(
			manifest
				.rows(["a", "a", "missing", "b"])
				.map((row) => row.id)
				.sort()
		).toEqual(["a", "b"]);
	} finally {
		manifest.close();
	}
});

test("publication recovery is visible before anything is rewritten", () => {
	const { manifest } = fixtures();
	try {
		manifest.beginRun({ source: "s", model: "m" });
		expect(manifest.hasPublicationPlans()).toBe(false);
		manifest.checkpoint("publication:content", { marker: "<!-- ytd:run -->" });
		expect(manifest.hasPublicationPlans()).toBe(true);
		expect(manifest.getCheckpoint("publication:content")).toEqual({
			marker: "<!-- ytd:run -->"
		});
		expect(manifest.getCheckpoint("publication:absent")).toBeUndefined();
	} finally {
		manifest.close();
	}
});

test("completion is terminal: a later run never downgrades a published video", () => {
	const { manifest } = fixtures();
	try {
		manifest.beginRun({ source: "s", model: "m1" });
		manifest.addVideos([video("a")]);
		manifest.setStatus("a", "distilled");
		manifest.completeRun();
		// A new model on the same source is separate work, but what was published is shared.
		manifest.beginRun({ source: "s", model: "m2" });
		manifest.addVideos([video("a")]);
		expect(manifest.row("a")?.status).toBe("done");
		manifest.setStatus("a", "distilled");
		manifest.beginRun({ source: "s", model: "m3" });
		manifest.addVideos([video("a")]);
		expect(manifest.row("a")?.status).toBe("done");
	} finally {
		manifest.close();
	}
});

test("cache identities ignore key order but never array order or type", () => {
	// Checkpoints are keyed by a hash of assembled data, so the same knowledge built in a
	// different property order must still resume, while reordered lists are different data.
	expect(stableHash({ a: 1, b: { c: 2, d: [3] } })).toBe(stableHash({ b: { d: [3], c: 2 }, a: 1 }));
	expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
	expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: "1" }));
});
