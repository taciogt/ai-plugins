# deliver

Full development cycle toolkit for any software project.

## Skills

### `/implement [issue-number or description]`

Full-cycle feature development across 5 phases, delegating validation, review, and delivery to standalone sub-skills:

0. **Execution mode** — isolated worktree or current working tree
1. **Planning** — Explore agent maps codebase; Opus agent produces atomic steps; user approves
2. **Implementation** — parallel batches or sequential steps, one commit per step; auto-detects project's validate/test/lint commands from CLAUDE.md
3. **Final validation** — delegates to `/validate`
4. **Code review** — delegates to `/review`
5. **Push & PR** — delegates to `/ship`

### `/validate`

Validates the current branch end-to-end: lint, typecheck, targeted tests, and browser check. Self-sufficient standalone — detects project commands from CLAUDE.md automatically. When invoked from `/implement`, reuses the command variables already in session.

### `/review [focus]`

Runs 3 parallel Sonnet reviewers across the current branch (bugs/security, simplicity/DRY, project conventions) and consolidates findings. Standalone-safe — infers task context from `git log` if no focus is provided.

### `/ship`

Pushes the current branch, opens a PR against main, waits for CI checks, and handles worktree cleanup. Standalone-safe — works on any branch regardless of how it was built.

### `/plan-issue [description]`

Plans a task with the Opus planning agent and creates a structured GitHub issue with context, acceptance criteria, and implementation suggestion. Two explicit approval gates: plan approval, then issue draft approval.

### `/fix-ci [PR-number]`

Autonomously fixes a failing CI pipeline. Polls GitHub checks, reads failure logs, generates minimal fixes, commits, and pushes. Stops after 3 cycles or if the same error repeats.

## Agents

- **task-planner** (Opus) — breaks tasks into atomic, testable implementation steps
- **task-reviewer** (Sonnet) — reviews code changes across three dimensions: bugs+security, simplicity+DRY, project conventions
