# Changelog

## 0.2.5 (2026-07-08)

- **Fix section cache flat file**: section-level `doc` translate now always writes the flat `*.en.md` atomically before the `*.en.sections.json` sidecar; verifies the flat file after write.
- **Self-heal**: if only the sidecar exists (or flat cache is missing/stale SHA), `repairFlatCacheFromSections` rebuilds `*.en.md` from the sidecar on read and before re-translating.
- **CLI status**: `doc` prints `status: translated` only when a real translation ran; `up_to_date`, `sibling_copy`, and `quota_exhausted` get their own labels.

## 0.2.4 (2026-07-08)

- **Lazy read deferral**: skip on-demand translate on Read when a Cyrillic markdown file exceeds `cache.lazy_read_max_chars` (default 50 000) or `cache.lazy_read_max_chunks` (default 3) and the EN cache is cold or stale; serve Russian and show an estimated warmup/savings hint (`agent_message` / hook output).
- **Section-level incremental cache**: `cache.incremental: section` (default) re-translates only changed `##` / `###` sections; section payloads live in `*.en.sections.json` sidecars next to flat `*.en.md` files served to Read.

## 0.2.3 (2026-07-08)

- Record actual `total_cost_usd` from `claude -p --output-format json` as `translate_cost_usd` in metrics.
