# MCP setup — `translate` + `resolve_doc`

MCP server for **Cloud Agents** and IDE sessions where hooks cannot rewrite prompts. The agent calls tools explicitly.

## Tools

| Tool | Purpose |
|---|---|
| `translate` | RU↔EN prose (`direction`: `ru_en` \| `en_ru`) |
| `resolve_doc` | Markdown → EN cache path; optional `include_body` |

Both use `@cursor-translate/core` (nano tier via `agent` CLI by default).

### `translate` example (agent calls)

```json
{
  "text": "Опиши архитектуру trading модуля",
  "direction": "ru_en",
  "force": false
}
```

Response (JSON text):

```json
{
  "text": "Describe the architecture of the trading module",
  "skipped": false,
  "reason": "translated",
  "modelUsed": "gpt-5.4-nano-none",
  "usedFallback": false,
  "direction": "ru_en"
}
```

### `resolve_doc` example (Cloud)

```json
{
  "file_path": "ROADMAP.md",
  "include_body": true
}
```

Returns `readPath`, `action` (`cache_hit` \| `translated` \| `passthrough` \| …), and optional English `body`.

## Install

```bash
cd ~/Projects/cursor-translate
npm install && npm run build
cursor-translate init --path
source ~/.zshrc
```

`init` installs `~/.cursor/translate-proxy/bin/cursor-translate-mcp` (wrapper → built `packages/mcp/dist/server.js`).

## Enable in Cursor

### Option A — Plugin (recommended)

```bash
ln -sf ~/Projects/cursor-translate/plugin ~/.cursor/plugins/local/cursor-translate
```

Enable **cursor-translate** plugin in Cursor settings. Plugin ships `plugin/mcp.json`:

```json
{
  "mcpServers": {
    "cursor-translate": {
      "command": "cursor-translate-mcp"
    }
  }
}
```

Requires `cursor-translate init --path` so `cursor-translate-mcp` is on PATH.

### Option B — User `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "cursor-translate": {
      "command": "cursor-translate-mcp"
    }
  }
}
```

Or absolute path:

```json
{
  "mcpServers": {
    "cursor-translate": {
      "command": "node",
      "args": ["/Users/you/Projects/cursor-translate/packages/mcp/dist/server.js"]
    }
  }
}
```

Restart Cursor (or reload MCP) after changes.

## Agent instructions

The **cursor-translate** plugin ships Cursor rules that tell the agent when to call MCP:

| Rule file | Purpose |
|---|---|
| `plugin/rules/translate.mdc` | Lazy read, glossary, global policy |
| `plugin/rules/mcp-translate.mdc` | **When to call** `translate` / `resolve_doc` |

Both use `alwaysApply: true` when the plugin is enabled.

**Optional — per project:** add to `AGENTS.md` or `CURSOR.md` (copy from `templates/agents-md-cursor-translate-snippet.md`):

```markdown
## cursor-translate
…
```

Or full rules in `.cursor/cursor-translate.md`.

## Cloud Agents

1. Ensure plugin or `mcp.json` is active on the machine / dashboard secrets as documented by Cursor for cloud MCP.
2. Warm docs in the VM or rely on `resolve_doc` on first read.
3. Agent workflow:
   - User task in Russian → call `translate` (`ru_en`) before heavy reasoning.
   - Read Cyrillic docs → call `resolve_doc` with `include_body: true` instead of raw `Read` on RU path.
   - Final reply → call `translate` (`en_ru`) if user expects Russian.

Plugin rules (`mcp-translate.mdc`) encode this for IDE and Cloud when the plugin is enabled.

## Environment

| Variable | Purpose |
|---|---|
| `CURSOR_TRANSLATE_HOME` | Override `~/.cursor/translate-proxy` |
| `CURSOR_TRANSLATE_PROVIDER` | `cursor-cli` (default) or `openai` |
| `CURSOR_TRANSLATE_MODEL` | Translate tier model |
| `OPENAI_API_KEY` | Only when `provider: openai` in config |
| `CURSOR_AGENT_SKIP_TRUST` | Set to `1` to omit `--trust` on `agent` CLI subprocess calls |

Requires `agent` CLI logged in for default `cursor-cli` provider. MCP and hooks pass **`--trust`** to `agent` automatically so non-interactive translate works when the MCP server cwd is outside a git repo.

## Verify

```bash
# wrapper on PATH
which cursor-translate-mcp

# manual smoke (stdio server — will wait for MCP client)
cursor-translate-mcp
```

In Cursor: Settings → MCP → `cursor-translate` should list `translate` and `resolve_doc`.

## Troubleshooting

| Issue | Fix |
|---|---|
| `command not found: cursor-translate-mcp` | `cursor-translate init --path` + new shell |
| MCP missing after plugin symlink | Enable plugin; restart Cursor |
| Translate returns `skipped: quota_blocked` | Quota file set; wait or clear `doc-translate-quota.json` |
| `resolve_doc` slow | First call translates via nano; later `cache_hit` |
| `Workspace Trust Required` from `agent` | Fixed in recent builds (`--trust` auto); rebuild + restart MCP; or run `agent --trust` once interactively |
| `resolve_doc` cache miss from MCP | Pass **absolute** `file_path`; ensure `project_slug` matches cache dir (e.g. `crypto3`) |
| ROI looks negative in `combined` section | Expected after batch `docs` warmup — read **operational** section and `break-even reads` line |

See also: [runtime-guide.md](./runtime-guide.md).
