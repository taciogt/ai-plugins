---
name: fix-ci
description: Use this skill when the user wants to fix a failing CI pipeline on a PR. Autonomously polls checks, reads failure logs, generates fixes, and re-pushes until CI is green or the retry limit is reached.
disable-model-invocation: true
---

# Fix CI Autonomously

You will monitor the CI status of a PR, identify failures, generate fixes, and push until all checks pass — or until the 3-cycle retry limit is reached.

**Target PR:** $ARGUMENTS

**Current state:**
- Branch: !`git branch --show-current`
- PR open on this branch: !`gh pr view --json number,url,headRefName 2>/dev/null || echo "no PR found"`

---

## Guardrails (read before any action)

- **Maximum 3 retry cycles.** If CI still fails after 3 attempts, stop and report.
- **Never use force-push** (`--force`, `-f`). Only normal `git push`.
- **Abort if the same test fails twice with the exact same error** — means the failure is not auto-fixable. Report to the user and stop.
- **Never commit directly to `main`.** If the branch is `main`, abort immediately.
- **Never modify files outside the failure scope** — do not refactor, clean up, or "improve" anything beyond what is needed for CI to pass.

---

## Step 0 — Identify the PR

If `$ARGUMENTS` is a PR number (e.g. `42`), use it directly.

If `$ARGUMENTS` is empty, detect the PR from the current branch:
```bash
gh pr view --json number,url,headRefName
```

If no PR is open on the current branch, inform the user and stop.

Store: `PR_NUMBER`, `PR_URL`, `PR_BRANCH`.

Confirm: "Monitoring CI for PR #`<number>`: `<url>`"

---

## Main loop (maximum 3 cycles)

For each cycle (1, 2, 3):

### Step 1 — Check status

```bash
gh pr checks <PR_NUMBER>
```

- If **all checks passed**: exit with success (see Termination).
- If any check is still pending/running, wait and re-check with `gh pr checks <PR_NUMBER> --watch`.
- If any check **failed**: proceed to Step 2.

### Step 2 — Collect failure logs

For each failing check:

```bash
# Identify the run ID
gh run list --branch <PR_BRANCH> --limit 5

# Get failure logs
gh run view <RUN_ID> --log-failed
```

Extract from the log:
- Name of the failing job/step
- Full error message
- File(s) and line(s) mentioned

### Step 3 — Detect loop (same error)

Before attempting a fix, compare the current error with the previous cycle's error (if any).

If the error is **identical** to the previous cycle:
- Report: "The same error occurred twice. The failure does not appear to be auto-fixable."
- Stop (see Termination with failure).

### Step 4 — Identify and fix the root cause

Based on the collected logs:

1. Read the relevant files mentioned in the error.
2. Identify the root cause — do not assume, read the code.
3. Generate the minimal fix needed for CI to pass.
4. Common failure types and approach:
   - **Failing test**: fix the code or the test (only what is necessary)
   - **TypeScript type error**: fix the typing in the file pointed to
   - **Lint/format**: check CLAUDE.md for lint/format commands (same detection as `deliver:validate`); if not found, use `npx eslint --fix` for JS/TS or `npx prettier --write` as fallback
   - **Build error**: fix the broken import/export
   - **Migration failure**: analyze the schema and fix the migration

### Step 5 — Validate locally before committing

Run the tests locally in the scope of the fix:

Use the same command detection as `deliver:validate`: check CLAUDE.md for the project's test/lint/typecheck commands first; if absent, fall back to `npm test <file>` / `npx jest <file>` / `make test` for tests, and `npx tsc --noEmit` / `npx eslint .` for type/lint failures.

- If tests **pass locally**: proceed to Step 6.
- If tests **fail locally**: attempt one additional fix. If still failing, stop with failure.

### Step 6 — Commit and push

```bash
git add <fixed-files>
git commit -m "fix: resolve CI failure in <main-file>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push
```

Confirm to the user: "Cycle N: fix committed (`<hash>`) and pushed. Waiting for new CI run..."

### Step 7 — Wait for new CI run

After the push, wait for the new run to start:
```bash
sleep 10
gh pr checks <PR_NUMBER> --watch
```

Return to the start of the loop (next cycle).

---

## Termination

### If CI passed

```bash
gh pr checks <PR_NUMBER>
```

Report:
- "✓ All CI checks passed on PR #`<number>`."
- List of checks with status
- Number of cycles used
- Commits created (hashes and messages)

### If CI still fails after 3 cycles

Report:
- "✗ CI still failing after 3 fix cycles."
- Last error found (complete)
- What was attempted in each cycle
- Suggestion: "Review the log manually: `gh run view --log-failed`"

Do not make any further changes.
