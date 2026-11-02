#!/usr/bin/env bash
# Run one deterministic slice of the Bun test suite so the slow suite can run in parallel shards.
# Usage: scripts/test-shard.sh <shard> <total>
set -euo pipefail

shard="${1:?usage: test-shard.sh <shard> <total>}"
total="${2:?usage: test-shard.sh <shard> <total>}"

mapfile -t files < <(find test -name "*.test.ts" | sort)
picked=()
for i in "${!files[@]}"; do
	if [ $(( (i % total) + 1 )) -eq "$shard" ]; then picked+=("${files[$i]}"); fi
done

printf "shard %s/%s: %s of %s test files\n" "$shard" "$total" "${#picked[@]}" "${#files[@]}"
printf "  %s\n" "${picked[@]}"
exec bun test "${picked[@]}"
