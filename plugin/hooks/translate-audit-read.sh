#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

if [ "$tool_name" != "Read" ]; then
  echo '{}'
  exit 0
fi

LOG_SCRIPT="${CURSOR_TRANSLATE_HOME:-$HOME/.cursor/translate-proxy}/log-metrics.mjs"

if [ -f "$LOG_SCRIPT" ]; then
  printf '%s' "$input" | SOURCE=file_read node "$LOG_SCRIPT" 2>/dev/null || true
fi

echo '{}'
exit 0
