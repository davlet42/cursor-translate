# Runtime guide — IDE, CLI, Cloud

What cursor-translate can and cannot do in each environment, why, and practical workarounds.

Canonical hook behaviour: [Cursor Hooks docs](https://cursor.com/docs/hooks).

## Summary matrix

| Surface | Read RU docs (lazy EN cache) | Auto-translate your Send | Auto back-translate reply | Full RU→agent→RU |
|---|---|---|---|---|
| **Cursor IDE** (local) | ✅ `preToolUse` on `Read` | ❌ audit only | ❌ audit only | ❌ |
| **Terminal** (`cursor-translate agent`) | ✅ (same hooks if agent uses Read) | ✅ | ✅ (config) | ✅ |
| **Cloud Agent** | ⚠️ only if EN cache committed / in repo | ❌ | ❌ | ❌ (use MCP/SDK later) |

**Main token win in IDE:** project documentation (ROADMAP, skills, reports) is served in English via the Read hook. Your Russian chat messages still go to the expensive model as-is.

## Why IDE cannot auto-translate prompts or responses

This is a **Cursor platform limit**, not a cursor-translate bug.

### `beforeSubmitPrompt` — allow or block only

Documented output:

```json
{
  "continue": true,
  "user_message": "optional message when blocked"
}
```

There is **no** `updated_prompt` (or similar) field. The hook can validate or block submission; it cannot replace the text sent to the model.

cursor-translate uses this hook only to **log metrics** (`user_prompt` in `metrics.jsonl`).

### `afterAgentResponse` — observe only

Input includes assistant `text`. The docs define **no output fields** to modify what the user sees. cursor-translate logs `agent_response` for ROI estimates only.

### `preToolUse` — can rewrite **tool** input

Documented output includes `updated_input`. That is how **lazy read** works: before `Read`, the hook rewrites `path` to the English cache file.

**Large cold/stale docs:** when a Cyrillic `.md` file exceeds `cache.lazy_read_max_chars` (default **50 000**) or `cache.lazy_read_max_chunks` (default **3**) and there is no fresh EN cache, lazy translate is **skipped** — the agent reads the Russian original. Cursor shows an `agent_message` with estimated warmup cost and per-read savings; run `cursor-translate doc <file>` to pre-warm.

**Incremental cache:** `cache.incremental: block` (default) re-translates only changed callouts / paragraphs / `##`–`###` sections on `doc` / `docs` and on lazy reads for files under the size limit. Payloads live in a sidecar `*.en.sections.json` next to the flat `*.en.md` served to Read. Modes: `block` · `paragraph` · `section` · `off`.

Prompts are **not** tool calls, so this mechanism does not apply to Send.

### Cloud Agents

`beforeSubmitPrompt` / `afterAgentResponse` from `~/.cursor/hooks.json` **do not run** for cloud sessions started from the web UI. Use EN doc cache in the repo, MCP, or SDK pre-translate instead.

**Playbook:** [cloud-agents.md](./cloud-agents.md) — warmup, MCP checklist, agent workflow.

---

## What you can do today

### 1. IDE — write Russian, save on docs (recommended default)

1. Run setup once (see [Setup](#setup-init-and-plugin) below).
2. Warm cache: `cursor-translate docs` in projects with Cyrillic markdown.
3. Chat in Russian in Cursor as usual.

When the agent **reads** `.md` / `.mdx` with Cyrillic, `preToolUse` serves the EN cache (translate on miss/stale). This is the largest automatic saving in IDE.

**Does not help:** short Russian prompts with little doc context; agent reply text in the chat UI stays as the model wrote it (usually English or mixed).

### 2. CLI — full prompt translate + agent wrapper

For long Russian tasks in the terminal:

```bash
# RU → EN only (copy into IDE if you want)
cursor-translate prompt "опиши архитектуру trading модуля…"

# Full loop: RU → main agent → RU (optional back-translate)
cursor-translate agent --model composer-2.5 -- "сделай ревью PR и опиши риски"

# EN response, skip back-translate
cursor-translate agent --no-back-translate -- "explain the auth flow"
```

Requires `agent` CLI logged in (Cursor subscription). Translate hops use `gpt-5.4-nano-none` by default.

### 3. Semi-manual — prompt in IDE

```bash
cursor-translate prompt "длинный русский промпт…" | pbcopy   # macOS
```

Paste the English result into Cursor chat. No automatic reply translation.

### 4. Rules — soft nudge (no guarantee)

Plugin rule `translate.mdc` asks the agent to reason in English and not translate code/paths/IDs. This reduces **some** Russian in reasoning but does **not** translate your Send or enforce EN replies.

Project-specific translator rules:

1. `.cursor/cursor-translate.md`
2. `## cursor-translate` in `CURSOR.md` or `AGENTS.md`
3. `~/.cursor/translate-proxy/cursor-translate-rules.md`

### 5. MCP — Phase 3 ✅

| Tool | Use case |
|---|---|
| **`translate`** | Cloud / IDE: agent calls `ru_en` or `en_ru` explicitly |
| **`resolve_doc`** | Cloud: EN path + optional body for Cyrillic `.md` |

Setup: [docs/mcp-setup.md](./mcp-setup.md) in repo.

### 6. Not viable today

| Idea | Why not |
|---|---|
| Hook rewrites Send | No API field for it |
| Hook rewrites reply in UI | No output schema on `afterAgentResponse` |
| Block Send + show translation in `user_message` | Bad UX; user must copy manually anyway |
| Proxy between IDE and Cursor API | No supported extension point |

If Cursor adds `updated_prompt` to `beforeSubmitPrompt`, IDE auto-translate becomes possible without a wrapper.

---

## Quota and fail-open

When translate quota is exhausted (`~/.cursor/translate-proxy/doc-translate-quota.json`):

- Doc cache may retry with `translator.doc_fallback_model` (e.g. `composer-2.5`).
- **Prompt and response translation are skipped** (Russian passthrough).
- Hooks still audit metrics.

---

## Setup: `init` and plugin

### `cursor-translate init` — run from **any directory**

`init` writes to **global** paths, not the current project:

| Path | Purpose |
|---|---|
| `~/.cursor/translate-proxy/` | hooks, config, CLI wrapper, cache, metrics |
| `~/.cursor/hooks.json` | registers cursor-translate hooks (merged, not overwritten) |
| `~/.zshrc` / `~/.bashrc` | PATH (only with `--path`) |

```bash
cd ~/Projects/cursor-translate
npm run build

# once per machine (or after hook updates)
cursor-translate init --path
# or: node packages/cli/dist/cli.js init --path

source ~/.zshrc   # if you used --path
```

Re-run `init` after pulling hook script changes in the repo. It copies scripts from the built repo into `~/.cursor/translate-proxy/hooks/`.

`init` does **not** install plugin rules — only hooks and the CLI wrapper.

### Plugin (rules + bundled hook references)

```bash
ln -sf ~/Projects/cursor-translate/plugin ~/.cursor/plugins/local/cursor-translate
```

Enable the plugin in Cursor settings. Rules (`translate.mdc`) load from the plugin; hooks load from `~/.cursor/hooks.json` after `init`.

### Verify hooks

```bash
cat ~/.cursor/hooks.json   # should list translate-lazy-read.sh, translate-audit*.sh
cursor-translate report --days 7
```

---

## Recommended workflow (factory / RU chat)

1. **IDE daily work:** Russian chat + `docs` cache warmed → lazy read on documentation.
2. **Long RU prompts / heavy reasoning:** `cursor-translate agent -- "…"` in terminal.
3. **Cloud runs:** commit EN docs or wait for MCP (Phase 3).
4. **ROI:** `cursor-translate report --days 7` — **operational** section (reads + MCP/CLI prompts, excl. batch warmup) vs **investment** (batch `docs` warmup + break-even reads) vs `user_prompt` opportunity audit.
