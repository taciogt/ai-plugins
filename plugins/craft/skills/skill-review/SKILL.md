---
name: skill-review
description: Evaluates how well a named skill was executed in the current session. Checks whether the skill was triggered correctly, whether each phase and required gate was followed, and whether the outcome matched the skill's stated goals. Use proactively at the end of any session where a named skill was invoked — invoke automatically without being asked if a major skill session just completed.
argument-hint: "[skill-name]"
allowed-tools:
  - Read
  - Glob
---

# Skill Performance Review — `$ARGUMENTS`

You are reviewing how well the **`$ARGUMENTS`** skill was executed during this session.

## Skill Definition (injected at invocation time)

```
!`cat ".claude/skills/$ARGUMENTS/SKILL.md" 2>/dev/null || echo "ERROR: skill '$ARGUMENTS' not found at .claude/skills/$ARGUMENTS/SKILL.md — check the skill name and try again"`
```

---

## Review Instructions

Using the skill definition above and the full conversation history in your context, produce a structured report covering the five dimensions below. Be specific: quote the relevant skill instruction alongside what actually happened. Avoid vague assessments — every finding should cite evidence from the conversation or the skill file.

---

### 1. Trigger Accuracy

- When and how was the skill invoked? (user command, auto-invocation, or mid-session)
- Did the trigger conditions described in `description` / `when_to_use` apply?
- Was it invoked at the right moment, or too early / too late / unnecessarily?

**Verdict:** Correct trigger / Premature / Missed / Unnecessary

---

### 2. Phase & Step Adherence

For each phase or major section defined in the skill, assess whether it was followed, abbreviated, or skipped. Use this table format:

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 — ... | ✓ Followed / ⚠ Abbreviated / ✗ Skipped | what happened vs. what was prescribed |
| Phase 1 — ... | ... | ... |
| ... | | |

Flag any steps that were executed out of order or merged when the skill required them to be separate.

---

### 3. Required Gate Compliance

Identify every instruction in the skill that says "do not proceed without X", "wait for user approval", "never X without confirmation", or similar hard stops. For each:

- Was the gate honored?
- If skipped or abbreviated, what was the effect?

---

### 4. Outcome Assessment

Compare the session's actual result to the skill's stated goal (found in the description or final phase):

- Was the goal achieved?
- Were any deliverables missing (e.g. PR not opened, CI not verified, branch not created)?
- Did the user explicitly confirm satisfaction, or were there signs of friction?

**Verdict:** Goal achieved / Partially achieved / Not achieved

---

### 5. Deviation Inventory

List every specific instance where execution diverged from the skill's instructions. For each deviation:

| # | Skill instruction (quoted) | What actually happened | Impact |
|---|---------------------------|------------------------|--------|
| 1 | "..." | ... | Low / Medium / High |

If there were no deviations, state that explicitly.

---

### 6. Improvement Signals

Based on the deviations and friction points observed, suggest specific changes to the skill. Only flag issues that are the **skill's fault** (ambiguous instruction, missing edge case, wrong routing, absent option) — not execution errors that were correctly handled.

For each suggestion:
- Quote the problematic instruction (or note its absence)
- Describe the issue (ambiguous / missing / wrong default)
- Propose a concrete fix (one sentence)

---

### Summary

| Dimension | Rating | Key finding |
|-----------|--------|-------------|
| Trigger accuracy | ✓ / ⚠ / ✗ | |
| Phase adherence | ✓ / ⚠ / ✗ | |
| Gate compliance | ✓ / ⚠ / ✗ | |
| Outcome | ✓ / ⚠ / ✗ | |
| Skill quality | ✓ / ⚠ / ✗ | (based on improvement signals) |

**Overall verdict:** one sentence on whether the skill performed as designed and whether it needs updates.
