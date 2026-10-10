#!/usr/bin/env bash
# Read-only usage mining over Claude Code transcripts (all projects, sessions + subagents).
# Usage: usage.sh [days]   Prints one JSON object. Never prints transcript text.
set -u
DAYS="${1:-30}"
ROOT="$HOME/.claude/projects"
CUTOFF="$(date -v-"${DAYS}"d +%F 2>/dev/null || date -d "${DAYS} days ago" +%F)"

# -mtime only narrows which files to open; the record's own .timestamp decides the window.
find "$ROOT" -name '*.jsonl' -mtime -"$((DAYS + 1))" -print0 2>/dev/null \
| xargs -0 jq -c --arg c "$CUTOFF" '
    (input_filename | split("/projects/")[1] // "" | split("/")[0]) as $p
    | select((.timestamp // "") >= $c)
    | .timestamp[0:10] as $d
    | if .type == "assistant" then
        (.message.content[]? | select(.type == "tool_use")
          | if .name == "Skill" then {k: "skill_model", n: (.input.skill // ""), d: $d, p: $p}
            elif (.name | startswith("mcp__")) then {k: "mcp", n: (.name | split("__")[1]), d: $d, p: $p}
            elif (.name == "Agent" or .name == "Task") then {k: "agent", n: (.input.subagent_type // "general-purpose"), d: $d, p: $p}
            else empty end)
      elif .type == "user" then
        ((.message.content | if type == "string" then . else ([.[]? | .text? // empty] | join("\n")) end)
          | [scan("<command-name>/?([^<]+)</command-name>")[0]]
          | .[] | {k: "skill_slash", n: ., d: $d, p: $p})
      else empty end' 2>/dev/null \
| jq -s --argjson days "$DAYS" --arg cutoff "$CUTOFF" '
    def agg(kind): [ .[] | select(.k == kind) ] | group_by(.n)
      | map({name: .[0].n, count: length, last: (map(.d) | max), projects: (map(.p) | unique | length)});
    { window_days: $days, cutoff: $cutoff,
      coverage: { events: length,
                  oldest_event: (map(.d) | min), newest_event: (map(.d) | max),
                  projects: (map(.p) | unique | length) },
      skills_model: agg("skill_model"),
      skills_slash: agg("skill_slash"),
      mcp_servers:  agg("mcp"),
      subagents:    agg("agent") }'
