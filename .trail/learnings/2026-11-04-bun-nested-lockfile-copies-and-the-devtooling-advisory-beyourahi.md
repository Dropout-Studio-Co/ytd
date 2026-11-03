---
title: "Bun keeps stale nested lockfile copies, and the dev-tooling advisory hold"
author: Beyourahi
date: 2026-11-04
branch: main
id: l-2c6b41d7
scope: repo
status: active
touches:
  - package.json
  - bun.lock
  - .github/workflows/ci.yml
---

## Decided

`bun install` after bumping eslint re-resolved the top-level `minimatch` but left stale nested
copies (`@eslint/config-array/minimatch`, `@typescript-eslint/typescript-estree/minimatch`) pinned
at the old version, so `bun audit` still reported the advisories the bump was meant to clear.
`bun update minimatch brace-expansion` is what dedupes them; check `grep -n '"/minimatch"' bun.lock`
after any toolchain bump rather than trusting the audit result alone.

eslint 10.14.0 requires minimatch `10.2.6`, which pulls brace-expansion `5.0.12` and clears the
four high and one moderate brace-expansion DoS advisories. The remaining moderate
(GHSA-g3hv-75wg-m249, minimatch globparts amplification) is fixed only in 11.0.1+, while eslint,
`@eslint/config-array` and typescript-eslint all declare `^10.x`; it is held and recorded beside
the informational audit step.

## Tried and ruled out

A tree-wide `overrides.minimatch: ^11.0.4` did clear `bun audit --audit-level=low` and linted the
identical 65 files with identical results, but bun overrides cannot be scoped to one consumer, so
the pin permanently bypasses three declared ranges for a dev-only DoS whose patterns this repo
writes itself, and no CI gate reports a moderate. Revisit when those ranges accept a patched line.
