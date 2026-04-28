# ai-plugins

Personal Claude Code plugin marketplace — a curated set of reusable skills and agents for full-cycle software development.

## Plugins

### `dev-workflow`

Full development cycle toolkit.

| Skill | Invocation | What it does |
|-------|-----------|-------------|
| [`implement`](./plugins/dev-workflow/README.md#implement-issue-number-or-description) | `/implement [issue or description]` | 5-phase feature development: planning → atomic commits → validation → parallel code review → PR |
| [`plan-issue`](./plugins/dev-workflow/README.md#plan-issue-description) | `/plan-issue [description]` | Plans a task via Opus agent and creates a GitHub issue with acceptance criteria |
| [`fix-ci`](./plugins/dev-workflow/README.md#fix-ci-pr-number) | `/fix-ci [PR number]` | Autonomously fixes failing CI: polls checks, reads logs, commits fixes, up to 3 cycles |

Bundled agents: `task-planner` (Opus, planning), `task-reviewer` (Sonnet, 3-dimension code review).

### `claude-productivity`

Tools for working with Claude itself.

| Skill | Invocation | What it does |
|-------|-----------|-------------|
| [`skill-review`](./plugins/claude-productivity/README.md#skill-review-skill-name) | `/skill-review [skill-name]` | Audits how well a named skill was executed — phase adherence, gate compliance, outcome |
| [`skill-authoring-guide`](./plugins/claude-productivity/README.md#skill-authoring-guide-auto-loaded) | auto-loaded | Reference for creating skills, subagents, and hooks (not user-invocable) |
| [`context-engineering`](./plugins/claude-productivity/README.md#context-engineering) | `/context-engineering` | Best practices for curating agent context — rules files, context hierarchy, anti-patterns |
| [`find-docs`](./plugins/claude-productivity/README.md#find-docs-library-or-question) | `/find-docs` | Fetches current library/framework docs via Context7 CLI |

## Installation

Add the marketplace from within Claude Code:

```
/plugin marketplace add taciogt/ai-plugins
```

Then install the desired plugin:

```
/plugin install dev-workflow@taciogt-plugins
/plugin install claude-productivity@taciogt-plugins
```

For local development setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Version

`v0.1.0` — initial release
