#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_PKG="$ROOT/packages/cli"

echo "prepare:publish — copy plugin + templates into packages/cli"

rm -rf "$CLI_PKG/plugin" "$CLI_PKG/templates"
cp -R "$ROOT/plugin" "$CLI_PKG/plugin"
cp -R "$ROOT/templates" "$CLI_PKG/templates"

echo "  copied plugin/ and templates/ → packages/cli/"
echo "  next: bump versions, npm publish -w @cursor-translate/core, then mcp, then cursor-translate"
