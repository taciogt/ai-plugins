# Report format

Rank findings by estimated tokens saved, highest first. Every finding carries evidence and an exact edit the user can apply.

```
# Context audit: <project> (<date>)

**Budget:** <used> / <window> tokens loaded at session start (<measured | estimated ~chars/4>); <free> free.
**Evidence window:** <N> days, <files> transcripts across <P> projects. Coverage: <full | partial: reason>.

## Top savings
| # | Action | Target | Evidence | ~Tokens saved | Risk |
|---|---|---|---|---|---|
| 1 | Disable plugin | `foo@market` | 0 uses in 30d, 8 skills listed | ~900 | low |

## Findings by dimension
### Plugins / Skills / MCP / Instruction files / Other sources
For each finding:
- **Action** and **target**
- **Evidence**: counts, window, file path and size
- **Edit**: the exact settings key, frontmatter line or CLAUDE.md line range to change, as a snippet
- **Risk**: low (reversible, unused) | medium (used rarely or only via slash) | high (used, or hook-only/unverifiable)

## Kept on purpose
Items checked and left alone, one line each with the reason (used weekly, needed always, cannot be measured).

## Not measurable here
Items whose cost needs `/context all` or whose use leaves no transcript trace.
```

Rules:
- Token figures are `~` estimates (chars/4) unless the user supplied `/context` output; say which, once, in the Budget line.
- "Unused" always names the window and coverage.
- One finding per target; merge duplicates across analysts.
- Edits target the narrowest scope: prefer `.claude/settings.local.json` over user settings when only this project should change.
