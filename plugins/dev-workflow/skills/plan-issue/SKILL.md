---
name: plan-issue
description: Use this skill when the user asks to "create an issue", "plan a task", "open a GitHub issue", "/plan-issue", "/plan", or wants to plan a feature and register it as a GitHub issue in the project repository.
disable-model-invocation: true
---

# Plan and Create a GitHub Issue

**IMPORTANT: This skill does NOT modify any code files.** The only expected output is the creation of an issue in the project's GitHub repository. No files outside the planning context should be created, edited, or removed.

You will plan a development task and register it as a GitHub issue with a title, context, and detailed implementation suggestion.

**Task:** $ARGUMENTS

---

## Phase 0 — Detect Repository

Before any planning, detect the current repository:

```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

Store the result as `$REPO` (format: `owner/repo`). Use `$REPO` in all subsequent `gh` commands.

If the command fails (no GitHub remote configured), inform the user and stop.

---

## Phase 0.5 — Task Refinement

Before launching `task-planner`, invoke the `task-refinement` skill with `$ARGUMENTS`.

- If it returns "Task is sufficiently specified", proceed immediately to Phase 1.
- If it runs an interview, use the refined spec it outputs as the effective task description for Phase 1 (pass the refined spec to `task-planner` instead of the original `$ARGUMENTS`).

**Signal 5 check — after task-planner returns:**
Review the plan for Signal 5: does it introduce a technology, library, or architectural pattern not currently in the codebase? If yes, invoke `task-refinement` with `$ARGUMENTS signal5:<finding>` before presenting the plan to the user.

---

## Phase 1 — Planning

**Goal:** Understand the task and produce an atomic, detailed implementation plan.

**Actions:**
1. Launch the `task-planner` agent with the full task description: "$ARGUMENTS"
   - Instruct the agent to explore the codebase, identify affected files, and produce atomic, testable steps
   - Ask it to include: task understanding, affected files, steps with validation criteria and commit type

2. Read all key files identified by the agent to validate the plan

3. Present the plan to the user:
   - Summary of understanding
   - Atomic steps with validation criteria
   - Affected files
   - Risks and considerations

4. **Ask the user if they want to adjust the plan** before creating the issue. If adjustments are requested, revise and re-present.

---

## Phase 2 — Issue Composition

**Goal:** Format the approved plan as a readable, actionable GitHub issue body.

**Actions:**
1. Using the approved plan, assemble the issue body in markdown following the structure below.
2. Derive a concise issue title from the task description (maximum 72 characters, in English).

**Issue body structure:**

```markdown
## Context

[2-3 sentences explaining the problem or need this task addresses, and the expected outcome]

## Acceptance Criteria

- [ ] [Verifiable criterion 1]
- [ ] [Verifiable criterion 2]
- [ ] [Verifiable criterion N — one per atomic plan step]

## Affected Files

- `path/to/file.ts` — [what changes]
- `path/to/new-file.ts` — [what it will contain]

## Implementation Suggestion

> This is a suggestion based on analysis of the current codebase. The approach may be adjusted during implementation.

**Step 1: [Step title]**
- What: [description of the change]
- Files: `file1.ts`, `file2.ts`
- Validation: [concrete criterion — e.g., tests pass, TypeScript compiles]
- Commit: `<type>(<scope>): <description>`

**Step 2: [Step title]**
...

## Risks and Considerations

- [Gotcha, external dependency, or relevant design decision]
```

3. Show the user the complete issue draft (title + body).
4. **Ask the user to approve the issue** or request changes before creating it on GitHub.

---

## Phase 3 — GitHub Creation

**DO NOT CREATE THE ISSUE WITHOUT USER APPROVAL.**

**Actions:**
1. Check if the `enhancement` label exists in the repository:
   ```bash
   gh label list --repo $REPO
   ```
   If it does not exist, create it: `gh label create enhancement --color 84b6eb --repo $REPO`

2. Create the issue:
   ```bash
   gh issue create \
     --repo $REPO \
     --title "<approved title>" \
     --body "<approved body>" \
     --label enhancement
   ```

3. Display to the user:
   - URL of the created issue
   - Issue number (e.g. `#42`)
   - Suggestion: "To implement this issue, use `/implement <description>`. It will automatically create a feature branch and open a PR against `main` referencing this issue."

---

## General Rules

- **Never create the issue without explicit approval** of both the plan and the draft
- **The title must be in English** and concise (≤ 72 characters)
- **Never invent implementation details** — base everything on what `task-planner` found in the codebase
- If the task is ambiguous, ask the user before launching `task-planner`
