# cursor-translate

Open-source layer to **save tokens on Cyrillic text** when using Cursor agents.

Uses a **cheap translate tier** (`gpt-5.4-nano-none` via Cursor subscription) separate from your main agent model. Caches EN versions of project docs, measures RU token sources, and integrates through hooks + CLI + plugin.

> **Honest positioning:** Cursor hooks cannot rewrite prompts (`beforeSubmitPrompt` is block-only) or assistant replies (`afterAgentResponse` has no output fields). Full RU→agent→RU requires the CLI wrapper (Phase 2) or SDK/MCP (Phase 3). Cloud Agents do not run user-level prompt hooks — use EN doc cache in repo + MCP instead.
>
> **Full guide:** [docs/runtime-guide.md](./docs/runtime-guide.md) — what works in IDE vs CLI, why, and practical workarounds.

## IDE vs CLI — what works

| In Cursor IDE | In terminal (`cursor-translate agent`) |
|---|---|
| ✅ Lazy EN cache on `Read` of `.md` with Cyrillic | ✅ Same if agent uses Read |
| ✅ Metrics audit (`user_prompt`, `agent_response`) | ✅ Full RU→EN→agent→RU |
| ❌ Auto-translate your Send | ✅ `prompt` / `agent` commands |
| ❌ Auto-translate reply in chat UI | ✅ `response.back_translate` in config |

**Why:** `beforeSubmitPrompt` only supports `continue` + `user_message` (block, not rewrite). `preToolUse` can rewrite **tool** input — that is how lazy read works.

See **[docs/runtime-guide.md](./docs/runtime-guide.md)** for setup (`init` from any directory), Cloud limits, semi-manual flows, and Phase 3 options.

## Two-tier model strategy

| Tier | Model | Used for |
|---|---|---|
| **Main agent** | Sonnet / Opus / Composer (your IDE setting) | Code, reasoning, tools |
| **Translate tier** | `gpt-5.4-nano-none` (default) | RU↔EN prose only |

Translate calls use Cursor CLI:

```bash
agent --print --mode ask --model gpt-5.4-nano-none -p "…"
```

Billing draws from your **Cursor subscription API usage pool** at the model's published API rate — no separate OpenAI API key required.

### Approximate API rates (translate hops)

| Model | Input / 1M | Output / 1M | Role |
|---|---|---|---|
| **GPT-5.4 nano** | ~$0.05 | ~$0.40 | Default translate tier |
| GPT-4o mini | ~$0.15 | ~$0.60 | Legacy cheap |
| GPT-4o | ~$2.50 | ~$10 | Too expensive for translate |
| Sonnet-class | ~$3–15+ | higher | Main agent only |

