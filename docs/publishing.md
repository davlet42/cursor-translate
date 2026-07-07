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
- Log in on this machine:

  ```bash
  npm login
  npm whoami   # should print your npm username
  ```

- **Scoped packages** (`@cursor-translate/*`) need `--access public` on first publish, and you must own the `@cursor-translate` org on npm (create it at [npmjs.com](https://www.npmjs.com/org/create) if needed).
- `agent` CLI **not** required to publish — only for runtime translate
- Clean `npm run build` and `npm test`

### Packaging note

`dist/` is gitignored. Each publishable package whitelists only `dist/` (and CLI also `plugin/` + `templates/`). `prepack` runs `build` automatically before `npm publish`. Always dry-run and confirm the tarball lists `dist/*.js`, not `src/*.ts`:

```bash
npm publish -w @cursor-translate/core --access public --dry-run 2>&1 | grep -E 'dist/|src/'
```

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

## CI (GitHub Actions)

On every push/PR to `main`: `npm test` (`.github/workflows/ci.yml`).

On tag `v*`: publish core → mcp → cli (`.github/workflows/publish.yml`).

Add repository secret **`NPM_TOKEN`** — npm access token with publish rights for `@cursor-translate/*` and `cursor-translate`. Create at [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens) (type: **Automation** or **Publish**).

```bash
git tag v0.1.1 && git push origin v0.1.1   # triggers publish workflow
```

Bump `version` in all three `package.json` files before tagging.

---

## Related

- [Marketplace](./marketplace.md) — Cursor plugin distribution
- [mcp-setup.md](./mcp-setup.md) — MCP install for users
