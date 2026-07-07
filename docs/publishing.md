# Publishing to npm

Monorepo with three publishable packages (publish **in this order**):

| Package | npm name | Contents |
|---|---|---|
| Core | `@cursor-translate/core` | detect, cache, translate, metrics |
| MCP | `@cursor-translate/mcp` | `cursor-translate-mcp` binary |
| CLI | `cursor-translate` | `cursor-translate` binary, depends on core |

The git repo root stays `"private": true` for workspace development.

---

## Prerequisites

- npm account with 2FA
- `npm login`
- `agent` CLI **not** required to publish — only for runtime translate
- Clean `npm run build` and `npm test`

---

## Pre-publish checklist

```bash
cd cursor-translate
npm install
npm run build
npm test
npm run verify:mcp
```

1. Bump versions in sync (`0.1.0` → `0.1.1`) in:
   - `packages/core/package.json`
   - `packages/mcp/package.json`
   - `packages/cli/package.json`
   - `plugin/.cursor-plugin/plugin.json` (marketplace metadata)
2. Update `packages/cli` dependency on core: `"@cursor-translate/core": "^0.1.x"`
3. Update `packages/mcp` dependency on core similarly
4. Copy assets into CLI package for global `init` (from repo root):

   ```bash
   npm run prepare:publish
   ```

   This copies `plugin/` and `templates/` into `packages/cli/` so `cursor-translate init` works after `npm i -g`.

5. Git tag: `git tag v0.1.x && git push origin v0.1.x`

---

## Publish commands

```bash
# 1. Core
npm publish -w @cursor-translate/core --access public

# 2. MCP (after core is on npm)
npm publish -w @cursor-translate/mcp --access public

# 3. CLI
npm publish -w cursor-translate --access public
```

Dry run:

```bash
npm publish -w @cursor-translate/core --access public --dry-run
```

---

## After publish — end user install

```bash
npm install -g cursor-translate
cursor-translate init --path
source ~/.zshrc

# MCP: add to ~/.cursor/mcp.json — see mcp-setup.md
ln -sf "$(npm root -g)/cursor-translate/plugin" ~/.cursor/plugins/local/cursor-translate
```

> **Note:** Global plugin path may differ; prefer cloning the repo for plugin symlink during beta, or install from GitHub until Marketplace ships.

---

## CI (future)

Add GitHub Actions on tag:

- `npm test`
- `npm publish` with `NPM_TOKEN`
- Optional: attach `cursor-translate` tarball to GitHub Release

---

## Related

- [Marketplace](./marketplace.md) — Cursor plugin distribution
- [mcp-setup.md](./mcp-setup.md) — MCP install for users
