#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_PKG="$ROOT/packages/cli"

echo "prepare:publish — verify lockstep versions, copy plugin + templates into packages/cli"

node "$ROOT/scripts/sync-package-versions.mjs" --check

rm -rf "$CLI_PKG/plugin" "$CLI_PKG/templates"
cp -R "$ROOT/plugin" "$CLI_PKG/plugin"
cp -R "$ROOT/templates" "$CLI_PKG/templates"
cp "$ROOT/README.md" "$CLI_PKG/README.md"

echo "  copied plugin/, templates/, README.md → packages/cli/"
echo "  next: bump versions, npm publish -w @cursor-translate/core, then mcp, then cursor-translate"
