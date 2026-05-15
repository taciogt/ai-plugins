---
name: task-refinement
description: >
  Pre-planning ambiguity check invoked by /implement and /plan-issue before
  codebase exploration begins. Detects vague descriptions, broad-verb scope,
  issues missing acceptance criteria, and tasks requiring new tech/patterns
  not established in the project. Interviews the user to resolve each signal,
  then returns a refined spec. Prevents the AI from making architectural
  decisions autonomously.
user-invocable: false
allowed-tools:
  - Bash(gh *)
  - Read
---

# Task Refinement

You are invoked by `/implement` or `/plan-issue` before planning begins. Your job is to detect ambiguity, interview the user to resolve it, and return a refined task spec.

**Inputs (from calling skill):**
- `$ARGUMENTS` — original task description or issue number
- `$SIGNALS` — (optional) additional signals from calling skill after Explore, e.g. `signal5:no caching pattern found in codebase`

---

## Step 1 — Cheap Signal Detection

Check signals 1, 3, 4 from `$ARGUMENTS` alone (no codebase access needed):

**Signal 1 — Vague description**
Triggers if: description is under ~15 words AND contains none of: file paths, acceptance criteria, or an explicit "what done looks like" clause.
- Triggers: `"add caching to the API"`, `"fix the login bug"`
- Does not trigger: `"add DELETE /users/:id endpoint that soft-deletes the record and returns 204"`

**Signal 3 — Multiple valid interpretations**
Triggers if: the leading verb is broad (`improve`, `refactor`, `update`, `add`, `fix`, `change`, `migrate`) with no scope qualifier specifying what, where, or how.
- Triggers: `"refactor the auth module"`, `"improve performance"`
- Does not trigger: `"refactor auth token validation into a separate middleware function"`

**Signal 4 — Issue missing acceptance criteria**
Triggers if: `$ARGUMENTS` is an issue number (digits only, or `#N` format).
Action — fetch the issue body:
```bash
gh issue view $ARGUMENTS --json title,body --jq '{title: .title, body: .body}'
```
Triggers if: fetched body lacks a `## Acceptance Criteria` section OR contains no `- [ ]` checklist items.

**Signal 5 — New technology or pattern required**
Triggers if: `$SIGNALS` contains `signal5:*`. Use the text after `signal5:` as the context for the interview question.

---

## Step 2 — If No Signals Fire

Output: "Task is sufficiently specified. Proceeding to planning."

Return immediately. The calling skill continues without interruption.

---

## Step 3 — Present Signal Summary

If one or more signals fired, present a numbered summary before asking any questions:

```
Before planning, I found [N] point(s) that need clarification:

1. [Signal 1] The description is brief — it's unclear what "done" looks like.
2. [Signal 3] "[verb]" has multiple valid interpretations without a scope qualifier.
3. [Signal 4] The issue body lacks acceptance criteria or a verifiable checklist.
4. [Signal 5] This task would require [technology/pattern] which isn't established in the codebase yet.

I'll ask about each one.
```

---

## Step 4 — Interview Loop

For each detected signal, ask one focused question. Always include your recommended answer as a concrete suggestion.

**Signal 1 question template:**
> "What does success look like for this task? Which specific area is affected and what behavior changes?
> My suggestion: [derive a concrete completion criterion from the description]"

**Signal 3 question template:**
> "What kind of [verb] are we doing? For example: extract a helper, rename, split into modules, or change the public interface?
> My suggestion: [pick the most conservative interpretation that matches the description]"

**Signal 4 question template:**
> "The issue has no verifiable acceptance criteria. Can you define 2–3 concrete outcomes that, when checked off, confirm the task is done?
> My suggestion: [derive criteria from the issue title and body]"

**Signal 5 question template:**
> "This task needs [technology/pattern] which isn't in the project yet. Before we choose an approach, here are the options:
> - Option A: [workaround using existing project patterns — prefer this]
> - Option B: [introduce new dependency — only if A is clearly insufficient]
> Which should we use, and why?"

After all signal questions are answered, ask once:
> "Is there anything else to clarify before we build the plan? (Type a clarification or 'proceed' to continue.)"

---

## Step 5 — Compile Refined Spec

Consolidate all answers into a structured refined spec:

```
**Task:** [original title or issue title]
**Goal:** [1–2 sentences incorporating Signal 1/3 answers]
**Acceptance Criteria:**
- [ ] [concrete criterion 1 — from Signal 4 answer or derived from interview]
- [ ] [concrete criterion 2]
**Constraints / Approach:** [from Signal 5 answer — omit section if Signal 5 did not fire]
```

---

## Step 6 — Update GitHub Issue (if applicable)

Only if: `$ARGUMENTS` was an issue number AND Signal 4 fired.

Rewrite the issue body using `gh issue edit`, incorporating the refined spec. Preserve any existing `## Implementation Suggestion` section; update `## Context` and `## Acceptance Criteria` with the interview answers.

```bash
gh issue edit $ARGUMENTS --body "<full rewritten body>"
```

Confirm: "✓ Issue #$ARGUMENTS updated with refined acceptance criteria."

---

## Step 7 — Return Refined Spec

Output the full refined spec block from Step 5. The calling skill uses this as the effective task description for all subsequent phases.
