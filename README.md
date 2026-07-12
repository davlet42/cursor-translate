# cursor-translate

Serve your **Cyrillic markdown docs to Cursor agents as cached English translations** — and cut the context tokens agents burn re-reading them.

Russian prose tokenizes ~1.8–2× worse than English, and agent workflows read the same docs over and over: project wikis, ROADMAPs, skills, reports. cursor-translate translates a doc **once per version** on a cheap nano tier (`agent --print --mode ask --model gpt-5.4-nano-none`, billed to your existing Cursor subscription — no separate API key) and serves the cached English on every subsequent `Read` — in the IDE, the `agent` CLI, and (via committed caches or MCP) Cloud Agents.

Sibling project [claude-translate](https://github.com/davlet42/claude-translate) builds on the same engine (`@cursor-translate/core`) for Claude Code.

## The core value — and its honest economics

The saving mechanism is one and automatic: the plugin's `preToolUse` hook redirects every `Read` of a Cyrillic `.md`/`.mdx` to a cached English translation — in every session, every subagent, every project.

Translation is an **investment** (one nano spend per doc *version*), serving is the **return** (every read). Which means:

- **Pays off:** stable docs that agents read often — knowledge bases, project registries, ROADMAPs, rules and skills.
- **First-time translation is the investment:** a fresh doc repays itself in ~1–3 reads (check the `break-even reads` line in your own `report`).
- **Edits are cheap:** re-translation is **section-incremental** (`cache.incremental: section`, default) — only the changed `##`/`###` sections are re-billed. And since agents `Read` a doc around every `Edit`, reads ≥ edits in practice, and a single read of a mid-size doc typically covers a one-section update. A doc only stays net-negative when it's bulk-rewritten often and rarely read afterwards (one-off scratch notes).
- **Saves ~nothing:** code-heavy sessions that rarely `Read` Cyrillic markdown — the savings scale directly with how much Cyrillic documentation your agents actually read.

Don't take the pitch's word for it — every cache hit, every translate spend and every missed opportunity is logged. Pull your own numbers any time:

```bash
cursor-translate report --days 7
```

```
ROI operational (docs + CLI/MCP prompts — excludes warmup):
  doc cache served (lazy read / MCP resolve_doc): ~… tokens saved (N reads)
  incremental doc translate: ~… tokens
ROI investment (one-time doc cache warmup):
  break-even reads (warmup ÷ avg savings/read): ~N more doc_cache_served events
session opportunity (interactive — not auto-translated):
  user_prompt (RU sent as-is to main model): ~… tokens (N events)
```

How to read it: `doc cache served` is your realized saving; the `doc translate` lines are what the nano tier spent to earn it; `session opportunity` is what the extras below *could* additionally capture (and what they'd cost you in trade-offs).

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

## How the core works

### Lazy translate on Read

The plugin's `preToolUse` hook (matcher `Read`): if the file is `.md`/`.mdx` with Cyrillic and the cache is missing or stale (sha mismatch), it translates via nano, caches under `~/.cursor/translate-proxy/cache/<project>/…en.md`, and rewrites the tool call's `path` to the cache. It also injects a context note telling the agent to edit the **original** file, never the cache. Everything fails open: no CLI, quota exhausted, timeout → the original Russian file is read.

**Large cold/stale docs:** when a file exceeds `cache.lazy_read_max_chars` (default 50 000) or `cache.lazy_read_max_chunks` (default 3), lazy translate is deferred — the agent reads Russian and sees a pre-warm hint. Run `cursor-translate doc <file>` to warm manually.

**Incremental cache:** `cache.incremental: section` (default) re-translates only changed `##` / `###` sections; section payloads live in `*.en.sections.json` sidecars next to flat `*.en.md` files served to Read.

### Shared cache with claude-translate

Before spending on a translation, the doc cache checks the **sibling install** — [claude-translate](https://github.com/davlet42/claude-translate) keeps the same cache format under `~/.claude/translate-proxy`. A fresh entry (sha match against the current source) is copied over as `action: sibling_copy` with zero translate cost; only if the sibling is also missing or stale does a real translation run. Works in both directions.

Config: `cache.share_siblings: true` (default). Override or disable: `CURSOR_TRANSLATE_SIBLING_HOMES="/path/one:/path/two"` (empty string disables).

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

## Metrics sources (`~/.cursor/translate-proxy/metrics.jsonl`)

| `source` | Trigger |
|---|---|
| `doc_cache_served` | Lazy read / MCP served EN cache (realized savings) |
| `doc_translate_cost` | Doc translation spend (`warmup_translate` = batch `docs`; `lazy_translate` = on-demand) |
| `prompt_translated` / `response_back_translated` | CLI `agent` & `prompt`, MCP `translate` |
| `user_prompt` / `agent_response` | Opportunity audit from hooks (what auto-translate *would* save) |
| `file_read` / `subagent_task` / `subagent_summary` | Read and subagent audits |

`cursor-translate report --days 7` includes **ROI full economy**: doc cache savings, incremental break-even reads, translate spend, and session opportunity estimates.

## Extras (opt-in, experimental)

Everything below is configured in **your local** `~/.cursor/translate-proxy/config.yaml` — created on your machine by `cursor-translate init` from the packaged template and yours to edit.

The platform reality that shapes these features: Cursor's `beforeSubmitPrompt` hook cannot rewrite your prompt (block + message only), `afterAgentResponse` has **no output fields**, and — unlike Claude Code's `MessageDisplay` in the sibling project — Cursor has **no display-layer substitution at all**. So in the IDE, Russian chat goes to the model as-is and replies are whatever the model writes; prompt- and reply-side translation exists only *outside* the IDE loop. The doc cache above has no such limitation — which is exactly why it's the core.

### Full agent wrapper (headless) — the only place prompts and replies get auto-translated

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

For scripts, cron jobs and CI — the RU→EN→agent→RU loop runs outside the model, so the platform limits above don't apply.

### MCP tools: `translate` / `resolve_doc` — the primary path for Cloud Agents

Cloud Agents don't run user-level hooks — there, `resolve_doc` is the explicit way to get the EN cache for a Cyrillic doc, and `translate` is an on-demand RU↔EN capability on the cheap tier (glossary-aware, metered). Add the snippet from `templates/agents-md-cursor-translate-snippet.md` to your project's `AGENTS.md` or `CURSOR.md` (or a `## cursor-translate` section) — it tells Cloud Agents and local sessions when to call the tools. In the IDE with the plugin enabled these mostly stay idle — the `preToolUse` hook already did the job — and that's by design.

### Opportunity audits

`beforeSubmitPrompt` / `afterAgentResponse` hooks log what auto-translation *would* have saved (`user_prompt`, `agent_response` sources) — that's the `session opportunity` block in `report`. Audit only, no behavior change.

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

## Plugin contents

- **Hooks:** `preToolUse` lazy read (600s timeout), `beforeSubmitPrompt` / `afterAgentResponse` opportunity audits, `sessionStart` context note. All guarded by `CURSOR_TRANSLATE_HOP=1` against recursion; disabled features exit before booting node.
- **Rules:** `translate.mdc` (lazy read policy, glossary), `mcp-translate.mdc` (when agent must call MCP).
- **MCP:** `translate` + `resolve_doc` via `@cursor-translate/mcp` (`npx @cursor-translate/mcp` in `plugin/mcp.json`).

## Config

`~/.cursor/translate-proxy/config.yaml` — your local file, created by `init` from `templates/config.yaml`:

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
