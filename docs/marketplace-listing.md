# Marketplace listing — copy-paste for submit form

Submit at: **https://cursor.com/marketplace/publish**

Repository URL: `https://github.com/davlet42/cursor-translate`

---

## Short description (listing)

Save tokens when using Cursor agents on Cyrillic (Russian) projects: English doc cache on read, MCP tools for Cloud agents, cheap nano-tier translation via your Cursor subscription.

---

## Long description (if form has a body field)

**cursor-translate** reduces main-agent token spend on Russian documentation and long Russian prompts.

### Features

- **Lazy EN cache** — when the agent reads Cyrillic `.md` files, hooks serve a cached English translation (IDE local)
- **MCP `translate` + `resolve_doc`** — explicit RU↔EN and doc resolution for Cloud Agents and MCP-first workflows
- **Metrics** — `cursor-translate report` shows operational ROI vs translate cost
- **Cheap translate tier** — `gpt-5.4-nano-none` via Cursor `agent` CLI (subscription pool, not OpenAI API key)

### Install (after enabling plugin)

```bash
npm install -g cursor-translate @cursor-translate/mcp
cursor-translate init --path
cursor-translate docs   # warm cache in your repo
```

### Honest limits

- IDE hooks **cannot** auto-translate your Send or assistant reply (Cursor platform limit)
- Cloud Agents **do not** run local hooks — use MCP + warmed cache ([cloud guide](https://github.com/davlet42/cursor-translate/blob/main/docs/cloud-agents.md))

### Links

- Docs: https://github.com/davlet42/cursor-translate
- npm: https://www.npmjs.com/package/cursor-translate
- License: MIT

---

## Pre-submit checklist

- [x] Public GitHub repo
- [x] MIT `LICENSE`
- [x] `.cursor-plugin/marketplace.json` (plugin in `plugin/`)
- [x] `plugin/.cursor-plugin/plugin.json` (schema-valid `author` object)
- [x] `plugin/README.md`
- [x] MCP via `npx @cursor-translate/mcp` (no secrets in repo)
- [x] `npm run test` / `npm run verify:mcp`
- [ ] Screenshot: Cursor Settings → MCP showing `translate` + `resolve_doc` (optional, attach to form if allowed)
- [ ] Submit at marketplace/publish → wait for manual review

---

## Local test before submit

```bash
ln -sf "$(pwd)/plugin" ~/.cursor/plugins/local/cursor-translate
```

Reload Cursor → **Customize** → enable plugin → verify rules + MCP tools.

Remove symlink after test if desired:

```bash
rm ~/.cursor/plugins/local/cursor-translate
```
