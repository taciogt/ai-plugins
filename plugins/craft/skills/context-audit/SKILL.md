---
name: context-audit
description: Audit what loads into every Claude Code session (plugins, skills, MCP servers, CLAUDE.md, memory, subagent descriptions) against real usage in past transcripts, and propose cuts ranked by tokens saved. Report-only; edits nothing.
argument-hint: "[--days N] [--refresh] [--context <pasted /context output or path>]"
disable-model-invocation: true
allowed-tools:
  - Agent
  - Read
  - Write
  - Bash(bash *inventory.sh*)
---

# Context Audit

Find what sits in the window before the first prompt, check it against what actually got used, and propose cuts so more of the window stays free for real work. The audit is **report-only**: every finding carries the exact edit, and applying it is a separate request from the user.

Arguments: `$ARGUMENTS`
- `--days N`: transcript window, default 30.
- `--refresh`: re-research best practices first (Step 1).
- `--context`: pasted `/context all` output (or a file path to it); upgrades estimates to measured tokens.

## Inventory (runs at load)

```!
bash ${CLAUDE_SKILL_DIR}/scripts/inventory.sh
```

If `--days` is not 30, rerun `bash ${CLAUDE_SKILL_DIR}/scripts/inventory.sh "$PWD" <N>`; only the transcript count changes.

---

## Step 1 — Refresh (only with `--refresh`)

Launch the `context-research` agent with the source path `${CLAUDE_SKILL_DIR}/references/best-practices.md` and a scratchpad output path. Installed skills live in a plugin cache that updates overwrite, so the refreshed file goes to the scratchpad; tell the user to copy it into `plugins/craft/skills/context-audit/references/` in the ai-plugins repo to keep it. Use the refreshed copy for Step 3 of this run. Without `--refresh`, read the research date at the top of the reference file; if it is older than 90 days, tell the user once and continue.

## Step 2 — Dispatch four analysts in parallel

Launch all four in one message. Pass each: the inventory above, the project path, the window in days, the pasted `/context` output if supplied, and `${CLAUDE_SKILL_DIR}` so it can read the references.

| Agent | Dimension |
|---|---|
| `context-usage-miner` | what was actually used: skills (model vs slash), MCP servers, subagent types, across all projects |
| `context-mcp-analyst` | MCP servers: source, loading mode, cost class, overlap, CLI alternatives |
| `context-skills-analyst` | plugin/skill/subagent descriptions, duplicates, guarded candidates, plugin hooks, output style |
| `context-docs-analyst` | CLAUDE.md, rules, MEMORY.md, imports: no-ops, derivable, duplicate, stale, misplaced lines |

Each returns compact JSON. Analysts report cost and structure; **you** make the usage judgments in Step 3.

## Step 3 — Synthesize

Join the usage table against the inventory and analyst findings by name, then apply these rules:

1. **Stale plugin**: listed in the inventory's STALE section (installed or enabled, but its marketplace no longer lists it, e.g. after a rename). It loads nothing and fails at reload; propose removing the `enabledPlugins` key and uninstalling it.
2. **Unused plugin**: no skill, subagent or MCP tool of the plugin appears in the window, in any project. A plugin that ships hooks leaves no trace; mark it `unverifiable`, never unused.
3. **Unused skill/MCP server**: zero model and zero slash invocations in the window. A tool installed fewer days ago than the window, or a window with partial coverage, lowers confidence to `low`.
4. **Loaded or not**: the pasted `/context` Skills and MCP tables are the authority on what loads. Without them, disk lists are candidates only; built-in skills and account-level connectors are invisible to disk and go under "Not measurable here".
5. **Guarded candidate by usage**: model count 0 and slash count above 0 means the model never reached for it; recommend `disable-model-invocation: true`. Combine with the analyst's side-effect flag for risk.
6. **Cost ranking**: rank by tokens loaded at session start. A deferred MCP schema costs names and instructions only; rank it by that, and by schema size only where tool search is off.
7. **Ownership**: skills inside a plugin cannot be trimmed with `skillOverrides`; the edit is "disable the plugin" or an upstream request, and the report says so.
8. **Scope**: put each edit in the narrowest layer that fixes this project (`.claude/settings.local.json` before user settings).
9. **Merge duplicates** across analysts into one finding per target.
10. **Measured vs estimated**: figures are `~chars/4` unless `/context` output was supplied. Say which once, in the report's Budget line.

Risk: **low** = unused or duplicate, reversible; **medium** = used rarely or slash-only; **high** = used in the window, or unverifiable.

## Step 4 — Report

Follow [references/report-format.md](references/report-format.md). Show it in chat and save the same Markdown to the session scratchpad directory as `context-audit-<YYYY-MM-DD>.md` (fall back to `${TMPDIR:-/tmp}/context-audit/`). Name the saved path in the last line.

Close with a short **Beyond the audit** list of the session-hygiene levers that apply (section 5 of [references/best-practices.md](references/best-practices.md)): clearing between unrelated tasks, delegating noisy work to subagents. Keep it to what the findings suggest.

## Completion

Done when every analyst's output is accounted for as a finding, a "Kept on purpose" line, or a "Not measurable here" line, and the report states its evidence window and coverage.

## References
- [references/best-practices.md](references/best-practices.md): dated, cited levers per source and evidence caveats
- [references/transcript-signals.md](references/transcript-signals.md): usage-mining one-liners and how to read them
- [references/report-format.md](references/report-format.md): exact report structure
