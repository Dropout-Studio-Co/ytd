import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Scratch space for fixtures whose cost is dominated by durable storage rather than by the
 * behaviour they verify.
 *
 * The scale fixtures drive thousands of SQLite transactions, and every commit costs the runner an
 * fsync on the disk backing the OS temp directory. What those fixtures are proving — that every
 * discovered identity is scheduled and accounted for exactly once, that the queue drains with
 * bounded resident memory, that extraction overlaps fetching — is a property of the scheduling
 * layer, not of the storage medium: no assertion in them concerns crash durability, which is
 * covered by the recovery tests that use the ordinary temp directory. Running them on a
 * memory-backed filesystem removes the fsync latency so the tests measure the algorithm.
 *
 * Where no such filesystem exists (macOS has no `/dev/shm`) the OS temp directory is used
 * unchanged, so the fixture behaves exactly as before.
 */
const memoryBacked = process.platform === "linux" && existsSync("/dev/shm") ? "/dev/shm" : null;

/** Create a unique scratch directory, preferring memory-backed storage when it is available. */
export function scratchDir(prefix: string): string {
	if (memoryBacked) {
		try {
			return mkdtempSync(join(memoryBacked, prefix));
		} catch {
			// A memory filesystem that exists but cannot be written (read-only, or full) must not
			// turn a scale fixture into a failure: fall through to the ordinary temp directory.
		}
	}
	return mkdtempSync(join(tmpdir(), prefix));
}
