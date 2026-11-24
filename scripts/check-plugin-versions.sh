#!/usr/bin/env bash
# Fails when a pinned plugin (its plugin.json has a "version") changed a
# shipped file between <base> and <head> without changing that version.
# Rule: docs/adr/0002-per-plugin-versioning.md
set -euo pipefail
base=${1:?usage: check-plugin-versions.sh <base> [head]}
head=${2:-HEAD}

version_at() {
  git show "$1:plugins/$2/.claude-plugin/plugin.json" 2>/dev/null | jq -r '.version // empty' || true
}

plugins=$(git diff --name-only "$base" "$head" -- plugins/ \
  | { grep -Ev '^plugins/[^/]+/(tests/|tsconfig\.json$|\.gitignore$)' || true; } \
  | cut -d/ -f2 | sort -u)

status=0
for p in $plugins; do
  new=$(version_at "$head" "$p")
  old=$(version_at "$base" "$p")
  # Tracking plugins (no version), new plugins and newly pinned ones pass.
  if [ -n "$new" ] && [ -n "$old" ] && [ "$new" = "$old" ]; then
    echo "✗ $p changed but is still at $new: bump plugins/$p/.claude-plugin/plugin.json (rule: docs/adr/0002-per-plugin-versioning.md)" >&2
    status=1
  fi
done
exit $status
