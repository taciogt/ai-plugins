# Context slimming: best practices

Researched 2026-10-10 against Claude Code 2.1.x docs. Re-run with `--refresh` when the date is older than ~90 days or after a major Claude Code release.
Base URL for docs: `https://code.claude.com/docs/en/`. Confidence: **P** = primary (Anthropic docs/engineering), **L** = low (single or non-primary source).

## Contents
1. Where the cost is (rank by this)
2. Levers per source (exact settings)
3. Evidence caveats
4. Built-in tools to lean on
5. Session hygiene (advice, not audit items)

## 1. Where the cost is

Rank findings by tokens that sit in the window *before the first prompt*, not by tokens that merely exist on disk.

| Source | Loaded when | Notes |
|---|---|---|
| System prompt, built-in tools | always | not controllable; ~4K illustrative (context-window page, P) |
| CLAUDE.md hierarchy, unscoped `.claude/rules` | launch | `@imports` expand at launch and save nothing (memory, P) |
| MEMORY.md index | launch | first 200 lines / 25KB only; topic files on demand (memory, P) |
| Skill listing | every turn | name + description + when_to_use, 1,536 chars each, 1% window budget total (skills, P) |
| Subagent descriptions | every turn | warning above 15,000 tokens combined (sub-agents, P) |
| MCP tool names + server instructions | every turn | schemas deferred by default via tool search; instructions cut at 2,048 chars (mcp, P) |
| Hook output | session start / per prompt | zero unless the hook prints; `additionalContext` capped 10,000 chars per field (hooks, P) |
| Output style | every request | Default style costs nothing (features-overview, P) |

Deferred MCP schemas do not occupy the window. Rank MCP findings by *loaded* cost (names, instructions, `alwaysLoad` servers), and by schema cost only when tool search is off (`ENABLE_TOOL_SEARCH=false`, or a non-first-party `ANTHROPIC_BASE_URL` proxy).

## 2. Levers per source

**Plugins** (settings-reference#enabledplugins, P)
- `enabledPlugins`: `{"name@marketplace": false}`. A project-enabled plugin is turned off for you in `.claude/settings.local.json`; project beats user.
- `claude plugin details <name>` prints projected always-on token cost (plugins/measure, P).
- Plugin skills are not affected by `skillOverrides`; disable the plugin or accept the cost.

**Skills** (skills, P)
- `disable-model-invocation: true` removes the description from context entirely; `user-invocable: false` does not.
- `skillOverrides` in settings: `on | name-only | user-invocable-only | off`, user/project skills only.
- `permissions.deny: ["Skill(name)"]` blocks a skill.
- Trim `description` + `when_to_use`: lead with the use case, cut restatements. Over 1,536 chars is silently truncated.
- `skillListingBudgetFraction` (default 0.01) raises or lowers the shared budget; on overflow, least-used descriptions drop first.
- Same skill from two sources (user dir + plugin + claude.ai sync) lists twice under different names; keep one.

**MCP** (mcp, costs, P)
- `/mcp` disable writes `disabledMcpServers` per project; covers user, plugin and claude.ai connectors.
- `disableClaudeAiConnectors: true` or `ENABLE_CLAUDEAI_MCP_SERVERS=false` drops all claude.ai connectors at once.
- Prefer a CLI (`gh`, `aws`, `gcloud`) over an MCP server when one exists: no per-tool listing (costs, P).
- Anthropic measured ~55K tokens for 58 tools before tool search, ~85% less with it (advanced-tool-use, 2025-11-24, P). Code-execution-with-MCP: 150K to 2K (2025-11-04, P).

**Instruction files** (memory, best-practices, costs, P)
- Under 200 lines per CLAUDE.md. Test per line: "would removing this cause a mistake?" If not, cut.
- Procedures used sometimes become skills (guarded if side-effecting); things that must always happen become hooks; path-specific guidance becomes `.claude/rules/*.md` with `paths:` frontmatter.
- Block-level HTML comments are stripped before injection: free maintainer notes.
- `claudeMdExcludes` skips unwanted files in monorepos; `/doctor` proposes trims.
- Cut what the environment already states (package.json scripts, directory layout, `--help`); cache only the unwritten convention, the reason, the gotcha.
- Memory: MEMORY.md one line per entry, detail in topic files; `autoMemoryEnabled: false` when unused.

**Subagents** (sub-agents, P)
- Keep `description` short; push detail into the body. `omitClaudeMd: true` skips CLAUDE.md for read-only helpers.
- `permissions.deny` can block a subagent type.

**Hooks / output styles / git** (hooks, output-styles, settings-reference, P)
- SessionStart or UserPromptSubmit hooks that print static text belong in CLAUDE.md or nowhere; per-prompt output is a per-turn cost.
- Non-default output style costs every request; `keep-coding-instructions` keeps the built-in instructions on top of it.
- `includeGitInstructions: false` drops built-in commit/PR instructions.

## 3. Evidence caveats

- Length vs adherence is contested. A 1,650-session study found file size had no detectable effect on adherence; within-session drift mattered most (arXiv 2605.10039, 2026-05-11, preprint, L). An ETH Zurich study found LLM-generated context files added >20% cost without helping (arXiv 2602.11988, 2026-02-12, secondary figures, L). Frame trims as token savings, with adherence as a possible bonus.
- "Models follow ~150-200 instructions" and "compliance falls to 20-60% by message 10": blog-only, no primary study (L). Do not cite.
- No measured data on triggering accuracy vs skill count exists. Say "overlapping descriptions risk misfires" (features-overview, P), not a number.
- Usage-based "never used" depends on transcript coverage; absence in 30 days is not proof of uselessness. State coverage in every report.

## 4. Built-in tools to lean on

| Tool | Gives | Use for |
|---|---|---|
| `/context all` | measured tokens per category and MCP tool | exact numbers (ask user to paste) |
| `/doctor` | skill listing cost, biggest contributors, CLAUDE.md trims | cross-check |
| `/doctor prompt-audit [path]` (2.1.283+) | audits CLAUDE.md, rules, skills, subagents, output styles | cross-check |
| `/skill-doctor` | per-skill cost and usage | cross-check |
| `claude plugin details <name>` | per-plugin always-on cost | plugin ranking |

This skill's added value: usage across *all* projects and *both* invocation paths (model vs slash), joined with cost, ranked, with exact edits.

## 5. Session hygiene (advice section only)

- `/clear` between unrelated tasks: free. `/compact` reads the whole context: a large request (costs, P).
- No official "compact at N%" rule; practitioner thresholds are unverified (L).
- Delegate noisy work (test runs, doc fetches, log greps) to subagents: only a summary returns (costs, P).
- Persist rules that must survive compaction in CLAUDE.md; unscoped rules and root CLAUDE.md re-inject, nested ones and path-scoped rules do not (context-window, P).
