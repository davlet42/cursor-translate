#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
text=$(echo "$input" | jq -r '.text // empty')

if [ -z "$text" ]; then
  echo '{}'
  exit 0
fi

TRANSLATE_HOME="${CURSOR_TRANSLATE_HOME:-$HOME/.cursor/translate-proxy}"
QUOTA_FILE="${TRANSLATE_HOME}/doc-translate-quota.json"

if [ -s "$QUOTA_FILE" ]; then
  echo '{}'
  exit 0
fi

LOG_SCRIPT="${TRANSLATE_HOME}/log-metrics.mjs"

if [ -f "$LOG_SCRIPT" ]; then
  printf '%s' "$input" | SOURCE=agent_response node "$LOG_SCRIPT" 2>/dev/null || true
fi

echo '{}'
exit 0
