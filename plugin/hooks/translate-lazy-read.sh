#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

if [ "$tool_name" != "Read" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

file_path=$(echo "$input" | jq -r '.tool_input.path // .tool_input.file_path // .tool_input.target // empty')

if [ -z "$file_path" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

case "$file_path" in
  *.md|*.mdx) ;;
  *)
    echo '{"permission":"allow"}'
    exit 0
    ;;
esac

TRANSLATE_HOME="${CURSOR_TRANSLATE_HOME:-$HOME/.cursor/translate-proxy}"
CLI_WRAPPER="${TRANSLATE_HOME}/bin/cursor-translate"

if [ ! -x "$CLI_WRAPPER" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

result=$(printf '%s' "$input" | "$CLI_WRAPPER" hook-resolve 2>/dev/null || true)

if [ -z "$result" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

printf '%s' "$result"
exit 0
