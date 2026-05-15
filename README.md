# ai-plugins

Personal Claude Code plugin marketplace — a curated set of reusable skills and agents for full-cycle software development.

## Plugins

### `deliver`

Full development cycle toolkit.

| Skill | Invocation | What it does |
|-------|-----------|-------------|
| [`implement`](./plugins/deliver/README.md#implement-issue-number-or-description) | `/implement [issue or description]` | Full-cycle feature development: planning → atomic commits → validate → review → ship |
| [`validate`](./plugins/deliver/README.md#validate) | `/validate` | Lint, typecheck, targeted tests, and browser check on the current branch |
| [`review`](./plugins/deliver/README.md#review) | `/review [focus]` | 3-angle parallel code review: bugs/security, simplicity, conventions |
| [`ship`](./plugins/deliver/README.md#ship) | `/ship` | Push branch, open PR, wait for CI, clean up worktrees |
| [`plan-issue`](./plugins/deliver/README.md#plan-issue-description) | `/plan-issue [description]` | Plans a task via Opus agent and creates a GitHub issue with acceptance criteria |
| [`fix-ci`](./plugins/deliver/README.md#fix-ci-pr-number) | `/fix-ci [PR number]` | Autonomously fixes failing CI: polls checks, reads logs, commits fixes, up to 3 cycles |

Bundled agents: `task-planner` (Opus, planning), `task-reviewer` (Sonnet, 3-dimension code review).

### `craft`

Tools for working with Claude itself.

| Skill | Invocation | What it does |
|-------|-----------|-------------|
| [`skill-review`](./plugins/craft/README.md#skill-review-skill-name) | `/skill-review [skill-name]` | Audits how well a named skill was executed — phase adherence, gate compliance, outcome |
| [`skill-authoring-guide`](./plugins/craft/README.md#skill-authoring-guide-auto-loaded) | auto-loaded | Reference for creating skills, subagents, and hooks (not user-invocable) |
| [`find-docs`](./plugins/craft/README.md#find-docs-library-or-question) | `/find-docs` | Fetches current library/framework docs via Context7 CLI |
| [`review-session`](./plugins/craft/README.md#review-session) | `/review-session` | Analyses the current session for improvement opportunities across 7 dimensions — missed skills, delegation decisions, rework, planning gaps, context bloat, parallelisation, and other observations |

## Installation

### From GitHub

Add the marketplace from within Claude Code:

```
/plugin marketplace add taciogt/ai-plugins
```

Then install the desired plugins:

```
/plugin install deliver@taciogt-plugins
/plugin install craft@taciogt-plugins
```

To get new plugin versions after the repo is updated:

```
/plugin marketplace update taciogt-plugins
```

### Local (for testing changes)

If you're iterating on the plugins locally, add the marketplace by its local path so changes are visible without reinstalling:

```
/plugin marketplace add /path/to/ai-plugins
```

Then install plugins the same way:

```
/plugin install deliver@taciogt-plugins
/plugin install craft@taciogt-plugins
```

After editing a skill or agent, reload the marketplace to pick up changes:

```
/plugin marketplace update taciogt-plugins
```

For contributing guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Version

`v0.1.0` — initial release
