---
name: ship
description: Push the current branch, open a pull request, wait for CI checks, and clean up worktrees. Use when you are ready to deliver a branch. Called internally by /implement after code review.
when_to_use: '"ship this", "push and open PR", "deliver", "push branch and PR", standalone delivery of any branch, called internally by /implement'
argument-hint: "[optional PR description context]"
disable-model-invocation: true
allowed-tools:
  - Bash(git *)
  - Bash(gh *)
---

# Ship

Push the current branch, open a PR, monitor CI, and clean up.

**NEVER push or open a PR without explicit user approval.**

**Current branch:** !`git branch --show-current`
**Commits to push:** !`git log origin/main..HEAD --oneline 2>/dev/null`

---

## Step 1 — Present Summary

Present the final summary:
- Branch: `git branch --show-current`
- Commits: `git log origin/main..HEAD --oneline`
- Files changed: `git diff origin/main..HEAD --name-only`

---

## Step 2 — Ask the User

Ask with `AskUserQuestion`:
- Question: "What would you like to do with the branch?"
- Header: "Push & PR"
- Options:
  - Label: "Push and open PR (Recommended)" / Description: "Push branch to origin and open a Pull Request against main"
  - Label: "Push only" / Description: "Push the branch to origin without opening a PR"
  - Label: "Do nothing" / Description: "Keep changes local — no push, no PR"

---

## Step 3 — Execute

**If "Push and open PR":**
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

---

## Step 4 — Suggest Next Steps

Inform suggested next steps (e.g. request review, merge, deploy).

---

## Step 5 — Worktree Cleanup

If this session included worktree creation (via `/implement` Phase 0), or if the current directory is a linked worktree (detect via `git worktree list --porcelain` — a linked worktree has a `worktree` path that is not the common git dir), call `ExitWorktree({ action: "keep" })` now, after all user follow-up is resolved.

Confirm: "✓ Worktree exited. Branch `<branch>` preserved."
