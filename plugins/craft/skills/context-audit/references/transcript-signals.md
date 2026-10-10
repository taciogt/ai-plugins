# Transcript signals

Verified 2026-10-10 on Claude Code 2.1.x. Transcripts are an undocumented format: if a one-liner returns nothing on a corpus that clearly has data, report the format as drifted rather than concluding "never used". Background: `docs/research/headless-skill-observability.md` in the ai-plugins repo.

Corpus: `~/.claude/projects/<project-dir>/*.jsonl` (sessions) and `<session>/subagents/*.jsonl` (subagent runs). Walk both: subagents call skills too.

| Signal | Detection |
|---|---|
| Model-invoked skill | assistant message, `content[]` item `type=="tool_use" and name=="Skill"`, value in `.input.skill` |
| Slash-invoked skill | user message text containing `<command-name>/<name></command-name>`; slash runs emit no `Skill` tool_use |
| MCP tool use | tool_use `name` starts `mcp__`; server = second `__` segment. Plugin-scoped: `mcp__plugin_<plugin>_<server>__<tool>` |
| Subagent dispatch | tool_use `name` in `Agent` or `Task`; type in `.input.subagent_type` |
| Time window | top-level `.timestamp`, ISO-8601 UTC |
| Plugin skill name | `<plugin>:<skill>`; user and project skills are bare names |

Always filter on the record's own `.timestamp`. `-mtime` only narrows which files to open: a file touched yesterday holds older records, so `-mtime` alone overstates recent use (measured 2026-10-10: 63 vs 48 calls for one server).

```bash
N=30
CUTOFF=$(date -v-${N}d +%F 2>/dev/null || date -d "${N} days ago" +%F)
files() { find ~/.claude/projects -name '*.jsonl' -mtime -$((N+1)) -print0 | xargs -0 cat; }

# model-invoked skills, counted
files | jq -rc --arg c "$CUTOFF" 'select(.type=="assistant" and (.timestamp//"")>=$c)|.message.content[]?|select(.type=="tool_use" and .name=="Skill")|.input.skill' \
 | sort | uniq -c | sort -rn

# slash-invoked, counted
files | jq -rc --arg c "$CUTOFF" 'select(.type=="user" and (.timestamp//"")>=$c)|.message.content|if type=="string" then . else (.[]?.text?//empty) end' \
 | grep -oE '<command-name>[^<]+' | sort | uniq -c | sort -rn

# MCP servers, counted
files | jq -rc --arg c "$CUTOFF" 'select(.type=="assistant" and (.timestamp//"")>=$c)|.message.content[]?|select(.type=="tool_use" and (.name|startswith("mcp__")))|.name|split("__")[1]' \
 | sort | uniq -c | sort -rn
```

## Reading the results
- Model-invoked count 0 and slash count > 0: the model never picked it up; candidate for `disable-model-invocation: true` (zero listing cost, still runnable).
- Both 0 over a window shorter than the tool's install age or the user's usage rhythm (quarterly tasks): low-confidence "unused".
- A plugin is "used" when any of its skills, subagents, MCP tools or hooks appear. Plugin hooks leave no transcript trace: mark hook-only plugins "unverifiable", not unused.
- Name normalisation: match skills by `<plugin>:<skill>` and by bare `<skill>`; claude.ai-synced skills may appear as `anthropic-skills:<skill>` or bare.
