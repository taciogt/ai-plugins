# claude-productivity

Tools for building and improving Claude Code workflows.

## Skills

### `/skill-review [skill-name]`

Audits how well a named skill was executed in the current session. Reviews five dimensions: trigger accuracy, phase adherence, gate compliance, outcome, and improvement signals. Invoke proactively at the end of any session where a major skill ran.

### `skill-authoring-guide` (auto-loaded)

Complete reference for creating Claude Code skills, subagents, and hooks. Covers all frontmatter fields, lifecycle, string substitutions, dynamic context injection, invocation control, and best practices. Not user-invocable — Claude loads it automatically when authoring skills.

Includes supporting reference files:
- `reference-skills.md` — full skills documentation with troubleshooting
- `reference-subagents.md` — full subagents documentation with permission modes
- `reference-hooks.md` — full hooks documentation with all events and handler types

### `/context-engineering`

Best practices for curating agent context: the context hierarchy (rules → specs → source → errors → history), context packing strategies, confusion management patterns, and anti-patterns to avoid.

### `/find-docs [library or question]`

Fetches current documentation for any library, framework, SDK, or CLI tool via the Context7 CLI. Two-step workflow: resolve library ID, then query docs. Use for API syntax, configuration options, version migration, and library-specific debugging.
