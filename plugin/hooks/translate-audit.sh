#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // empty')

if [ -z "$prompt" ]; then
  echo '{"continue": true}'
  exit 0
fi

TRANSLATE_HOME="${CURSOR_TRANSLATE_HOME:-$HOME/.cursor/translate-proxy}"
QUOTA_FILE="${TRANSLATE_HOME}/doc-translate-quota.json"

if [ -s "$QUOTA_FILE" ]; then
  echo '{"continue": true}'
  exit 0
fi

LOG_SCRIPT="${TRANSLATE_HOME}/log-metrics.mjs"

if [ -f "$LOG_SCRIPT" ]; then
  printf '%s' "$input" | SOURCE=user_prompt node "$LOG_SCRIPT" 2>/dev/null || true
fi

echo '{"continue": true}'
exit 0
