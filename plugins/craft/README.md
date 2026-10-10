# craft

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

### `/find-docs [library or question]`

Fetches current documentation for any library, framework, SDK, or CLI tool via the Context7 CLI. Two-step workflow: resolve library ID, then query docs. Use for API syntax, configuration options, version migration, and library-specific debugging.

### `/review-session`

Analyses the current session and produces a severity-rated report across 7 dimensions. Invoke after any non-trivial session to identify what to do better next time.

### `/context-audit [--days N] [--refresh] [--context <pasted /context output>]`

Audits what loads into every session (plugins, skills, MCP servers, CLAUDE.md, memory, subagent descriptions) against real usage in past transcripts across all projects, and proposes cuts ranked by tokens saved. Report-only: each finding carries the exact edit, nothing is changed. User-invoked only, so its own description costs nothing per session. Paste `/context all` output to get measured instead of estimated token figures; `--refresh` re-researches the best-practices reference (dated, cited) before auditing.

Dispatches four parallel agents (`context-usage-miner`, `context-mcp-analyst` on Haiku; `context-skills-analyst`, `context-docs-analyst` on Sonnet) and synthesizes in the main session. `context-research` runs only on `--refresh`.