Nano is ~3× cheaper than 4o-mini and ~50× cheaper than GPT-4o on input. See [Cursor models & pricing](https://cursor.com/docs/models-and-pricing).

Override: `CURSOR_TRANSLATE_MODEL=gpt-5.4-nano-low` or set `translator.model` in `~/.cursor/translate-proxy/config.yaml`.

**CI/headless only:** `CURSOR_TRANSLATE_PROVIDER=openai` + `OPENAI_API_KEY`.

## Installation

### From source (development)

```bash
git clone …/cursor-translate && cd cursor-translate
npm install && npm run build
node packages/cli/dist/cli.js init --path
source ~/.zshrc   # or open a new terminal
cursor-translate report --days 7
```

`init --path` adds `~/.cursor/translate-proxy/bin` to your shell `PATH` (idempotent).

### After npm publish (end users)

```bash
npm install -g cursor-translate
cursor-translate init --path
source ~/.zshrc
cursor-translate docs --dry-run
```

Without global install:

```bash
npx cursor-translate init --path
```

### Plugin (optional)

```bash
ln -sf "$(pwd)/plugin" ~/.cursor/plugins/local/cursor-translate
```

## Quick start

```bash
npm install && npm run build
node packages/cli/dist/cli.js init --path
```

Requires `agent` CLI logged in (Cursor subscription).

## CLI commands

| Command | Status | Purpose |
|---|---|---|
| `init` | ✅ | Config, glossary, hooks, optional `--path` |
| `doc <file>` | ✅ | Translate one file → global cache |
| `docs [path]` | ✅ | Scan project `*.md` with cyrillic → cache all |
| `resolve <file>` | ✅ | Lazy: ensure EN cache, return `readPath` |
| `hook-resolve` | ✅ | stdin JSON for `preToolUse` Read hook |
| `report --days 7` | ✅ | Metrics by source |
| `prompt "<text>"` | ✅ | Translate prompt to stdout (RU→EN) |
| `agent -- "<prompt>"` | ✅ | RU→EN → main agent → EN→RU |
| MCP `translate` / `resolve_doc` | ✅ | Cloud + explicit agent translate |

### Doc cache (Phase 1)

```bash
cd ~/Projects/crypto3
node ~/Projects/cursor-translate/packages/cli/dist/cli.js docs --dry-run
node ~/Projects/cursor-translate/packages/cli/dist/cli.js docs --include-gitignored --dry-run
# → ~/.cursor/translate-proxy/cache/crypto3/ROADMAP.en.md
```

### Lazy translate on read

`cursor-translate init` installs `preToolUse` on `Read`: if `.md` has Cyrillic and cache is missing or stale (sha mismatch), translate → cache → agent reads EN path.

```bash
cursor-translate resolve ROADMAP.md --json
# readPath → use instead of Russian source
```

**Quota fallback:** nano/external tier exhausted → doc cache retries with `composer-2.5` (`translator.doc_fallback_model`). Prompt/response translation is skipped (fail-open).

**Custom rules** (merged into translator prompt):

1. `.cursor/cursor-translate.md` (project, full file)
2. `## cursor-translate` in `CURSOR.md` or `AGENTS.md`
3. `~/.cursor/translate-proxy/cursor-translate-rules.md` (global)

```bash
cursor-translate doc ROADMAP.md --dry-run
cursor-translate doc ROADMAP.md --force
```

Optional project glossary: `.cursor/cursor-translate-glossary.yaml`

### Phase 2 prompt flow (CLI)

```bash
# translate only
cursor-translate prompt "опиши архитектуру ROADMAP.md"

# full wrapper: RU prompt → main agent → RU response
cursor-translate agent --model composer-2.5 -- "сделай ревью PR и опиши риски"

# skip back-translate (EN response)
cursor-translate agent --no-back-translate -- "explain the auth flow"
```

```
User RU → nano (translate in)
       → main agent (Sonnet/Composer — your --model flag)
       → nano (translate out, optional — config response.back_translate)
```

## Cursor Plugin

```bash
ln -sf "$(pwd)/plugin" ~/.cursor/plugins/local/cursor-translate
```

Bundles hooks (metrics), rules (prefer global EN cache), glossary, **MCP** (`plugin/mcp.json`).

**MCP:** after `init --path`, enable plugin → tools `translate` and `resolve_doc`. See **[docs/mcp-setup.md](./docs/mcp-setup.md)**.

## Runtime compatibility matrix

| Feature | IDE local | CLI | Cloud |
|---|---|---|---|
| Metrics (Phase 0–0c) | ✅ | ✅ | partial |
| `doc` EN cache (global) | ✅ | ✅ | ❌ unless committed |
| Lazy read (preToolUse) | ✅ | ✅ | ❌ |
| Auto prompt translate | ⚠️ IDE hooks only audit | ✅ `agent` wrapper | ⚠️ MCP `translate` tool |
| MCP `resolve_doc` | ✅ via MCP | ✅ | ✅ |
| Translate via subscription | ✅ `agent --model nano` | ✅ | MCP/SDK |

## Metrics sources

`~/.cursor/translate-proxy/metrics.jsonl`:

| `source` | Trigger |
|---|---|
| `doc_cache_served` | Lazy read or MCP `resolve_doc` served EN cache (realized savings) |
| `doc_translate_cost` | Doc translation spend (`reason: warmup_translate` = batch `docs`; `lazy_translate` = on-demand) |
| `prompt_translated` | RU→EN via CLI `prompt` / `agent` **or MCP `translate`** (realized) |
| `response_back_translated` | CLI `agent` EN→RU back-translate cost |
| `user_prompt` | Your Send in IDE (opportunity audit) |
| `agent_response` | Agent reply (opportunity audit) |
| `file_read` | Read tool |
| `subagent_task` | subagentStart |
| `subagent_summary` | subagentStop |

```bash
cursor-translate report --days 7
```

## Config

`~/.cursor/translate-proxy/config.yaml` (from `templates/config.yaml` on `init`).

Key fields:

```yaml
translator:
  provider: cursor-cli
  model: gpt-5.4-nano-none
```

## Related docs

- **[Runtime guide (IDE / CLI / Cloud)](./docs/runtime-guide.md)** — setup, limits, model tier, workflows
- **[MCP setup (`translate`, `resolve_doc`)](./docs/mcp-setup.md)**
- **[Cloud Agents playbook](./docs/cloud-agents.md)** — MCP checklist, cache warmup, IDE hooks gap
- **[Publishing to npm](./docs/publishing.md)** — package publish order
- **[Cursor Marketplace](./docs/marketplace.md)** — plugin submission checklist

## License

MIT
