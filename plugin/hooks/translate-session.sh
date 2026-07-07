#!/usr/bin/env bash
# Injects language policy via sessionStart additional_context (when supported).
# Fallback: rules/translate.mdc in plugin bundle.
set -euo pipefail

cat <<'EOF'
{
  "additional_context": "cursor-translate plugin active. Prefer English cached docs under .cursor/cache/*.en.md when reading project documentation. User may write prompts in Russian; reason in English internally when possible. Do not translate code, paths, identifiers, or glossary terms."
}
EOF
exit 0
