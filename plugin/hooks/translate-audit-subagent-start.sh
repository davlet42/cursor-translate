#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
task=$(echo "$input" | jq -r '.task // empty')

if [ -z "$task" ]; then
  echo '{"permission": "allow"}'
  exit 0
fi

LOG_SCRIPT="${CURSOR_TRANSLATE_HOME:-$HOME/.cursor/translate-proxy}/log-metrics.mjs"

if [ -f "$LOG_SCRIPT" ]; then
  printf '%s' "$input" | SOURCE=subagent_task node "$LOG_SCRIPT" 2>/dev/null || true
fi

echo '{"permission": "allow"}'
exit 0
