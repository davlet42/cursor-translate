# cursor-translate plugin

Cursor plugin: agent rules, MCP server config, hook templates, glossary.

**npm packages (required for MCP + hooks):**

```bash
npm install -g cursor-translate@0.1.1 @cursor-translate/mcp@0.1.1
cursor-translate init --path
source ~/.zshrc
```

## What you get

| Component | Purpose |
|---|---|
| `rules/translate.mdc` | Lazy read policy, glossary, global translate rules |
| `rules/mcp-translate.mdc` | When agent must call MCP `translate` / `resolve_doc` |
| `mcp.json` | MCP server via `npx @cursor-translate/mcp` |
| `hooks/` | Templates — installed to `~/.cursor/translate-proxy` by `cursor-translate init` |

## IDE vs Cloud

| Surface | Mechanism |
|---|---|
| **IDE (local)** | `init` installs hooks → lazy EN cache on `Read` of Cyrillic `.md` |
| **Cloud Agent** | Hooks do **not** run — agent uses MCP `translate` + `resolve_doc` (rules enforce this) |

Warm doc cache: `cursor-translate docs` in your project.

## Requirements

- Node.js 20+
- `agent` CLI logged in (Cursor subscription) for translate tier (`gpt-5.4-nano-none` by default)

## Docs

- [Runtime guide](https://github.com/davlet42/cursor-translate/blob/main/docs/runtime-guide.md)
- [MCP setup](https://github.com/davlet42/cursor-translate/blob/main/docs/mcp-setup.md)
- [Cloud Agents](https://github.com/davlet42/cursor-translate/blob/main/docs/cloud-agents.md)
