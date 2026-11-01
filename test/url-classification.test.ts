import { expect, test } from "bun:test";
import { canonicalSource, parseVideoId, storageIdentity, tabUrls } from "../src/enumerate.ts";
import { describeSource } from "../src/cli.ts";

const id = "dQw4w9WgXcQ";
const watch = `https://www.youtube.com/watch?v=${id}`;

test("every accepted single-video form canonicalises to one watched identity", () => {
	// The host and the path vary by where a link was copied from; the source ytd records must not.
	for (const url of [
		`https://m.youtube.com/watch?v=${id}&t=30`,
		`https://music.youtube.com/watch?v=${id}`,
		`https://youtu.be/${id}?t=5`,
		`https://www.youtube.com/shorts/${id}`,
		`https://www.youtube.com/live/${id}`,
		`https://www.youtube.com/embed/${id}`
	]) {
		expect(parseVideoId(url), url).toBe(id);
		expect(canonicalSource(url), url).toBe(watch);
		expect(storageIdentity(url), url).toBe(storageIdentity(watch));
	}
});

test("a channel keeps one identity whatever tab or trailing slash was pasted", () => {
	for (const suffix of ["", "/videos", "/shorts", "/streams", "/featured", "/shorts/"])
		expect(canonicalSource(`https://youtube.com/@name${suffix}`), suffix).toBe(
			"https://www.youtube.com/@name"
		);
	expect(canonicalSource("https://YOUTUBE.com/channel/UCabc/streams")).toBe(
		"https://www.youtube.com/channel/UCabc"
	);
});

test("playlists must name a list, and unrelated paths are refused", () => {
	expect(canonicalSource("https://youtube.com/embed/videoseries?list=PLabc")).toBe(
		"https://www.youtube.com/playlist?list=PLabc"
	);
	expect(tabUrls("https://youtube.com/playlist?list=PLabc", ["videos", "shorts"])).toEqual([
		{ tab: "playlist", url: "https://www.youtube.com/playlist?list=PLabc" }
	]);
	expect(tabUrls("https://youtube.com/@name", ["videos", "shorts"])).toEqual([
		{ tab: "videos", url: "https://www.youtube.com/@name/videos" },
		{ tab: "shorts", url: "https://www.youtube.com/@name/shorts" }
	]);
	expect(() => canonicalSource("https://youtube.com/playlist?list=not a list")).toThrow(
		"Invalid YouTube playlist"
	);
	expect(() => canonicalSource("https://youtube.com/@name/community")).toThrow(
		"Unsupported YouTube URL path"
	);
	expect(() => canonicalSource("https://youtu.be/" + id + "/extra")).toThrow(
		"Unsupported YouTube URL path"
	);
});

test("the status line describes the canonical source, not the text that was typed", () => {
	// A short link and its watched form are the same source, so both must read the same.
	expect(describeSource(canonicalSource(`https://youtu.be/${id}`))).toBe(`YouTube · Video ${id}`);
	expect(describeSource("https://www.youtube.com/playlist?list=PLabc")).toBe(
		"YouTube · Playlist PLabc"
	);
	expect(describeSource("https://www.youtube.com/@name")).toBe("YouTube · Channel @name");
	// Percent-encoded handles are decoded for display rather than shown as escapes.
	expect(describeSource("https://www.youtube.com/@%D9%85%D8%AD%D9%85%D8%AF")).toBe(
		"YouTube · Channel @محمد"
	);
});
