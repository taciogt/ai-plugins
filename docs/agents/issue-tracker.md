# Issue tracker: GitHub

Issues, specs, and wayfinder maps for this repo live as **GitHub issues**, in `taciogt/ai-plugins`. Use the `gh` CLI for all operations. `gh` infers the repo from the working directory's git remote.

This repo migrated off Linear on 2026-09-07 as a deliberate trial — see `docs/adr/0004-github-issues-for-ai-plugins.md` for the reasoning. Other personal projects (a separate Linear workspace, unrelated to this repo) are unaffected.

Requires `gh` **2.94.0+** (native sub-issues and issue dependencies) and the `project` OAuth scope for the board (`gh auth refresh -s project` if `gh project` commands fail with a scope error).

## Conventions

- **Create an issue**: `gh issue create --title "..." -F body.md --label "..."`. Always use `-F/--body-file` with a scratch file for anything beyond a one-liner — bodies routinely contain backticks, `$`, and nested Markdown that break `-b/--body` quoting.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with `--label`/`--search` filters as needed.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --reason completed --comment "..."` (or `--reason "not planned"` for won't-fix).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `taciogt/ai-plugins`.

## When a skill says "fetch the relevant ticket"

`gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. GitHub's native **sub-issues** and **issue dependencies** (both surfaced through `gh` since 2.94.0, June 2026) cover this cleanly — no raw `gh api` calls needed.

- **Project board**: a GitHub Project (v2), one per wayfinder effort, e.g. [Skill Evals for ai-plugins](https://github.com/users/taciogt/projects/6). Its default **Status** field (`Todo` / `In Progress` / `Done`) is the kanban replacement for Linear's workflow states — this repo's tickets only ever use those three, so no custom field is needed. Create with `gh project create --owner taciogt --title "<effort>"`; add issues with `gh project item-add <project-number> --owner taciogt --url <issue-url>`; set status with `gh project item-edit --project-id <id> --id <item-id> --field-id <status-field-id> --single-select-option-id <option-id>` (ids come from `gh project field-list <number> --owner taciogt --format json`). GitHub Projects v2 are always owned by a user or org, not a repo, but **link** each board to this repo with `gh project link <number> --owner taciogt --repo taciogt/ai-plugins` so it shows under the repo's own Projects tab instead of only the user's personal projects list — the URL stays `github.com/users/taciogt/projects/<n>` either way.

- **Map**: an issue labelled `wayfinder:map`, holding the Destination / Notes / Decisions-so-far / Not-yet-specified / Out-of-scope body (same shape as the old Linear convention). `gh issue create --label wayfinder:map -F map-body.md`.

- **Child ticket**: `gh issue create --parent <map#> -F body.md --label "wayfinder:<type>"` (`research`/`prototype`/`grilling`/`task`), plus this workspace's `AFK`/`HITL` labels — `research` is AFK, the rest are HITL unless the ticket says otherwise. `--parent` sets the sub-issue relationship at creation time; use `gh issue edit <map#> --add-sub-issue <child#>` to attach one after the fact.

- **Blocking**: wire dependencies in a **second pass**, once every child has a number (mirrors the old Linear convention — the ids don't exist until the issues do):

  ```
  gh issue edit <child#> --add-blocked-by <blocker#>,<blocker#>
  ```

  Setting `--add-blocked-by` on one issue automatically creates the inverse `blocking` edge on the referenced issue — only wire one direction. A ticket is **unblocked** when every issue in its `blockedBy` is closed.

- **Frontier query**: the map's open, unassigned, unblocked children. There is no single search qualifier for "sub-issue of #N" (GitHub's issue search doesn't expose parent/child yet), so this is a two-step read, not a one-liner:

  1. `gh issue view <map#> --json subIssues -q '.subIssues.nodes[] | select(.state=="OPEN") | .number'` — the open children.
  2. For each, `gh issue view <n> --json number,title,assignees,blockedBy` — keep it only if `assignees` is empty and every entry in `blockedBy.nodes` has `state != "OPEN"`.

  First in map order wins. (Do **not** use the Project Status field for "unclaimed" — assignee is the claim, same as Linear, and that keeps the query board-independent.)

- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write, before any work.

- **Resolve**: `gh issue comment <n> --body "<the answer>"`, then `gh issue close <n> --reason completed`, then append a one-line context pointer (gist + link, referring to the ticket **by title**) to the map issue's Decisions-so-far section (`gh issue edit <map#> -F updated-map-body.md`).

- **Rule out of scope**: `gh issue close <n> --reason "not planned" --comment "..."` and add one line to the map's **Out of scope** section. It does **not** go in Decisions-so-far.

## Active maps

- **[Map — Eval strategy for the ai-plugins marketplace](https://github.com/taciogt/ai-plugins/issues/6)** — board: [Skill Evals for ai-plugins](https://github.com/users/taciogt/projects/6) — migrated from Linear (was HF-76) 2026-09-07.
