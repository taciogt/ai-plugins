# Hooks — Full Reference

## What Are Hooks

User-defined shell commands, HTTP endpoints, LLM prompts, or agents that execute automatically at lifecycle points. Enable automation, validation, and external integrations.

## Configuration Locations

| Location | Scope | Shareable |
|----------|-------|-----------|
| `~/.claude/settings.json` | All projects | No |
| `.claude/settings.json` | Single project | Yes (commit to repo) |
| `.claude/settings.local.json` | Single project | No (gitignored) |
| Skill/agent frontmatter | Component lifetime | Yes (in component file) |

## All Lifecycle Events

| Event | Cadence | Fires When | Matcher Input |
|-------|---------|------------|---------------|
| `SessionStart` | Once | Session begins/resumes | `startup\|resume\|clear\|compact` |
| `SessionEnd` | Once | Session terminates | `clear\|resume\|logout\|other` |
| `UserPromptSubmit` | Per turn | User submits prompt | — |
| `PreToolUse` | Per tool | Before tool executes | Tool name |
| `PermissionRequest` | Per tool | Permission dialog appears | Tool name |
| `PermissionDenied` | Per tool | Auto mode denies call | Tool name |
| `PostToolUse` | Per tool | After tool succeeds | Tool name |
| `PostToolUseFailure` | Per tool | After tool fails | Tool name |
| `Stop` | Per turn | Claude finishes responding | — |
| `StopFailure` | Per turn | Claude fails to stop cleanly | — |
| `InstructionsLoaded` | Once | CLAUDE.md/rules files load | — |
| `FileChanged` | On change | Watched file changes on disk | Literal filename |
| `CwdChanged` | On change | Working directory changes | — |
| `ConfigChange` | On change | Configuration file changes | — |
| `Notification` | On event | Claude Code sends notification | `permission_prompt\|idle_prompt\|auth_success` |
| `SubagentStart` | Per agent | Subagent spawns | Agent type name |
| `SubagentStop` | Per agent | Subagent finishes | Agent type name |
| `TaskCreated` | Per task | Task lifecycle | — |
| `TaskCompleted` | Per task | Task lifecycle | — |
| `WorktreeCreate` | Per worktree | Worktree created | — |
| `WorktreeRemove` | Per worktree | Worktree removed | — |
| `PreCompact` | Per compact | Before context compaction | — |
| `PostCompact` | Per compact | After context compaction | — |
| `Elicitation` | Per request | MCP server input request | MCP server name |

## Hook Handler Types

### 1. `command` — Shell Command
```json
{
  "type": "command",
  "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/validate.sh",
  "async": false,
  "timeout": 600,
  "shell": "bash"
}
```
Receives JSON on stdin. Exit codes:
- **0**: Success (parse JSON from stdout if present)
- **2**: Blocking error (stderr fed back to Claude)
- **Other**: Non-blocking error (stderr shown in transcript)

### 2. `http` — HTTP Webhook
```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/pre-tool",
  "headers": { "Authorization": "Bearer $MY_TOKEN" },
  "allowedEnvVars": ["MY_TOKEN"],
  "timeout": 30
}
```
POSTs JSON to endpoint. 2xx with JSON → parsed like command output. Non-2xx → non-blocking error.

### 3. `prompt` — LLM Evaluation
```json
{
  "type": "prompt",
  "prompt": "Should this database write be allowed? Details: $ARGUMENTS",
  "model": "claude-opus",
  "timeout": 30
}
```
Claude model evaluates; returns yes/no decision.

### 4. `agent` — Subagent Verification
```json
{
  "type": "agent",
  "prompt": "Verify this code change is safe: $ARGUMENTS",
  "timeout": 60
}
```
Spawns subagent with Read/Grep/Glob tools to verify before returning decision.

## Common Hook Fields

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `command`, `http`, `prompt`, or `agent` |
| `if` | No | Permission rule filter: `"Bash(rm *)"` or `"Edit(*.ts)"` |
| `timeout` | No | Seconds before cancel (default: 600 command, 30 prompt, 60 agent) |
| `statusMessage` | No | Custom spinner message shown while hook runs |
| `once` | No | Run once per session then remove (skills/agents frontmatter only) |
| `async` | No | `true` = run in background, don't block |
| `asyncRewake` | No | `true` = wake Claude when async hook completes (exit 2 shows stderr) |

## Configuration Structure

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-rm.sh",
            "timeout": 30,
            "statusMessage": "Checking command safety..."
          }
        ]
      }
    ]
  }
}
```

## Matcher Patterns

| Matcher | Evaluation | Example |
|---------|-----------|---------|
| `"*"`, `""`, omitted | Match all | Always fires |
| Letters/digits/`_`/`\|` | Exact or pipe-separated list | `Bash` or `Edit\|Write` |
| Other chars | JavaScript regex | `^Notebook` or `mcp__.*` |

Tool event matchers: `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch`, `mcp__<server>__<tool>`

## JSON Input Schema (Common Fields)

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/dir",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "agent_id": "optional-subagent-id",
  "agent_type": "optional-agent-name",
  "tool_name": "Bash",
  "tool_input": { "command": "git status" }
}
```

## JSON Output Schema

```json
{
  "continue": true,
  "stopReason": "optional — only when continue: false",
  "suppressOutput": false,
  "systemMessage": "optional warning shown to user",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "explanation",
    "updatedInput": { "field": "new_value" },
    "additionalContext": "context injected for Claude"
  }
}
```

## Decision Control by Event

### PreToolUse
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "why",
    "updatedInput": {},
    "additionalContext": "context"
  }
}
```
Multiple hooks: `deny` > `defer` > `ask` > `allow`

### PostToolUse
```json
{
  "decision": "block",
  "reason": "explanation",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "info for Claude"
  }
}
```

### Stop / SubagentStop / ConfigChange
```json
{ "decision": "block", "reason": "explanation" }
```

### UserPromptSubmit
```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "extra context for this turn",
    "sessionTitle": "auto-generated title"
  }
}
```

## Practical Examples

### Block dangerous commands (PreToolUse)
```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command // empty')
if echo "$COMMAND" | grep -qE 'rm -rf|:(){:|:;:'; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Dangerous command blocked"}}'
fi
exit 0
```

### Auto-format after edits (PostToolUse)
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{"type": "command", "command": "./scripts/format.sh", "timeout": 30}]
    }]
  }
}
```

### Load environment on session start (SessionStart)
```bash
#!/bin/bash
if [ -f "$PWD/.env" ]; then
  grep -v '^#' "$PWD/.env" >> "$CLAUDE_ENV_FILE"
fi
```

## Hooks in Skills and Agents Frontmatter

```yaml
---
name: my-skill
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/safety-check.sh"
          once: true    # run only once per session
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "./scripts/format.sh"
---
```

- Scoped to component lifetime; cleaned up when component finishes
- For subagents: `Stop` hooks converted to `SubagentStop` at runtime
- `once: true` makes hook run once per session then remove itself

## Environment Variables Available in Hooks

- `$CLAUDE_PROJECT_DIR` — project root
- `${CLAUDE_PLUGIN_ROOT}` — plugin installation directory
- `${CLAUDE_PLUGIN_DATA}` — plugin persistent data directory
- `$CLAUDE_ENV_FILE` — file to write env vars (SessionStart hooks)

## Disable All Hooks

```json
{ "disableAllHooks": true }
```

Cannot disable managed hooks from lower-priority config files.
