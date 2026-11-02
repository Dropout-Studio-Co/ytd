#!/usr/bin/env bash
# Run one deterministic slice of the Bun test suite so the slow suite can run in parallel shards.
#
# Files are assigned greedily, largest first, to the shard with the least bytes assigned so far.
# File size is a good proxy for runtime here because the slow tests are the ones that spawn the
# real CLI and read large fixtures. The assignment is deterministic (size desc, then path), so
# every shard always gets the same disjoint set and the union covers every test file exactly once.
#
# Usage: scripts/test-shard.sh <shard> <total>
set -euo pipefail

shard="${1:?usage: test-shard.sh <shard> <total>}"
total="${2:?usage: test-shard.sh <shard> <total>}"

if [ "$shard" -lt 1 ] || [ "$shard" -gt "$total" ]; then
	echo "shard must be between 1 and $total" >&2
	exit 2
fi

# Portable size listing (BSD and GNU find disagree on -printf).
sized="$(
	find test -name '*.test.ts' | sort | while IFS= read -r file; do
		printf '%s %s\n' "$(wc -c <"$file" | tr -d ' ')" "$file"
	done
)"

assigned="$(
	printf '%s\n' "$sized" | awk -v total="$total" -v shard="$shard" '
		{
			size = $1
			file = $2
			target = 1
			for (i = 2; i <= total; i++) if (load[i] < load[target]) target = i
			load[target] += size
			owned[target] = owned[target] file " "
		}
		END { printf "%s", owned[shard] }
	'
)"

if [ -z "${assigned// /}" ]; then
	echo "shard $shard/$total has no test files" >&2
	exit 1
fi

read -r -a chosen <<<"$assigned"
printf 'shard %s/%s: %s of %s test files\n' "$shard" "$total" "${#chosen[@]}" "$(printf '%s\n' "$sized" | grep -c .)"
printf '  %s\n' "${chosen[@]}"
exec bun test "${chosen[@]}"
