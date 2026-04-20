# dev-workflow

Full development cycle toolkit for any software project.

## Skills

### `/implement [issue-number or description]`

5-phase end-to-end feature development:

0. **Execution mode** — isolated worktree or current working tree
1. **Planning** — Explore agent maps codebase; Opus agent produces atomic steps; user approves
2. **Implementation** — parallel batches or sequential steps, one commit per step; auto-detects project's validate/test commands from CLAUDE.md
3. **Final validation** — runs the project's validate command end-to-end
4. **Code review** — 3 parallel Sonnet reviewers (bugs, simplicity, conventions); user decides what to fix
5. **Push & PR** — opens PR, watches CI

### `/plan-issue [description]`

Plans a task with the Opus planning agent and creates a structured GitHub issue with context, acceptance criteria, and implementation suggestion. Two explicit approval gates: plan approval, then issue draft approval.

### `/fix-ci [PR-number]`

Autonomously fixes a failing CI pipeline. Polls GitHub checks, reads failure logs, generates minimal fixes, commits, and pushes. Stops after 3 cycles or if the same error repeats.

## Agents

- **task-planner** (Opus) — breaks tasks into atomic, testable implementation steps
- **task-reviewer** (Sonnet) — reviews code changes across three dimensions: bugs+security, simplicity+DRY, project conventions
