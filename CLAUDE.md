# CLAUDE.md

Personal Claude Code plugin marketplace of skills and agents. Markdown and JSON only, no build or tests.

## Agent skills

### Issue tracker

Issues, specs, and wayfinder maps live as **GitHub issues** in `taciogt/ai-plugins`, via the `gh` CLI. Conventions (wayfinder operations, frontier-query recipe) are in `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Adding a New Plugin

Create `plugins/<plugin-name>/` with `.claude-plugin/plugin.json`, `README.md`, and `skills/<name>/SKILL.md` and/or `agents/<name>.md`. Register it in `.claude-plugin/marketplace.json` under the `"plugins"` array.

## Authoring

Consult `/skill-authoring-guide` for skills, agents and hooks. Write skill bodies in **EN-US**.
