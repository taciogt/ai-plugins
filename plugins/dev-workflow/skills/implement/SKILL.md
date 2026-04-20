---
name: implement
description: Full-cycle feature development — planning, atomic commits, validation, code review, and push. Use when the user says "implement", "develop", "build end-to-end", or "/implement".
when_to_use: '"implement a task", "develop a feature", "build something", requests for full-cycle development with planning and commits'
argument-hint: "[issue-number or task description]"
disable-model-invocation: true
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
  - Bash(make *)
  - Bash(npx *)
  - Bash(mkdir *)
  - Bash(ls *)
  - Bash(cat *)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
---

# End-to-End Implementation

You will drive the full implementation of a task in a closed loop: planning → atomic commits → validation → review → push.

**Task:** $ARGUMENTS

**Current project state:**
- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Last commit: !`git log -1 --oneline`

---

## Phase 0 — Execution Mode

**Before any planning**, use `AskUserQuestion` to ask where to run this task:

- Question: "Where do you want to run this task?"
- Header: "Execution"
- Options:
  - Label: "Isolated worktree" / Description: "Creates a new git worktree — enables running multiple /implement tasks in parallel"
  - Label: "Current working tree" / Description: "Standard behavior — runs directly in the current directory"

**If the user chooses "Isolated worktree":**

1. Resolve the task title for slug derivation:
   - If `$ARGUMENTS` is an issue number (e.g. `#34` or just `34`), fetch the title first:
     ```bash
     gh issue view $ARGUMENTS --json title --jq '.title'
     ```
   - Otherwise use `$ARGUMENTS` directly as the source text.
2. Derive a slug from the resolved title: lowercase, replace spaces and non-alphanumeric characters with hyphens, truncate at 40 characters, remove trailing or doubled hyphens.
   - Example: `"Add authentication middleware"` → `add-authentication-middleware`
3. Call `EnterWorktree({ name: slug })`.
   - This creates `.claude/worktrees/<slug>/` with branch `worktree-<slug>` based on `origin/HEAD`.
4. Confirm: "✓ Worktree `<slug>` created. All implementation will happen in the isolated context."
5. Note internally that a worktree was created — you will need to exit it at the **very end of Phase 5**, after all user follow-up is resolved. Do not call `ExitWorktree` while the user might still request edits on the branch.

**Branch naming in worktree mode:** The worktree branch (`worktree-<slug>`) **is** the feature branch for the PR. Do not create a separate feature branch — skip the `git checkout -b` step in Phase 2.

**If the user chooses "Current working tree":**
- Continue normally. No additional action in this phase.

---

## Phase 1 — Planning

**Goal:** Understand what needs to be done and break it into atomic, testable steps.

**Actions:**

1. **Detect project commands** by reading `CLAUDE.md` (if present) and `Makefile`/`package.json`:
   - **Validate command** (`$VALIDATE_CMD`): look for a `validate` target in `Makefile`, or a `"validate"` script in `package.json`. If not found, fall back to `make test 2>/dev/null || npm test 2>/dev/null`.
   - **Test command** (`$TEST_CMD`): look for `bun test`, `npm test`, `jest`, `vitest`, or equivalent declared in CLAUDE.md or `package.json`. Default to the first found.
   - **Dev server command** (`$DEV_CMD`): look for `dev` script in `package.json` or `make dev` in `Makefile`. If absent, skip the server-start check in Phase 3.
   - Store these for use throughout the session.

2. Launch the `Explore` agent (subagent_type: Explore, model: haiku) to map the codebase **before any planning**:
   - Ask Explore to return a structured list: `<path>: <role in the system>` for each relevant file, observed code patterns, and existing conventions.
   - **Wait for the full Explore result before proceeding.**

3. Decide whether to launch `task-planner`:
   - **Skip** if the implementation plan is directly derivable from the issue spec, a planning document already exists, or the Explore output makes the steps obvious. Proceed to step 4.
   - **Launch task-planner** when scope is ambiguous, multiple valid approaches exist, or Explore reveals non-obvious dependencies. Pass in the prompt:
     - The original task: `$ARGUMENTS`
     - The full Explore output (identified files, patterns, conventions)
     - Explicit instruction: "Use the file list below as your starting point — do not re-explore the codebase."

