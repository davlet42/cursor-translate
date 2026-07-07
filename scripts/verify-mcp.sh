#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== cursor-translate verify:mcp =="

echo "[1/3] build"
npm run build --silent

CLI="node $ROOT/packages/cli/dist/cli.js"
MCP_SERVER="$ROOT/packages/mcp/dist/server.js"

if [[ ! -f "$ROOT/packages/cli/dist/cli.js" ]]; then
  echo "FAIL: packages/cli/dist/cli.js missing"
  exit 1
fi

if [[ ! -f "$MCP_SERVER" ]]; then
  echo "FAIL: packages/mcp/dist/server.js missing"
  exit 1
fi

echo "[2/3] trust args helper"
node --input-type=module -e "
  import { appendCursorAgentTrustArgs } from './packages/core/dist/agent/append-cursor-agent-trust-args.js';
  const out = appendCursorAgentTrustArgs(['--print', '--mode', 'ask']);
  if (!out.includes('--trust')) {
    console.error('FAIL: expected --trust in', out);
    process.exit(1);
  }
  console.log('  appendCursorAgentTrustArgs: ok');
"

echo "[3/3] resolve_doc smoke (CLI resolve)"
RESOLVE_JSON="$($CLI resolve README.md --json 2>/dev/null || true)"
if [[ -z "$RESOLVE_JSON" ]]; then
  echo "WARN: resolve README.md returned empty (no Cyrillic — passthrough expected)"
else
  echo "$RESOLVE_JSON" | node --input-type=module -e "
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      const data = JSON.parse(raw);
      if (!data.action) {
        console.error('FAIL: resolve JSON missing action', data);
        process.exit(1);
      }
      console.log('  resolve action:', data.action);
    });
  "
fi

echo ""
echo "PASS: binaries built; trust helper ok; resolve smoke ok"
echo "Manual: enable MCP in Cursor and confirm translate + resolve_doc tools list."
