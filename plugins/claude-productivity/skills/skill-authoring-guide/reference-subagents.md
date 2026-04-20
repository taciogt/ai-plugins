# Subagents — Full Reference

## File Location & Scope

```
.claude/agents/<name>.md        # Project (priority 3); commit to version control
~/.claude/agents/<name>.md      # Personal/user (priority 4)
# Priority: Managed > CLI --agents > Project > Personal > Plugin
```

**Project convention**: always place agents in `.claude/agents/` (project-level). For subagents, Project already beats Personal in resolution order — consistent with the project-first convention used for skills.

Subagents are loaded at session start. Adding a file mid-session requires restart or `/agents` command.

## All Frontmatter Fields

### Required Fields

```yaml
name: code-reviewer          # lowercase + hyphens
description: >
  Expert code reviewer. Use proactively after writing or modifying code.
  Reviews for quality, security, and maintainability.
```

### Tool Control

```yaml
# Allowlist (only these tools):
tools: Read, Glob, Grep, Bash

# Denylist (inherit everything except these):
disallowedTools: Write, Edit

# Restrict spawnable sub-agents:
tools: Agent(worker, researcher), Read, Bash

# If Agent omitted entirely: cannot spawn any subagents
# If Agent without parens: can spawn any subagent
```

If both `tools` and `disallowedTools` set: denylist applied first, then allowlist resolved against remainder.

### Model

```yaml
model: haiku       # alias: haiku, sonnet, opus
model: inherit     # default — same as parent conversation
model: claude-sonnet-4-6   # full model ID
```

Resolution order: `CLAUDE_CODE_SUBAGENT_MODEL` env > per-invocation `model` param > frontmatter `model` > parent model.

### Permission Mode

```yaml
permissionMode: default        # standard prompts
permissionMode: acceptEdits    # auto-accept file edits in working dir
permissionMode: auto           # background classifier reviews commands
permissionMode: dontAsk        # auto-deny (explicit allows still work)
permissionMode: bypassPermissions  # skip all prompts (use with caution)
permissionMode: plan           # read-only exploration
```

If parent uses `bypassPermissions` or `acceptEdits`: child cannot override. If parent uses `auto`: child inherits `auto` regardless of frontmatter.

### Other Fields

```yaml
maxTurns: 10        # stop after N agentic turns

skills:             # preload full skill content at startup
  - api-conventions
  - error-handling-patterns

mcpServers:         # inline definition or reference by name
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github          # reference to already-configured server

memory: project     # user | project | local (enables cross-session learning)
# Memory dirs:
#   user:    ~/.claude/agent-memory/<name>/
#   project: .claude/agent-memory/<name>/
#   local:   .claude/agent-memory-local/<name>/

background: true    # always run as background task (default: false)

effort: high        # low | medium | high | xhigh | max

isolation: worktree # gives agent isolated git worktree; auto-cleaned if no changes

color: blue         # red | blue | green | yellow | purple | orange | pink | cyan

initialPrompt: >    # auto-submitted first user turn when agent runs as main session
  Review the latest changes and check your memory for patterns you've seen before.
```

### Hooks in Subagent Frontmatter

```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-cmd.sh"
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"
  Stop:            # converted to SubagentStop at runtime
    - hooks:
        - type: command
          command: "./scripts/cleanup.sh"
```

Hooks scoped to agent's lifetime, cleaned up when agent finishes.

## Built-in Agents

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| `Explore` | Haiku | Read-only (no Write/Edit) | Codebase search, file discovery |
| `Plan` | Inherits | Read-only | Research during plan mode |
| `general-purpose` | Inherits | All | Complex multi-step tasks |

## Invocation Patterns

### Natural Language
```
Use the code-reviewer agent to review auth changes
Have the debugger agent look at this error
```
Claude decides whether to delegate.

### @-mention (guaranteed invocation)
```
@"code-reviewer (agent)" look at the auth changes
```
Exact: `@agent-<name>` or `@agent-<plugin>:<name>` for plugins.

### CLI (session-wide)
```bash
claude --agent code-reviewer
```
Replaces default system prompt with agent's markdown body.

### Preload via skill `context: fork`
```yaml
# In SKILL.md:
context: fork
agent: Explore
```

### skills field (inject into agent context)
```yaml
# In agent .md:
skills:
  - api-conventions
```
Full skill content injected at startup — subagents do NOT inherit parent's skills.

## Memory System

When `memory` is set, agent gets:
1. A persistent directory (scope-dependent path)
2. System prompt instructions for reading/writing memory
3. First 200 lines / 25KB of `MEMORY.md` injected at startup
4. Auto-enabled Read, Write, Edit tools for memory management

Best practice: include in agent body:
```markdown
Update your agent memory as you discover codepaths, patterns, and architectural
decisions. Write concise notes about what you found and where.
```

## Background vs Foreground

- **Foreground** (default): blocks main conversation; permission prompts pass through
- **Background**: runs concurrently; permissions pre-approved upfront; `AskUserQuestion` fails silently
- Press `Ctrl+B` to background a running foreground task
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` disables all background tasks

## Disable Specific Subagents

```json
// In settings.json:
{
  "permissions": {
    "deny": ["Agent(Explore)", "Agent(my-custom-agent)"]
  }
}
```

Or CLI: `claude --disallowedTools "Agent(Explore)"`

## Project Conventions (this repo)

Existing agents in `.claude/agents/`:
- `task-planner` (opus, blue) — breaks tasks into atomic steps; use during /implement planning phase
- `task-reviewer` (sonnet, red) — reviews code for bugs/simplicity/conventions; use during /implement review phase