4. Read all key files identified before proceeding.

5. Present to the user:
   - Summary of what was understood
   - Numbered list of **atomic steps** — each step must: change a single responsibility, be independently runnable, and have a clear validation criterion
   - Files affected per step
   - Proposed branch name: `<type>/<short-description>` following CLAUDE.md conventions (e.g. `feat/add-auth-middleware`). In worktree mode, note that the worktree branch will be used.

6. **Wait for explicit user approval** before implementing. If the user requests adjustments, revise and wait for re-approval.

---

## Phase 2 — Implementation

**DO NOT START WITHOUT PLAN APPROVAL.**

**Before starting:**

- **Worktree mode:** You are already on the correct branch. Confirm: "Implementing on branch `<worktree-branch>`. Starting implementation."
- **Current working tree:** Create and switch to the approved branch:
  ```bash
  git checkout -b <approved-branch> main
  ```
  Confirm: "Branch `<approved-branch>` created from `main`. Starting implementation."

---

### 2a — Parallel Batch Execution

**Use this path only when the batch has two or more genuinely independent steps** (i.e. steps that do not depend on each other's output or files). If all steps in the plan are sequential, go directly to 2b.

Execute batches **in sequence**; within each batch execute all steps **in parallel**.

**Coordinator — before launching agents:**

1. Create one task per step in the batch using `TaskCreate` (title = step description, status = `pending`).
2. Launch **one Agent per step in parallel**, all with `isolation: "worktree"`. Pass in each agent's prompt:
   - The exact step to implement (description, files, validation criterion, commit type)
   - The feature branch as the base reference
   - The task ID (`taskId: <id>`)
   - Agent behavior instructions (section below)

**Implementation agent (one per step, run in parallel):**

1. `TaskUpdate(taskId, { status: "in_progress" })`
2. Read relevant files before editing.
3. Implement the step's changes.
4. Run tests using the project's test command (`$TEST_CMD <file>` for narrow scope, or `$VALIDATE_CMD` as fallback).
5. **If tests pass:**
   - Stage only the step's files and commit: `<type>(<scope>): <concise description>` with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
   - Capture the hash: `git rev-parse HEAD`
   - `TaskUpdate(taskId, { status: "completed", output: "<hash> — <message>" })`
6. **If tests fail:**
   - Infrastructure error (ECONNREFUSED, service unavailable): check for `docker-compose.yml` or `compose.yml` in the project root. If found, run `docker compose up -d` and wait ~3s, then retry. Otherwise report the infrastructure issue to the user.
   - Code error: fix once and retry.
   - If still failing: do not commit. `TaskUpdate(taskId, { status: "failed", output: "<error + diagnosis>" })`. Exit without blocking other agents.

**Coordinator — after all agents finish:**

1. Read all task statuses via `TaskGet`.
2. For each successful step in plan order: `git cherry-pick <hash>`. Resolve conflicts if possible; otherwise pause and ask the user.
3. Report ✓ completed steps and ✗ failed steps.
4. If any step failed, ask the user: fix now / skip / abort.
5. Advance to the next batch.

---

### 2b — Sequential Steps

Use when all steps have linear dependencies (each step requires the output of the previous one), or a batch has only one step.

For each step:

1. Announce: "Starting step N/M: `<description>`"
2. Read relevant files.
3. Implement the changes.
4. Validate: `$VALIDATE_CMD`
5. **If validation fails:**
   - Infrastructure problem (ECONNREFUSED, service unavailable): check for `docker-compose.yml` or `compose.yml` in the project root. If found, run `docker compose up -d` and wait ~3s, then retry. Otherwise report the infrastructure issue to the user.
   - Code problem: fix and retry.
   - If still failing after one fix: **do not commit** — ask the user what to do before proceeding. Never assume tests were already broken.
6. Commit: `<type>(<scope>): <concise description>` with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
7. Confirm: "✓ Step N complete: `<hash> — message`"

**Lockfile rule:** If a step installs new packages, the lockfile will change. After the step, run the project's install command from the repo root and include the lockfile in the same commit. Skipping this causes `--frozen-lockfile` checks to fail in CI.

---

## Phase 3 — Final Validation

**Goal:** Verify the full implementation works end-to-end.

1. Run `$VALIDATE_CMD` (lint + typecheck + test).
   - Infrastructure failure: check for `docker-compose.yml` or `compose.yml`. If found, run `docker compose up -d`, wait ~3s, retry. Otherwise report to the user.
   - Code failure: fix and create a fix commit.
   - **Never assume tests were already broken on `main`.** If you cannot make tests pass, ask the user before proceeding.
2. If the task adds HTTP endpoints and `$DEV_CMD` is available, verify the server starts: run `$DEV_CMD` in the background for a few seconds.
3. Present each check result to the user. Fix and commit any failures before moving on.

---

## Phase 4 — Code Review

**Goal:** Ensure quality, correctness, and adherence to project conventions.

1. Launch **3 `task-reviewer` agents in parallel**:
   - Agent A: "Review for bugs, logic errors, and security vulnerabilities. Focus on: $ARGUMENTS"
   - Agent B: "Review for simplicity, DRY, and code quality. Focus on: $ARGUMENTS"
   - Agent C: "Review for adherence to project conventions (CLAUDE.md, existing patterns). Focus on: $ARGUMENTS"

2. Consolidate findings, keeping only issues with confidence ≥ 80. Present:
   - Critical issues (blockers for push)
   - Important issues (recommended to fix)

3. Ask the user what to do using `AskUserQuestion` (multiSelect: true):
   - Question: "What would you like to do with the review findings?"
   - Header: "Review fixes"
   - Options:
     - Label: "Fix all issues (Recommended)" / Description: "Apply all critical and important fixes now and commit"
     - Label: "Fix critical only" / Description: "Fix only the blocking issues; annotate the rest for later"
     - Label: "Annotate for later" / Description: "No changes now — record findings for follow-up"
     - Label: "Ignore" / Description: "Proceed without changes"

4. Apply the requested fixes and create a `fix: address code review issues` commit if anything changed.

---

## Phase 5 — Push, PR, and Close

**NEVER push or open a PR without explicit user approval.**

1. Present the final summary:
   - Branch: `git branch --show-current`
   - Commits: `git log origin/main..HEAD --oneline`
   - Files changed: `git diff origin/main..HEAD --name-only`

2. Ask the user with `AskUserQuestion`:
   - Question: "What would you like to do with the branch?"
   - Header: "Push & PR"
   - Options:
     - Label: "Push and open PR (Recommended)" / Description: "Push branch to origin and open a Pull Request against main"
     - Label: "Push only" / Description: "Push the branch to origin without opening a PR"
     - Label: "Do nothing" / Description: "Keep changes local — no push, no PR"

3. **If "Push and open PR":**
   a. `git push -u origin <current-branch>`
   b. `gh pr create --base main --title "<type>(<scope>): <description>" --body "..."` — body includes: summary, commit list, `Closes #N` if applicable.
   c. Display the PR URL.
   d. Wait for CI checks:
      ```bash
      until gh pr checks <PR-URL> 2>/dev/null | grep -qv "^$"; do sleep 5; done
      gh pr checks <PR-URL> --watch
      ```
      If `--watch` returns "no checks reported", retry after a few seconds. Fallback: `gh run list --branch <branch>`.
   e. If all checks pass: confirm "✓ All CI checks passed."
   f. If any check fails: list the failures and ask the user: investigate + fix commit, or proceed with warning.

   **If "Push only":** `git push -u origin <current-branch>`. Confirm push, no PR.

   **If "Do nothing":** Confirm changes are kept locally.

4. Inform suggested next steps (e.g. request review, merge, deploy).

5. **If a worktree was created in Phase 0:** Only call `ExitWorktree({ action: "keep" })` now, after all follow-up is resolved. Confirm: "✓ Worktree exited. Branch `<branch>` preserved."

---

## General Rules

- **Never mix steps** — each commit represents exactly one plan step
- **Never advance with failing tests** — fix before committing
- **Never push without confirmation** — even if commits are already approved
- **Never commit or push directly to `main`** — always use a feature branch
- **Always read files before editing** — never edit blind
- **Always report progress** at each completed step
- **Always verify CI after opening a PR** — report the result before closing
