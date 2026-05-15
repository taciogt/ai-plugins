---
name: review-session
description: Analyses the current session and produces a structured report of improvement opportunities — skills that should have been used, subagent delegation decisions, rework patterns, planning failures, context bloat, and missed parallelisation. Use after any non-trivial session to identify what could be done better next time.
when_to_use: After any non-trivial session to identify improvement opportunities for future sessions.
user-invocable: true
allowed-tools:
  - Read
  - Glob
---

# Session Review

Analyse the current Claude Code session and produce a structured, read-only report of improvement opportunities. Cover all seven dimensions below. Each finding carries a severity badge: `[High]`, `[Medium]`, or `[Low]`, reflecting the impact the issue had (or would have had) on session quality.

**This skill is strictly read-only.** Only `Read` and `Glob` are permitted. If you find yourself about to call any other tool, stop immediately and do not proceed.

---

## Dimension 1 — Skills: Missed Invocations

Compare the list of available skills (from the session's system context) against the tasks performed. For each skill whose `description` / `when_to_use` conditions were clearly met but the skill was never invoked, flag it.

For each missed invocation:
- Quote the skill's trigger condition
- Describe what happened instead (manual steps, improvised approach)
- Rate impact: `[High]` if the skill would have materially changed the outcome or saved significant work, `[Medium]` if it would have improved quality or consistency, `[Low]` if it was a minor convenience

## Dimension 2 — Subagent Decisions

Evaluate every `Agent` tool call across three sub-checks:

**a) Model fit** — Was the model (`haiku` / `sonnet` / `opus`) appropriate?
- Flag `haiku` on multi-step reasoning tasks (`[High]`); flag `opus` on trivial lookups (`[Medium]`)

**b) Unnecessary delegation** — Did spawning a subagent add overhead without a clear quality or resource benefit? Flag cases where a direct tool call would have been simpler and equally effective.

**c) Missed delegation** — Were there task segments that would have benefited from subagent delegation (quality, context isolation, parallelism) but were handled inline instead?

## Dimension 3 — Rework Patterns

Detect correction loops: Claude produced output → user gave corrective feedback → Claude redid the work. Pure debugging cycles (test fails, Claude fixes it) are **not** flagged.

For each rework loop:
- Describe what was produced and what correction triggered the redo
- Classify the likely root cause: missing context, ambiguous requirement, wrong skill, absent planning step, etc.
- Suggest the specific instruction or context that would have prevented it

## Dimension 4 — Planning Gate Violations

Detect cases where structural decisions were made mid-session that should have been front-loaded:
- Implementation started before requirements were fully clarified
- Code was written before key files were read
- Architectural choices were made without checking existing patterns
- A skill with a planning phase was skipped in favour of diving straight into execution

## Dimension 5 — Context Bloat

Flag signals that the session accumulated unhealthy context:
- The same mistake was corrected two or more times (context pollution by failed approaches)
- A `/clear` or fresh session would likely have performed better than the accumulated conversation
- Relevant context (files, specs, patterns) was loaded late in the session instead of up front

## Dimension 6 — Missed Parallelisation

Identify sequences of independent tool calls made sequentially that could have run in parallel:
- Multiple `Read` calls with no dependency between them
- Multiple `Bash` calls that don't share state
- Multiple `Agent` spawns that are logically independent

Rate by how many round-trips were wasted.

## Dimension 7 — Other Observations

Surface any other noteworthy pattern not covered above. Low bar for inclusion. Examples: redundant tool calls, over-verbose responses where a terse answer sufficed, missed opportunities to use `!` dynamic context injection, instructions in CLAUDE.md that were not followed.

---

## Report Format

Produce the report in this exact structure:

```
## Session Review

### 1. Skills — Missed Invocations
- [High] ...

### 2. Subagent Decisions
- [Medium] ...

### 3. Rework Patterns
- [High] ...

### 4. Planning Gate Violations
- [Medium] ...

### 5. Context Bloat
- [Low] No findings.

### 6. Missed Parallelisation
- [Medium] ...

### 7. Other Observations
- [Low] ...

---

## Summary

| Severity | Count |
|----------|-------|
| High     | N     |
| Medium   | N     |
| Low      | N     |

**Overall verdict:** one sentence on the session's main quality failure and its root cause.
```

If a dimension has no findings, output: `- No findings.`
