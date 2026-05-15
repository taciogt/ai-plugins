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

## Personal Setup Notes

### Statusline

The following `/statusline` prompt configures a two-line status bar:

- **Line 1** — session location: path, git branch, worktree name (when active), model, effort level (when non-default), 💡 (when reasoning enabled)
- **Line 2** — performance: color-coded context bar + %, cost (adaptive precision), session time with API portion, rate limits (when available)

```
/statusline Create a two-line status line:

Line 1 — session location and context:
- Full working directory path shortened with ~ for home, in bold blue
- Git branch in parentheses, in magenta — only when inside a git repo
- Worktree name prefixed with ⑂ — only show when workspace.git_worktree or worktree.name is present
- Model display name, in cyan
- Effort level (e.g. "effort:high") — only show when effort.level is present and not "medium"
- 💡 emoji — only show when thinking.enabled is true
- Segments separated by |

Line 2 — performance metrics:
- 10-block color-coded progress bar (▓ filled, ░ empty) + context percentage + token count in k (e.g. "64k tokens"). Green when under 70%, yellow 70–89%, red at 90%+
- Session cost in USD: 4 decimal places when under $0.01 (e.g. $0.0034), 2 decimal places otherwise (e.g. $1.23)
- Session time: total wall-clock in human-readable format (45s, 12m, 1h32m) with API processing time in parentheses — derived from cost.total_duration_ms and cost.total_api_duration_ms (e.g. "⏱ 12m (3m api)")
- Rate limit usage (e.g. "5h: 23% | 7d: 41%") — only show when rate_limits data is present. Green under 50%, yellow 50–79%, red at 80%+
- Segments separated by |
```

## Version

`v0.1.0` — initial release
