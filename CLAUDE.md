# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal Claude Code plugin marketplace — a collection of reusable skills and agents organized into installable plugins. There is no build system, no tests, and no compilation step. All content is Markdown and JSON.

## Repository Structure

```
.claude-plugin/marketplace.json          # Marketplace metadata and plugin registry
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json           # Plugin metadata (name, description, author)
    README.md
    skills/<skill-name>/SKILL.md         # Skill instructions (the main artifact)
    agents/<agent-name>.md               # Subagent definitions
```

When installed, skills land in `.claude/skills/` and agents in `.claude/agents/` inside the target project.

## Adding a New Plugin

1. Create `plugins/<plugin-name>/` with a `.claude-plugin/plugin.json` and `README.md`.
2. Register it in `.claude-plugin/marketplace.json` under the `"plugins"` array.
3. Add skills and/or agents inside the plugin directory.

## Skill Authoring

Consult `/skill-authoring-guide` for the complete reference. Key rules:

- **File:** `skills/<name>/SKILL.md` with YAML frontmatter + Markdown body.
- **Frontmatter fields:** `name`, `description`, `when_to_use`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`.
- `description` + `when_to_use` combined are truncated at **1,536 characters** — front-load the key use case.
- Keep SKILL.md under **500 lines**; move deep reference to supporting files (`reference.md`, `examples/`).
- Use `disable-model-invocation: true` for skills with side effects (push, deploy, create issue).
- Use `user-invocable: false` for internal reference skills Claude loads automatically.
- Dynamic context: `` !`command` `` inline or fenced ` ```! ``` ` blocks run at skill load time.
- Pre-approve tools in `allowed-tools` to avoid per-use prompts: `Bash(git *) Read Write Edit`.
- Write skill bodies in **EN-US**.

## Agent Authoring

- **File:** `agents/<name>.md` with YAML frontmatter.
- Required fields: `name` (lowercase + hyphens), `description`.
- Optional: `tools` (allowlist), `disallowedTools` (denylist), `model`, `color`, `permissionMode`.
- Omit `tools` to inherit all tools from the session.

## Invocation Control Reference

| Frontmatter | User can invoke | Claude can invoke | Description in context |
|---|---|---|---|
| (default) | Yes | Yes | Always |
| `disable-model-invocation: true` | Yes | No | Never |
| `user-invocable: false` | Hidden | Yes | Always |

## Priority Order (on name conflict)

Enterprise > Personal > Project > Plugin
