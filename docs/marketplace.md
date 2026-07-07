# Cursor Marketplace — plugin submission

Public marketplace: **https://cursor.com/marketplace/publish**  
Plugin docs: **https://cursor.com/docs/reference/plugins**

npm ships CLI/MCP; Marketplace ships the **plugin** bundle (rules, MCP config, hook templates).

---

## Repo layout

This repo uses a **subdirectory plugin** + root marketplace index:

```text
cursor-translate/
├── .cursor-plugin/
│   └── marketplace.json      # indexes plugin/ for Cursor
├── plugin/
│   ├── .cursor-plugin/
│   │   └── plugin.json       # plugin manifest
│   ├── README.md
│   ├── rules/*.mdc
│   ├── mcp.json
│   ├── hooks/
│   └── glossary.default.yaml
```

Copy-paste listing text: **[marketplace-listing.md](./marketplace-listing.md)**

---

## Plugin contents

| Path | Purpose |
|---|---|
| `plugin/.cursor-plugin/plugin.json` | Marketplace manifest |
| `plugin/rules/*.mdc` | Agent rules (`translate.mdc`, `mcp-translate.mdc`) |
| `plugin/mcp.json` | MCP via `npx @cursor-translate/mcp` |
| `plugin/hooks/` | Reference hooks — user runs `cursor-translate init` to install |
| `plugin/glossary.default.yaml` | Default glossary |

---

## Pre-submit checklist

- [x] `plugin.json` — name, version `0.1.1`, description, author object, repository, keywords
- [x] `.cursor-plugin/marketplace.json` at repo root (`source: plugin`)
- [x] `plugin/README.md`
- [x] README covers IDE vs Cloud honestly ([runtime-guide.md](./runtime-guide.md))
- [x] [mcp-setup.md](./mcp-setup.md), [cloud-agents.md](./cloud-agents.md)
- [x] `npm run test` / `npm run verify:mcp`
- [x] MIT `LICENSE` at repo root
- [x] No secrets in `mcp.json` (uses `npx`, no API keys)
- [ ] Screenshot: Settings → MCP → `translate` + `resolve_doc` (optional)

---

## Local test

```bash
ln -sf "$(pwd)/plugin" ~/.cursor/plugins/local/cursor-translate
```

Reload Cursor → **Customize** → enable plugin → verify rules + MCP.

Requires for full MCP/hooks flow:

```bash
npm install -g cursor-translate @cursor-translate/mcp
cursor-translate init --path
```

---

## Submit (public marketplace)

1. Test locally (above).
2. Push to public GitHub: `https://github.com/davlet42/cursor-translate`
3. Open **https://cursor.com/marketplace/publish** (signed in).
4. Submit repository URL.
5. Use text from [marketplace-listing.md](./marketplace-listing.md) for description fields.
6. Wait for **manual review** (initial listing and each update).

**Team marketplace** (Dashboard → Plugins) is a separate flow for org-internal distribution.

---

## Versioning

Keep `plugin/.cursor-plugin/plugin.json` `version` in sync with npm `cursor-translate` package. Bump `plugin/mcp.json` npx pin when shipping breaking MCP changes.

---

## Post-submit

- Monitor issues (MCP trust, cache paths, Cloud workflow)
- Update `mcp-translate.mdc` when playbook changes → re-submit for review
- npm publish does **not** auto-update Marketplace listing
