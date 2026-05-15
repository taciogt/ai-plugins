---
name: skill-authoring-guide
description: >
  Internal reference for creating and editing Claude Code skills, subagents,
  and hooks in this project. Covers all frontmatter fields, lifecycle,
  string substitutions, dynamic context injection, invocation control,
  hooks, and authoring best practices.
when_to_use: >
  Consult when asked to: "create a skill", "edit a skill", "build a
  slash-command", "add a skill", "create an agent", "add an agent",
  "create a hook", "improve a skill", "authoring guide", "skill structure",
  "subagent frontmatter", "hook events".
user-invocable: false
---

## 1. Skill Anatomy

```
.claude/skills/<skill-name>/
├── SKILL.md          # required — main instructions
├── reference.md      # optional — deep-dive reference loaded on demand
├── examples/         # optional — example outputs
└── scripts/          # optional — helper scripts
```

**Project convention**: always place skills in `.claude/skills/` (project-level, committed to version control). Personal skills (`~/.claude/skills/`) are not part of the project — note that Claude Code's skill resolution technically gives Personal higher priority than Project, so avoid creating personal skills with the same name as project skills.

Global priority order (highest wins on name conflict): Enterprise > Personal > Project > Plugin

## 2. Skill Frontmatter Quick Reference

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | No | directory name | Slash-command name. Lowercase, numbers, hyphens, max 64 chars |
| `description` | Recommended | first paragraph | When Claude uses this skill. Front-load key use case. Combined with `when_to_use`, capped at 1,536 chars |
| `when_to_use` | No | — | Extra trigger phrases. Appended to `description` in the listing |
| `argument-hint` | No | — | Autocomplete hint e.g. `[issue-number]` or `[file] [format]` |
| `disable-model-invocation` | No | false | `true` = only user can invoke (removed from Claude's context entirely) |
| `user-invocable` | No | true | `false` = hidden from `/` menu; Claude can still load it automatically |
| `allowed-tools` | No | — | Tools pre-approved while skill is active. Space-separated string or YAML list e.g. `Bash(git *) Read` |
| `model` | No | session model | Model override while skill is active |
| `effort` | No | session effort | `low \| medium \| high \| xhigh \| max` |
| `context` | No | — | `fork` = run skill in an isolated subagent context |
| `agent` | No | general-purpose | Subagent type to use when `context: fork` is set |
| `hooks` | No | — | Lifecycle hooks scoped to this skill. See reference-hooks.md |
| `paths` | No | — | Glob patterns; skill auto-activates only when working with matching files |
| `shell` | No | bash | `bash` or `powershell` for `` !`command` `` blocks |

## 3. String Substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | Full argument string passed after the skill name |
| `$ARGUMENTS[N]` | Argument by 0-based index |
| `$0`, `$1`, ... | Shorthand for `$ARGUMENTS[0]`, `$ARGUMENTS[1]`, ... |
| `${CLAUDE_SKILL_DIR}` | Absolute path to the skill's directory |
| `${CLAUDE_SESSION_ID}` | Current session ID |

Multi-word args need quotes: `/skill "hello world" second` → `$0` = `hello world`, `$1` = `second`

## 4. Dynamic Context Injection

Inline form: `` !`command` `` — runs shell command at skill load time; output replaces placeholder.

Fenced form:
````
```!
node --version
git status --short
```
````

This is preprocessing — Claude only sees the final rendered output, not the command.
Disable with `"disableSkillShellExecution": true` in settings.

## 5. Skill Content Lifecycle

- **Description** (`description` + `when_to_use`): Always in Claude's context (up to 1,536 chars per skill).
- **Full body**: Loaded only when skill is invoked (by user or Claude).
- **After invocation**: Content stays in conversation for the rest of the session. Claude Code does NOT re-read the file on later turns.
- **Compaction**: After compaction, the most recent invocation of each skill is re-attached (up to 5,000 tokens per skill, 25,000 combined budget).
- **`disable-model-invocation: true`**: Description is NOT loaded into context at all.

## 6. Invocation Control

| Frontmatter | User can invoke | Claude can invoke | Description in context |
|-------------|-----------------|-------------------|-----------------------|
| (default) | Yes | Yes | Always |
| `disable-model-invocation: true` | Yes | No | Never |
| `user-invocable: false` | Hidden | Yes | Always |

Note: `user-invocable: false` only hides the skill from the `/` menu — users can still type `/skill-name` directly. Use `disable-model-invocation: true` to block Claude from invoking programmatically.

## 7. Running a Skill in a Subagent (`context: fork`)

```yaml
context: fork
agent: Explore   # or Plan, general-purpose, or any custom agent name
```

The skill content becomes the subagent's prompt. It runs in isolation without access to conversation history. Only works for skills with explicit task instructions, not pure reference/guidelines content.

## 8. Subagents

File location: `.claude/agents/<name>.md` (project-level — commit to version control)

- **Required**: `name` (lowercase + hyphens) and `description`
- **Tool control**: `tools` (allowlist) or `disallowedTools` (denylist); omit to inherit all
- **Common fields**: `model`, `permissionMode`, `isolation`, `color`, `memory`, `skills`, `hooks`, `maxTurns`
- **Built-in agents**: `Explore` (Haiku, read-only), `Plan` (inherits, read-only), `general-purpose` (inherits, all tools)

Invocation patterns:
- Natural language: "Use the code-reviewer agent to..."
- @-mention: `@"code-reviewer (agent)"` guarantees invocation
- CLI: `claude --agent code-reviewer`
- Skill delegation: `context: fork` + `agent: <name>`

Full field reference with examples: [reference-subagents.md](reference-subagents.md)

## 9. Hooks Quick Reference

Full reference: [reference-hooks.md](reference-hooks.md)

Key events:

| Event | Cadence | Use for |
|-------|---------|---------|
| `PreToolUse` | Per tool call | Block/allow/modify tool calls |
| `PostToolUse` | Per tool call | Validate output, run formatters |
| `SessionStart` | Once | Load env, setup |
| `Stop` | Per turn | Validate before Claude stops |
| `UserPromptSubmit` | Per turn | Add context to prompts |

Handler types: `command` (shell), `http` (webhook), `prompt` (Claude evaluates), `agent` (subagent verifies)

Hooks in frontmatter format:
```yaml
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate.sh"
```

## 10. Decision Guide: Skill vs Subagent vs Hook

| Need | Use |
|------|-----|
| Reusable playbook / checklist that runs in main context | **Skill** |
| Reference knowledge Claude applies inline | **Skill** (`user-invocable: false`) |
| Task with side effects you control timing of | **Skill** (`disable-model-invocation: true`) |
| Task that produces verbose output (keep out of main context) | **Subagent** |
| Specialized tool restrictions or separate permissions | **Subagent** |
| Parallel independent work | **Subagent** (parallel) |
| Enforce behavior deterministically (block/allow tools) | **Hook** |
| Automate on every file edit | **Hook** (PostToolUse) |
| Validate before tool executes | **Hook** (PreToolUse) |
| Load env vars at session start | **Hook** (SessionStart) |

## 11. Authoring Best Practices

- **Description cap**: `description` + `when_to_use` combined are truncated at **1,536 characters** in the skill listing. Front-load the key use case.
- **SKILL.md size**: Keep under **500 lines**. Move detailed reference to supporting files (reference.md, examples/).
- **Supporting files**: Reference them from SKILL.md so Claude knows when to load them.
- **`allowed-tools`**: Pre-approve tools to avoid per-use permission prompts. Syntax: `Bash(git add *) Bash(git commit *) Read`.
- **Testing a skill**: (1) Ask something matching the description → Claude should auto-load it. (2) Invoke directly with `/skill-name`. (3) Check `What skills are available?` to verify it appears.
- **`disable-model-invocation: true`** for skills with side effects (deploy, send message, push code).
- **`user-invocable: false`** for internal knowledge skills users shouldn't invoke directly.
- **Language**: Write all skill and agent bodies in **EN-US**. Existing skills in PT-BR will be migrated separately.
- **No multiple options**: Be decisive in instructions — pick one approach.

## Supporting Reference Files

- [reference-skills.md](reference-skills.md) — Full Skills documentation with examples and troubleshooting
- [reference-subagents.md](reference-subagents.md) — Full Subagents documentation with permission modes and memory
- [reference-hooks.md](reference-hooks.md) — Full Hooks documentation with all events, handlers, and output schemas
