# ADR 0004: GitHub Issues for ai-plugins (hybrid trial with Linear)

## Status

Accepted (2026-09-07)

## Context

This repo's issue tracking lived in Linear, in the `Home Finances` team — a workspace shared with several unrelated personal projects (a Portuguese-language home-finance dashboard app, mostly). Linear's free plan caps a workspace at **250 non-archived issues and 2 teams**; at the time of this decision the workspace held 96 non-archived issues after ~3 months, all under one team, growing at roughly 32/month.

Only one Linear project was actually tied to this repo: **Skill Evals for ai-plugins**, 11 issues (1 wayfinder map + 10 children) with real `blockedBy`/`blocks`/`relatedTo` relations and no milestones. Everything else in the workspace belongs to the other project and was untouched by this decision.

The `wayfinder` conventions this repo's skills depend on (`docs/agents/issue-tracker.md`) rely on two Linear features specifically: native parent/child issue hierarchy and native blocking relations. As of `gh` CLI 2.94.0 (June 2026), GitHub Issues gained both as first-class, CLI-exposed features (`--parent`/`--add-sub-issue`, `--blocked-by`/`--add-blocked-by`), closing the gap that previously made GitHub Issues a poor fit for this pattern. GitHub Projects (v2)'s default `Status` field (`Todo`/`In Progress`/`Done`) also happens to match the only three states this project's tickets have ever used, covering the workflow-state and kanban-board experience without a custom field.

## Decision

Migrate this repo's issue tracking to **GitHub Issues** (`taciogt/ai-plugins`), as a deliberate **hybrid trial**: this repo uses GitHub, the other Linear-hosted personal project keeps using Linear. The goal is to compare the two in practice before committing either way workspace-wide.

Scope of the migration: the 11 issues under "Skill Evals for ai-plugins" only, re-created on GitHub (title, body, labels, state, and all relations preserved) rather than imported via API — Linear→GitHub has no first-class migration path, and 11 issues was small enough to re-create by hand with fidelity. The Linear originals are kept, archived (not deleted), as a permanent historical record; archiving removes them from the active 250-issue count without losing any data.

New GitHub-side conventions (labels `wayfinder:map`/`wayfinder:research`/`wayfinder:grilling`/`wayfinder:task`, `AFK`, `HITL`; a GitHub Project v2 board per effort) mirror the Linear ones as closely as GitHub's model allows. Notably, GitHub's issue search has no "sub-issue of #N" qualifier, so the wayfinder frontier query is a two-step read (fetch the map's sub-issues, then filter each for assignee/blockedBy) rather than Linear's single `list_issues` call — see `docs/agents/issue-tracker.md` for the verified recipe.

## Consequences

- This repo's issue history before 2026-09-07 lives in Linear (archived, read-only) under the identifiers `HF-76` through `HF-86`; GitHub issue numbers 6–16 are the same tickets going forward. Cross-references in old research docs or comments that cite `HF-*` ids remain valid pointers into Linear's archive.
- If the GitHub side doesn't hold up in practice (worse UX, missing feature), reverting means repeating this migration in the other direction — this is a real switching cost, not a free experiment.
- Both trackers now need to be checked when working across the two projects; there is no single view spanning them.
