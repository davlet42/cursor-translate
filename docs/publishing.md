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

   This copies `plugin/`, `templates/`, and root `README.md` into `packages/cli/` so `cursor-translate init` works after `npm i -g` and the npm package page shows the README.

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

On tag `v*`: publish core → mcp → cli (`.github/workflows/publish.yml`). Manual retry: Actions → **Publish npm** → **Run workflow** (`workflow_dispatch`).

Add repository secret **`NPM_TOKEN`** in GitHub → Settings → Secrets → Actions.

### NPM_TOKEN — scoped vs unscoped (important)

Three packages, **two namespaces** on npm:

| Package | Namespace | Covered by scope `@cursor-translate`? |
|---|---|---|
| `@cursor-translate/core` | scoped | ✅ yes |
| `@cursor-translate/mcp` | scoped | ✅ yes |
| `cursor-translate` | **unscoped** (no `@`) | ❌ **no** |

Org `cursor-translate` on npm also **does not** grant publish to unscoped `cursor-translate` — that package lives under your user account (`davlet42`).

**Granular Access Token** must include **both**:

1. Scope **`@cursor-translate`** — Read and write  
2. Package **`cursor-translate`** — Read and write (add explicitly under Packages, not only the scope)

Without (2), CI publishes core + mcp successfully but CLI fails with:

```text
403 Forbidden - PUT https://registry.npmjs.org/cursor-translate
You may not perform that action with these credentials.
```

**Classic token** alternative: type **Automation**, publish access — covers all packages on the account (simpler, broader).

Create tokens at [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens). Enable **Bypass 2FA** for CI tokens.

After creating or editing the token, paste it into GitHub secret `NPM_TOKEN` (name must match exactly).

### Trigger publish

```bash
# bump version in packages/*/package.json first
git tag v0.1.x && git push origin v0.1.x
```

If core/mcp for that version are already on npm, either publish CLI manually:

```bash
npm publish -w cursor-translate --access public
```

or bump to the next patch and tag again.

### GitHub Release

Publishing to npm does **not** create a GitHub Release. After a successful publish:

```bash
gh release create v0.1.x --title "v0.1.x" --notes "…"
```

Mark the new release **Latest** in GitHub UI if an older tag still shows as default.

---

## Related

- [Marketplace](./marketplace.md) — Cursor plugin distribution
- [mcp-setup.md](./mcp-setup.md) — MCP install for users
