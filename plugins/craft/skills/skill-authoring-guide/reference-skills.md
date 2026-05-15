# Skills — Full Reference

## Directory Structure

```
# Project skill (this project only):
.claude/skills/<name>/SKILL.md

# Personal skill (all projects):
~/.claude/skills/<name>/SKILL.md

# Supporting files (all optional):
<name>/
├── SKILL.md           # required
├── template.md        # template for Claude to fill in
├── examples/
│   └── sample.md      # example output
└── scripts/
    └── validate.sh    # executable script
```

Priority when names conflict: Enterprise > Personal > Project > Plugin

**Project convention**: always place skills in `.claude/skills/` (project-level). Personal definitions at `~/.claude/skills/` are not part of the project and — since Personal beats Project in resolution — can silently override project skills if given the same name.

## All 14 Frontmatter Fields with Examples

### `name`
```yaml
name: my-skill   # becomes /my-skill
```
Lowercase letters, numbers, hyphens only. Max 64 chars. Defaults to directory name.

### `description`
```yaml
description: Deploys the application. Use when the user says "deploy", "ship", or "release".
```
Front-load the key use case. Combined with `when_to_use`, truncated at 1,536 chars.

### `when_to_use`
```yaml
when_to_use: "push to production", "go live", "release a build"
```
Additional trigger phrases appended to `description` in the listing.

### `argument-hint`
```yaml
argument-hint: "[issue-number]"
# or
argument-hint: "[filename] [format]"
```
Shown in autocomplete when user types `/skill-name`.

### `disable-model-invocation`
```yaml
disable-model-invocation: true
```
Prevents Claude from auto-loading. Use for skills with side effects (deploy, commit, send message). Description NOT loaded into context.

### `user-invocable`
```yaml
user-invocable: false
```
Hides from `/` menu. Description still loaded into Claude's context so it can auto-invoke. Use for internal reference/knowledge skills.

### `allowed-tools`
```yaml
# Space-separated string:
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *) Read

# YAML list:
allowed-tools:
  - Bash(git *)
  - Read
  - Grep
```
Grants these tools without per-use prompts while skill is active. Does NOT restrict other tools — use permission deny rules for that.

### `model`
```yaml
model: haiku    # or sonnet, opus, or full model ID
```

### `effort`
```yaml
effort: high    # low | medium | high | xhigh | max
```
Overrides session effort level while skill is active.

### `context`
```yaml
context: fork
```
Runs the skill in an isolated subagent. Skill content becomes the subagent prompt. No access to conversation history. Only useful for skills with explicit task instructions.

### `agent`
```yaml
agent: Explore    # or Plan, general-purpose, or any .claude/agents/<name>.md
```
Only relevant when `context: fork` is set. Specifies which subagent handles execution.

### `hooks`
```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-cmd.sh"
          timeout: 30
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/format.sh"
```
Hooks scoped to this skill's lifetime. Cleaned up when skill session ends.

### `paths`
```yaml
paths: "src/api/**/*.ts, src/routes/**/*.ts"
# or YAML list:
paths:
  - "src/api/**/*.ts"
  - "src/routes/**/*.ts"
```
Skill auto-activates only when Claude is working with files matching these patterns. Same format as path-specific CLAUDE.md rules.

### `shell`
```yaml
shell: bash        # default
shell: powershell  # Windows only, requires CLAUDE_CODE_USE_POWERSHELL_TOOL=1
```
Shell used for `` !`command` `` and ` ```! ` blocks.

## String Substitution Examples

```yaml
---
name: fix-issue
disable-model-invocation: true
---
Fix GitHub issue $ARGUMENTS following our coding standards.
```
`/fix-issue 123` → Claude receives "Fix GitHub issue 123 following our coding standards."

```yaml
---
name: migrate-component
---
Migrate the $0 component from $1 to $2.
```
`/migrate-component SearchBar React Vue` → $0=SearchBar, $1=React, $2=Vue

If skill has no `$ARGUMENTS` placeholder and user provides args, they're appended as `ARGUMENTS: <value>`.

## Dynamic Context Injection Examples

```yaml
---
name: pr-summary
context: fork
agent: Explore
---
## PR Context
- Diff: !`gh pr diff`
- Comments: !`gh pr view --comments`
- Files: !`gh pr diff --name-only`

Summarize this PR.
```

Multi-line injection:
````markdown
## Environment
```!
node --version
bun --version
git status --short
```
````

Commands run BEFORE Claude sees anything. Output replaces the placeholder.

## Lifecycle Details

1. At session start: all skill descriptions loaded into context (up to 1,536 chars each)
2. On invocation: full SKILL.md content entered as a message; stays for rest of session
3. Claude Code does NOT re-read the file on subsequent turns
4. After compaction: most recent invocation re-attached (first 5,000 tokens; 25,000 combined budget)
5. Supporting files: NOT auto-loaded; Claude must explicitly read them when needed

## Skill Invocation Control Table

| `disable-model-invocation` | `user-invocable` | User | Claude | In context |
|---------------------------|------------------|------|--------|------------|
| false (default) | true (default) | `/name` | Auto | Always |
| true | true (default) | `/name` | Never | Never |
| false (default) | false | Hidden | Auto | Always |

## Supporting Files Pattern

```markdown
# SKILL.md — keep focused (overview + navigation)

## Additional Resources
- Full API details: [reference.md](reference.md) — load when user asks about specific fields
- Examples: [examples.md](examples.md) — load to show expected output format
- Validation script: scripts/validate.sh — run with `bash ${CLAUDE_SKILL_DIR}/scripts/validate.sh`
```

## Troubleshooting

**Skill not triggering automatically:**
1. Check description includes keywords users naturally say
2. Verify it appears in `What skills are available?`
3. Try `/skill-name` for direct invocation
4. Check `user-invocable` is not `false` if you need the skill visible in the `/` autocomplete menu — note that typing `/skill-name` directly still works regardless of this field

**Skill triggers too often:**
1. Make description more specific
2. Add `disable-model-invocation: true` for manual-only invocation

**Description cut short in listing:**
- Combined `description` + `when_to_use` capped at 1,536 chars
- Front-load the key use case in `description`
- Raise limit: set `SLASH_COMMAND_TOOL_CHAR_BUDGET` env var

**Skill stops influencing behavior after first response:**
- Content is still present; model is choosing other approaches
- Strengthen description and instructions
- Use hooks for deterministic enforcement
- Re-invoke after compaction if needed
