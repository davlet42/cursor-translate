#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
summary=$(echo "$input" | jq -r '.summary // empty')
status=$(echo "$input" | jq -r '.status // empty')

if [ -z "$summary" ] && [ "$status" != "completed" ] && [ "$status" != "error" ]; then
  echo '{}'
  exit 0
fi

LOG_SCRIPT="${CURSOR_TRANSLATE_HOME:-$HOME/.cursor/translate-proxy}/log-metrics.mjs"

if [ -f "$LOG_SCRIPT" ]; then
  printf '%s' "$input" | SOURCE=subagent_summary node "$LOG_SCRIPT" 2>/dev/null || true
fi

echo '{}'
exit 0
