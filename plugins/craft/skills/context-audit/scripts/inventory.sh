#!/usr/bin/env bash
# Read-only inventory of the always-loaded context surfaces for the current project.
# Prints names, sizes and counts only. Never prints MCP env/headers/args (may hold secrets).
set -u
PROJECT="${1:-$PWD}"
DAYS="${2:-30}"
U="$HOME/.claude"

section() { printf '\n## %s\n' "$1"; }

section "enabledPlugins (true only) by layer"
for f in "$U/settings.json" "$PROJECT/.claude/settings.json" "$PROJECT/.claude/settings.local.json"; do
  [ -f "$f" ] && printf '%s: ' "$f" && jq -c '[(.enabledPlugins // {}) | to_entries[] | select(.value) | .key]' "$f"
done

section "settings that shape context (user layer)"
[ -f "$U/settings.json" ] && jq -c '{outputStyle, autoMemoryEnabled, disableClaudeAiConnectors, skillListingBudgetFraction, hookEvents: ((.hooks // {}) | keys), skillOverrides: ((.skillOverrides // {}) | length), mcpServers: ((.mcpServers // {}) | keys)}' "$U/settings.json"

section "MCP servers (names only)"
[ -f "$PROJECT/.mcp.json" ] && printf 'project .mcp.json: ' && jq -c '(.mcpServers // {}) | keys' "$PROJECT/.mcp.json"
[ -f "$HOME/.claude.json" ] && jq -c --arg p "$PROJECT" '{user: ((.mcpServers // {}) | keys), local: (.projects[$p].mcpServers // {} | keys), disabledMcpServers: (.projects[$p].disabledMcpServers // [])}' "$HOME/.claude.json"

section "installed plugins (name@marketplace  version  scope  installPath)"
[ -f "$U/plugins/installed_plugins.json" ] && jq -r '.plugins | to_entries[] | .key as $k | .value[]? | "\($k)  \(.version // "?")  \(.scope // "?")  \(.installPath // "?")"' "$U/plugins/installed_plugins.json"

section "STALE: installed or enabled plugins that their marketplace no longer lists"
# Catches renamed/removed plugins (they fail at reload and load nothing) and enabled-but-not-installed keys.
KM="$U/plugins/known_marketplaces.json"
if [ -f "$U/plugins/installed_plugins.json" ] && [ -f "$KM" ]; then
  { jq -r '.plugins | keys[]' "$U/plugins/installed_plugins.json"
    for f in "$U/settings.json" "$PROJECT/.claude/settings.json" "$PROJECT/.claude/settings.local.json"; do
      [ -f "$f" ] && jq -r '(.enabledPlugins // {}) | to_entries[] | select(.value) | .key' "$f"
    done; } | sort -u | while read -r key; do
    name="${key%@*}"; mkt="${key#*@}"
    loc="$(jq -r --arg m "$mkt" '.[$m].installLocation // empty' "$KM")"
    manifest="$loc/.claude-plugin/marketplace.json"
    if [ -z "$loc" ]; then printf '%s  (marketplace %s not registered)\n' "$key" "$mkt"
    elif [ -f "$manifest" ]; then
      jq -e --arg n "$name" '[.plugins[].name] | index($n)' "$manifest" >/dev/null || printf '%s  (not listed in %s)\n' "$key" "$mkt"
    fi
  done
fi

section "memory and instruction files (lines  bytes  path)"
for f in "$U/CLAUDE.md" "$PROJECT/CLAUDE.md" "$PROJECT/.claude/CLAUDE.md" "$PROJECT/CLAUDE.local.md" "$PROJECT/AGENTS.md" "$U"/rules/*.md "$PROJECT"/.claude/rules/*.md; do
  [ -f "$f" ] && printf '%s  %s  %s\n' "$(wc -l < "$f" | tr -d ' ')" "$(wc -c < "$f" | tr -d ' ')" "$f"
done
# auto-memory index: project key is the path with / replaced by -
MEM="$U/projects/$(printf '%s' "$PROJECT" | tr '/' '-')/memory/MEMORY.md"
[ -f "$MEM" ] && printf '%s  %s  %s\n' "$(wc -l < "$MEM" | tr -d ' ')" "$(wc -c < "$MEM" | tr -d ' ')" "$MEM"

section "skill files on disk (not proof of loaded: _archive may be ignored; built-ins are not on disk)"
{ find "$U/skills" -maxdepth 4 -name SKILL.md; find "$PROJECT/.claude/skills" -maxdepth 3 -name SKILL.md; } 2>/dev/null \
  | sed -e "s|^$HOME|~|" -e 's|/synced/[0-9a-f_-]*/|/synced/<id>/|' | sort | head -80
section "subagent files (names only)"
ls "$U/agents" "$PROJECT/.claude/agents" 2>/dev/null | head -40

section "transcripts (last $DAYS days)"
printf 'files: %s  (session + subagent)\n' "$(find "$U/projects" -name '*.jsonl' -mtime "-$DAYS" 2>/dev/null | wc -l | tr -d ' ')"
printf 'project dirs: %s\n' "$(ls "$U/projects" 2>/dev/null | wc -l | tr -d ' ')"
