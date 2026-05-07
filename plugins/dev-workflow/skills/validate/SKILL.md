---
name: validate
description: Validate the current branch end-to-end — lint, typecheck, targeted tests, and browser check. Use when you want to verify a branch before review or push. Called internally by /implement after implementation completes.
when_to_use: '"validate this branch", "run checks", "lint and test", standalone branch verification before review or push, called internally by /implement'
argument-hint: "[optional task description for context]"
allowed-tools:
  - Bash(git *)
  - Bash(npx *)
  - Bash(make *)
  - Bash(npm *)
  - Bash(lsof *)
  - Bash(curl *)
  - Bash(kill *)
  - Bash(docker *)
  - Read
---

# Branch Validation

Validate the current branch end-to-end: lint, typecheck, targeted tests, and browser check.

**Current branch:** !`git branch --show-current`
**Changed files:** !`git diff origin/main..HEAD --name-only 2>/dev/null | head -20`

---

## Command Detection

If `$VALIDATE_CMD`, `$LINT_CMD`, `$TYPECHECK_CMD`, `$TEST_CMD`, and `$DEV_CMD` are already established in this conversation (e.g., from a prior `/implement` run), use them directly — skip detection.

Otherwise detect them now by reading `CLAUDE.md` (if present) and `Makefile`/`package.json`:

- **Validate command** (`$VALIDATE_CMD`): look for a `validate` target in `Makefile`, or a `"validate"` script in `package.json`. If not found, fall back to `make test 2>/dev/null || npm test 2>/dev/null`.
- **Lint command** (`$LINT_CMD`): look for a `lint` script in `package.json` or `make lint` in `Makefile`. Also accept `eslint`, `ruff`, `golangci-lint` if declared. Leave unset if absent.
- **Typecheck command** (`$TYPECHECK_CMD`): look for a `typecheck` or `type-check` script in `package.json`, `make typecheck`, or a bare `tsc --noEmit` / `mypy` invocation. Leave unset if absent.
- **Test command** (`$TEST_CMD`): look for `bun test`, `npm test`, `jest`, `vitest`, or equivalent declared in CLAUDE.md or `package.json`. Default to the first found.
- **Dev server command** (`$DEV_CMD`): look for `dev` script in `package.json` or `make dev` in `Makefile`. If absent, skip the browser check.

---

## Phase 1 — Lint & Typecheck

- If `$LINT_CMD` and `$TYPECHECK_CMD` were both detected: run `$LINT_CMD && $TYPECHECK_CMD`.
- If either is absent: fall back to `$VALIDATE_CMD` (which combines lint + typecheck + tests — acceptable for this step).
- Infrastructure failure: check for `docker-compose.yml` or `compose.yml`. If found, run `docker compose up -d`, wait ~3s, retry. Otherwise report to the user.
- Code failure: fix and create a fix commit. **Never assume failures were pre-existing on `main`.**

---

## Phase 2 — Classify the Diff

Run `git diff origin/main..HEAD --name-only` and reason about the changed files:

- **Docs-only**: all changed files are documentation or non-code assets (`*.md`, `*.txt`, `*.rst`, `*.png`, etc.) → skip phases 3 and 4 entirely.
- **Backend-only**: changes are confined to server-side code with no frontend assets or routes → run phase 3, skip browser check in phase 4.
- **Frontend or mixed**: changes include frontend components, styles, pages, or routes → run both phases 3 and 4.

---

## Phase 3 — Targeted Tests

**Skip if: docs-only.**

**Step 1 — Scope tests to changed files** using the best available method:
- **Jest/Vitest**: `npx jest --findRelatedTests <changed-files>` or `npx vitest related <changed-files>`
- **Go**: `go test ./<package>/...` for each package directory containing a changed file
- **pytest**: `pytest <directories-containing-changed-files>`
- **Fallback**: run all tests under the directories containing changed files

**Step 2 — Run unit tests first:**
1. Look for a `test:unit`, `unit-test`, or `unit` target in `package.json` or `Makefile`. If found, run it with the scoped file list.
2. Else look for test files matching `*.unit.test.*` or located in `tests/unit/` or `__tests__/unit/`. Run only those that correspond to changed files.
3. Else run all related tests in a single step (no unit/integration split).

**Step 3 — Run integration tests** (only if a separate target or directory exists):
1. Look for a `test:integration`, `integration-test`, or `integration` target. If found, run it with the scoped file list.
2. Else look for test files matching `*.integration.test.*` or located in `tests/integration/`. Run only those corresponding to changed files.
3. If no separation is found and unit tests already ran, skip.

**On any test failure:**
- Infrastructure error: check for `docker-compose.yml` or `compose.yml`. If found, run `docker compose up -d`, wait ~3s, retry.
- Code error: fix once and retry.
- If still failing: **do not proceed** — ask the user what to do. Never assume tests were already broken on `main`.
- After fixing: create a `fix:` commit before continuing.

---

## Phase 4 — Browser Check

**Skip if: docs-only, backend-only, or `$DEV_CMD` is not available.**

**Step 1 — Determine port:**
1. Parse config files for an explicit port declaration: `.env` (`PORT=`, `VITE_PORT=`), `vite.config.ts/js` (`server.port`), `next.config.js/ts` (`port`).
2. If not found: start `$DEV_CMD` in the background and read its stdout for a line matching `localhost:\d+` or `http://localhost:\d+`. Capture the port. **Note internally** that the port was discovered this way — you will suggest documenting it at the end of this step.

**Step 2 — Start or reuse dev server:**
- Run `lsof -ti:<port>` to check if something is already listening.
- If yes: reuse it. Track that you did **not** start it.
- If no: start `$DEV_CMD` in the background. Poll `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>` every 2s for up to 15s until it returns a non-error status. Track that you **did** start it.

**Step 3 — Navigate and check:**
- Infer the relevant route from the changed files (e.g. `src/components/LoginForm.tsx` → `/login`, `src/pages/dashboard/` → `/dashboard`). Default to `/` if no specific route is inferable.
- Use Claude-in-Chrome tools: navigate to `http://localhost:<port>/<route>`, take a screenshot.
- **If a browser tool returns a `permission_required` error for `localhost`:** Do NOT skip the check. Instead, tell the user: "Browser check requires localhost permission. To grant it, open Claude Code settings → Permissions and add `localhost` to the allowed origins, or run `/allowed-domains add localhost`. Once granted, I will proceed with the check." Then wait for confirmation before retrying. Never silently skip the browser check when it is applicable.
- Check for: page renders without a blank screen, no unhandled console errors, expected UI elements are visible.

**Step 4 — Teardown:**
- If you started the server: kill it (`kill $(lsof -ti:<port>)`).
- If you reused an existing server: leave it running.

**Step 5 — Report:**
- If everything looks correct: confirm `✓ Browser check passed on /<route>.`
- If an anomaly is detected: present the screenshot and a description of what looks wrong. Ask the user whether to fix now or continue to review. **Do not block** — the user decides.
- If the port was discovered via `$DEV_CMD` stdout (Step 1.2): suggest: "Consider declaring the dev server port explicitly in your config or CLAUDE.md so future runs detect it reliably."
