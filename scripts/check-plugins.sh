#!/usr/bin/env bash
# Typechecks and tests the plugins that carry code.
# Usage: check-plugins.sh [plugin...]   (default: every plugin)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
tsc=node_modules/.bin/tsc
plugins=${*:-$(ls plugins)}

for p in $plugins; do
  dir=plugins/$p
  [ -d "$dir" ] || continue
  if [ -f "$dir/tsconfig.json" ]; then
    if [ ! -x "$tsc" ]; then
      echo "✗ $tsc missing: run npm install" >&2
      exit 1
    elif [ ! -d "$dir/.claude-plugin/types/claude-code" ]; then
      echo "⚠ $p: engine types missing under $dir/.claude-plugin/types (gitignored); typecheck skipped" >&2
    else
      echo "▸ typecheck $p"
      "$tsc" --noEmit -p "$dir"
    fi
  fi
  if [ -d "$dir/tests" ]; then
    echo "▸ test $p"
    claude plugin test "$dir"
  fi
done
