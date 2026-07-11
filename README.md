# cursor-translate

Open-source layer to **save tokens on Cyrillic text** when using **Cursor** (IDE, CLI, Cloud Agents).

Russian prose tokenizes ~1.8–2× worse than English. cursor-translate routes all RU↔EN translation through a **cheap nano tier** (`agent --print --mode ask --model gpt-5.4-nano-none`, billed to your existing Cursor subscription — no separate API key), so your **main model only ever sees English** docs and (via the CLI wrapper) prompts.

Sibling project [claude-translate](https://github.com/davlet42/claude-translate) builds on the same engine (`@cursor-translate/core`) for Claude Code.

## What saves tokens, where

| Mechanism | Cursor IDE (local) | `cursor-translate agent` (headless) | Cloud Agent |
|---|---|---|---|
| Lazy EN doc cache on `Read` of Cyrillic `.md`/`.mdx` | ✅ `preToolUse` rewrites `path` | ✅ same | ⚠️ only if cache committed / MCP |
| Incremental section cache (`##` / `###` deltas) | ✅ on lazy read under size limits | ✅ | ⚠️ warmup via `docs` / MCP |
| Auto-translate your prompt | ❌ audit only (platform limit) | ✅ RU→EN before the main model | ⚠️ MCP `translate` tool |
| Show replies in Russian (CLI back-translate) | ❌ audit only | ✅ `response.back_translate` | ⚠️ MCP `translate` (`en_ru`) |
| MCP `translate` / `resolve_doc` | ✅ explicit tools | ✅ | ✅ primary path |
| Metrics + ROI report (`report --days 7`) | ✅ | ✅ | partial |

**Honest positioning:** Cursor's `beforeSubmitPrompt` hook cannot rewrite your prompt (block + message only), and `afterAgentResponse` has no output fields — so Russian chat in the IDE still goes to the model as-is; the full RU→EN→agent→RU loop needs the CLI wrapper or MCP. What hooks *can* do is rewrite **tool** input (`preToolUse.updated_input` — lazy read). That is the largest automatic win in the IDE: project docs (ROADMAP, skills, reports) are served in English while you keep writing in Russian.

## Two-tier model strategy

| Tier | Model | Used for | ~API rate (in/out per 1M) |
|---|---|---|---|
| **Main agent** | Sonnet / Opus / Composer (your IDE setting) | Code, reasoning, tools | $3–15+ / higher |
| **Translate tier** | `gpt-5.4-nano-none` (default) | RU↔EN prose only | ~$0.05 / $0.40 |

Translate hops run as:

```bash
agent --print --mode ask --model gpt-5.4-nano-none -p "<translator prompt>"
```

Billing draws from your **Cursor subscription API usage pool** at the model's published rate — no separate OpenAI API key required. See [Cursor models & pricing](https://cursor.com/docs/models-and-pricing).

When nano quota is exhausted, doc cache falls back to `composer-2.5` (`translator.doc_fallback_model`); prompt/response translation is skipped (fail-open). Quota latch auto-expires after 30 minutes (`CURSOR_TRANSLATE_QUOTA_TTL_MIN` to override).

Override: `CURSOR_TRANSLATE_MODEL=gpt-5.4-nano-low` or `translator.model` in `~/.cursor/translate-proxy/config.yaml`. CI/headless without a subscription: `CURSOR_TRANSLATE_PROVIDER=openai` + `OPENAI_API_KEY`.

## Installation

```bash
npm install -g cursor-translate @cursor-translate/mcp
cursor-translate init --path
source ~/.zshrc   # or open a new terminal
```

Enable the plugin in Cursor:

```bash
ln -sf "$(npm root -g)/cursor-translate/plugin" ~/.cursor/plugins/local/cursor-translate
```

Restart Cursor → enable **cursor-translate** in settings. MCP tools `translate` and `resolve_doc` activate via `plugin/mcp.json` after `init --path`.

Without global install:

```bash
npx cursor-translate init --path
```

Requires the `agent` CLI logged in (Cursor subscription) and Node ≥ 24.

## Quick start

```bash
cd ~/Projects/your-repo
cursor-translate docs --dry-run   # see what would be cached
cursor-translate docs             # warm the EN cache (one-time nano spend)
cursor-translate report --days 7  # savings vs costs (full economy ROI)
```

## CLI commands

| Command | Purpose |
|---|---|
| `init [--path]` | Config, glossary, hook assets, bin wrappers, optional shell PATH |
| `doc <file>` | Translate one file → global cache |
| `docs [path]` | Scan project `*.md` with Cyrillic → cache all |
| `resolve <file>` | Lazy: ensure EN cache, print `readPath` |
| `hook-resolve` | stdin JSON for the `preToolUse` Read hook |
| `prompt "<text>"` | RU→EN translate to stdout |
| `agent [agent flags] -- "<prompt>"` | Full RU→EN → `agent -p` → EN→RU |
| `report [--days 7]` | Metrics by source + ROI break-even |
| `backfill-costs` | Backfill `translate_cost_usd` from agent JSON logs |

### Lazy translate on Read

The plugin's `preToolUse` hook (matcher `Read`): if the file is `.md`/`.mdx` with Cyrillic and the cache is missing or stale (sha mismatch), it translates via nano, caches under `~/.cursor/translate-proxy/cache/<project>/…en.md`, and rewrites the tool call's `path` to the cache. It also injects a context note telling the agent to edit the **original** file, never the cache. Everything fails open: no CLI, quota exhausted, timeout → the original Russian file is read.

**Large cold/stale docs:** when a file exceeds `cache.lazy_read_max_chars` (default 50 000) or `cache.lazy_read_max_chunks` (default 3), lazy translate is deferred — the agent reads Russian and sees a pre-warm hint. Run `cursor-translate doc <file>` to warm manually.

**Incremental cache:** `cache.incremental: section` (default) re-translates only changed `##` / `###` sections; section payloads live in `*.en.sections.json` sidecars next to flat `*.en.md` files served to Read.

### Shared cache with claude-translate

Before spending on a translation, the doc cache checks the **sibling install** — [claude-translate](https://github.com/davlet42/claude-translate) keeps the same cache format under `~/.claude/translate-proxy`. A fresh entry (sha match against the current source) is copied over as `action: sibling_copy` with zero translate cost; only if the sibling is also missing or stale does a real translation run. Works in both directions.

Config: `cache.share_siblings: true` (default). Override or disable: `CURSOR_TRANSLATE_SIBLING_HOMES="/path/one:/path/two"` (empty string disables).

### AGENTS.md / CURSOR.md workflow

Add the snippet from `templates/agents-md-cursor-translate-snippet.md` to your project's `AGENTS.md` or `CURSOR.md` (or a `## cursor-translate` section). This tells Cloud Agents and local sessions when to call MCP `translate` / `resolve_doc` — especially important because Cloud does not run user-level prompt hooks.

### Full agent wrapper (headless)

```bash
cursor-translate agent --model composer-2.5 -- "сделай ревью PR и опиши риски"
```

```
User RU → nano (translate in)
       → agent -p (your model; hooks/doc-cache still active)
       → nano (translate out, optional — response.back_translate)
```

Skip back-translate for English output:

```bash
cursor-translate agent --no-back-translate -- "explain the auth flow"
```

## Plugin contents

- **Hooks:** `preToolUse` lazy read (600s timeout), `beforeSubmitPrompt` / `afterAgentResponse` opportunity audits, `sessionStart` context note. All guarded by `CURSOR_TRANSLATE_HOP=1` against recursion; disabled features exit before booting node.
- **Rules:** `translate.mdc` (lazy read policy, glossary), `mcp-translate.mdc` (when agent must call MCP).
- **MCP:** `translate` + `resolve_doc` via `@cursor-translate/mcp` (`npx @cursor-translate/mcp` in `plugin/mcp.json`).

## Metrics sources (`~/.cursor/translate-proxy/metrics.jsonl`)

| `source` | Trigger |
|---|---|
| `doc_cache_served` | Lazy read / MCP served EN cache (realized savings) |
| `doc_translate_cost` | Doc translation spend (`warmup_translate` = batch `docs`; `lazy_translate` = on-demand) |
| `prompt_translated` / `response_back_translated` | CLI `agent` & `prompt`, MCP `translate` |
| `user_prompt` / `agent_response` | Opportunity audit from hooks (what auto-translate *would* save) |
| `file_read` / `subagent_task` / `subagent_summary` | Read and subagent audits |

`cursor-translate report --days 7` includes **ROI full economy**: doc cache savings, incremental break-even reads, translate spend, and session opportunity estimates.

## Config

`~/.cursor/translate-proxy/config.yaml` (from `templates/config.yaml` on `init`):

```yaml
translator:
  provider: cursor-cli
  model: gpt-5.4-nano-none
```

Custom translation rules: `.cursor/cursor-translate.md`, a `## cursor-translate` section in `CURSOR.md`/`AGENTS.md`, or `~/.cursor/translate-proxy/cursor-translate-rules.md`. Project glossary: `.cursor/cursor-translate-glossary.yaml`.

## Related docs

- **[Runtime guide](./docs/runtime-guide.md)** — hook contracts, IDE vs CLI vs Cloud limits, config and env reference, metrics, troubleshooting, fail-open guarantees
- **[MCP setup](./docs/mcp-setup.md)** — `translate` and `resolve_doc` for Cloud Agents
- **[Cloud Agents playbook](./docs/cloud-agents.md)** — committed EN caches, MCP checklist, IDE hooks gap
- **[Publishing](./docs/publishing.md)** — npm release flow, CI, lockfile notes
- **[Cursor Marketplace](./docs/marketplace.md)** — plugin submission checklist
- **[Changelog](./CHANGELOG.md)**

## License

MIT
