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
| [`review-session`](./plugins/claude-productivity/README.md#review-session) | `/review-session` | Analyses the current session for improvement opportunities across 7 dimensions — missed skills, delegation decisions, rework, planning gaps, context bloat, parallelisation, and other observations |

## Installation

### From GitHub

Add the marketplace from within Claude Code:

```
/plugin marketplace add taciogt/ai-plugins
```

Then install the desired plugins:

```
/plugin install dev-workflow@taciogt-plugins
/plugin install claude-productivity@taciogt-plugins
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
/plugin install dev-workflow@taciogt-plugins
/plugin install claude-productivity@taciogt-plugins
```

After editing a skill or agent, reload the marketplace to pick up changes:

```
/plugin marketplace update taciogt-plugins
```

For contributing guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Version

`v0.1.0` — initial release
