# Changelog

## 0.2.9 (2026-07-11)

- **npm README**: `prepare-publish.sh` copies root `README.md` into `packages/cli` and whitelists it in `files` so https://www.npmjs.com/package/cursor-translate shows the product README (monorepo root README is not published automatically).

## 0.2.8 (2026-07-11)

- **README**: npm-oriented product README (English) aligned with [claude-translate](https://github.com/davlet42/claude-translate) — token savings matrix, two-tier model strategy, installation, CLI reference, plugin contents, metrics ROI, and related docs.

## 0.2.7 (2026-07-08)

- **Full economy report**: new `ROI full economy` section counts display/MessageDisplay transcript EN savings (`response_back_translated`), not just doc cache + CLI prompts.
- **Display metrics**: `backTranslateResponse` now logs `saved_tokens_est` for EN-in-transcript savings (english_replies / display path).
- **Session opportunity** split: `user_prompt` vs other audits; notes clarify terminal `claude` (plugin hooks) vs `*-translate agent` (realized `prompt_translated`).
- **Break-even**: incremental doc spend break-even reads in addition to warmup.
- Shared aggregation in `@cursor-translate/core` (`aggregateTranslateReport`, `formatTranslateReport`).

## 0.2.6 (2026-07-08)

- **Quota latch TTL**: `doc-translate-quota.json` auto-expires after 30 minutes (`CURSOR_TRANSLATE_QUOTA_TTL_MIN` / `CLAUDE_TRANSLATE_QUOTA_TTL_MIN` to override) instead of blocking prompt/display translation until a successful doc translate. Malformed timestamps clear the latch.
- Fixes the failure mode where the subscription window recovers but translate hops stay permanently `quota_blocked`.

## 0.2.5 (2026-07-08)

- **Fix section cache flat file**: section-level `doc` translate now always writes the flat `*.en.md` atomically before the `*.en.sections.json` sidecar; verifies the flat file after write.
- **Self-heal**: if only the sidecar exists (or flat cache is missing/stale SHA), `repairFlatCacheFromSections` rebuilds `*.en.md` from the sidecar on read and before re-translating.
- **CLI status**: `doc` prints `status: translated` only when a real translation ran; `up_to_date`, `sibling_copy`, and `quota_exhausted` get their own labels.

## 0.2.4 (2026-07-08)

- **Lazy read deferral**: skip on-demand translate on Read when a Cyrillic markdown file exceeds `cache.lazy_read_max_chars` (default 50 000) or `cache.lazy_read_max_chunks` (default 3) and the EN cache is cold or stale; serve Russian and show an estimated warmup/savings hint (`agent_message` / hook output).
- **Section-level incremental cache**: `cache.incremental: section` (default) re-translates only changed `##` / `###` sections; section payloads live in `*.en.sections.json` sidecars next to flat `*.en.md` files served to Read.

## 0.2.3 (2026-07-08)

- Record actual `total_cost_usd` from `claude -p --output-format json` as `translate_cost_usd` in metrics.
