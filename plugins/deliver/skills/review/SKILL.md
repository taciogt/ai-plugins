---
name: review
description: Run a three-angle parallel code review on the current branch — bugs/security, simplicity/DRY, and project conventions. Use when you want a thorough review before pushing. Called internally by /implement after validation.
when_to_use: '"review this branch", "code review", "check my code before pushing", standalone review of any branch, called internally by /implement'
argument-hint: "[optional task description or focus area]"
allowed-tools:
  - Bash(git *)
  - Agent
---

# Code Review

Run three parallel reviewers across the current branch and consolidate findings.

**Current branch:** !`git branch --show-current`
**Commits:** !`git log origin/main..HEAD --oneline 2>/dev/null`

---

## Context

If `$ARGUMENTS` is provided, use it as the task focus in reviewer prompts.

If `$ARGUMENTS` is empty (standalone invocation), infer the focus from:
```bash
git log origin/main..HEAD --oneline
git diff origin/main..HEAD --name-only
```
Use the commit messages and changed files as the focus description passed to reviewers.

---

## Step 1 — Launch Reviewers

Launch **3 `task-reviewer` agents in parallel**:
- Agent A: "Review for bugs, logic errors, and security vulnerabilities. Focus on: $ARGUMENTS"
- Agent B: "Review for simplicity, DRY, and code quality. Focus on: $ARGUMENTS"
- Agent C: "Review for adherence to project conventions (CLAUDE.md, existing patterns). Focus on: $ARGUMENTS"

---

## Step 2 — Consolidate

Consolidate findings, keeping only issues with confidence ≥ 80. Present:
- Critical issues (blockers for push)
- Important issues (recommended to fix)

---

## Step 3 — Ask the User

Ask using `AskUserQuestion` (multiSelect: true):
- Question: "What would you like to do with the review findings?"
- Header: "Review fixes"
- Options:
  - Label: "Fix all issues (Recommended)" / Description: "Apply all critical and important fixes now and commit"
  - Label: "Fix critical only" / Description: "Fix only the blocking issues; annotate the rest for later"
  - Label: "Annotate for later" / Description: "No changes now — record findings for follow-up"
  - Label: "Ignore" / Description: "Proceed without changes"

---

## Step 4 — Apply Fixes

Apply the requested fixes and create a `fix: address code review issues` commit if anything changed.
