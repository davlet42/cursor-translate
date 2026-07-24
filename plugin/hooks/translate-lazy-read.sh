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

# Keep UI responsive: never block Read for minutes. Config default is 15s;
# Cursor hooks.json timeout should match. On expiry → fail-open (Russian file).
TIMEOUT_SEC="${CURSOR_TRANSLATE_LAZY_READ_TIMEOUT_SEC:-15}"
if [ -f "$TRANSLATE_HOME/config.yaml" ]; then
  cfg_t=$(sed -nE 's/^[[:space:]]*lazy_read_timeout_sec:[[:space:]]*([0-9]+).*/\1/p' "$TRANSLATE_HOME/config.yaml" | head -1 || true)
  [ -n "${cfg_t:-}" ] && TIMEOUT_SEC="$cfg_t"
fi

tmp_out=$(mktemp)
tmp_err=$(mktemp)
cleanup() { rm -f "$tmp_out" "$tmp_err"; }
trap cleanup EXIT

printf '%s' "$input" | "$CLI_WRAPPER" hook-resolve >"$tmp_out" 2>"$tmp_err" &
pid=$!
(
  sleep "$TIMEOUT_SEC"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    # also stop nested agent CLI if still translating
    pkill -P "$pid" 2>/dev/null || true
  fi
) &
watcher=$!

if wait "$pid" 2>/dev/null; then
  kill "$watcher" 2>/dev/null || true
  result=$(cat "$tmp_out" || true)
  if [ -z "$result" ]; then
    echo '{"permission":"allow"}'
    exit 0
  fi
  printf '%s' "$result"
  exit 0
fi

kill "$watcher" 2>/dev/null || true
# timed out or failed — fail open
echo '{"permission":"allow"}'
exit 0
