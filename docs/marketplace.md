# Cursor Marketplace — plugin submission

Optional distribution channel for hooks, rules, glossary, and MCP config. npm packages CLI/MCP; Marketplace ships the **plugin** bundle.

Metadata lives in `plugin/.cursor-plugin/plugin.json`.

---

## Plugin contents

| Path | Purpose |
|---|---|
| `plugin/.cursor-plugin/plugin.json` | Marketplace manifest |
| `plugin/rules/*.mdc` | Agent rules (`translate.mdc`, `mcp-translate.mdc`) |
| `plugin/mcp.json` | Bundled MCP server entry |
| `plugin/hooks/` | Reference hook scripts (users still run `cursor-translate init` for `~/.cursor/hooks.json`) |
| `plugin/glossary.default.yaml` | Default glossary |

---

## Pre-submit checklist

- [ ] `plugin.json` — name, version, description, author, license, repository URL, keywords
- [ ] README covers IDE vs Cloud honestly ([runtime-guide.md](./runtime-guide.md))
- [ ] [mcp-setup.md](./mcp-setup.md) — MCP install + verify
- [ ] [cloud-agents.md](./cloud-agents.md) — Cloud checklist
- [ ] `npm run test` green
- [ ] `npm run verify:mcp` green
- [ ] No private paths, Obsidian links, or internal factory references in repo docs
- [ ] MIT `LICENSE` file at repo root
- [ ] Screenshots / demo (optional): Settings → MCP showing `translate` + `resolve_doc`

---

## Submission steps (when Marketplace opens for your account)

1. Build and test plugin locally:

   ```bash
   ln -sf "$(pwd)/plugin" ~/.cursor/plugins/local/cursor-translate
   ```

2. Enable plugin in Cursor → verify rules + MCP load.

3. Follow current Cursor publisher docs (Dashboard → Plugins → Submit).

4. Point repository field to public GitHub: `https://github.com/davlet42/cursor-translate`

5. In plugin listing description, link:
   - `cursor-translate init` for hooks
   - `npm i -g cursor-translate` for CLI
   - Cloud: [cloud-agents.md](https://github.com/davlet42/cursor-translate/blob/main/docs/cloud-agents.md)

---

## Versioning

Keep `plugin/.cursor-plugin/plugin.json` `version` in sync with npm `cursor-translate` package for support clarity.

---

## Post-submit

- Monitor issues for MCP trust / cache path bugs
- Update plugin when `mcp-translate.mdc` playbook changes
- Re-submit on meaningful rule/MCP breaking changes
