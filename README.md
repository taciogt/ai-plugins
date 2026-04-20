# ai-plugins

Personal Claude Code plugin marketplace — a curated set of reusable skills and agents for full-cycle software development.

## Plugins

### `dev-workflow`

Full development cycle toolkit.

| Skill | Invocation | What it does |
|-------|-----------|-------------|
| `implement` | `/implement [issue or description]` | 5-phase feature development: planning → atomic commits → validation → parallel code review → PR |
| `plan-issue` | `/plan-issue [description]` | Plans a task via Opus agent and creates a GitHub issue with acceptance criteria |
| `fix-ci` | `/fix-ci [PR number]` | Autonomously fixes failing CI: polls checks, reads logs, commits fixes, up to 3 cycles |

Bundled agents: `task-planner` (Opus, planning), `task-reviewer` (Sonnet, 3-dimension code review).

### `claude-productivity`

Tools for working with Claude itself.

| Skill | Invocation | What it does |
|-------|-----------|-------------|
| `skill-review` | `/skill-review [skill-name]` | Audits how well a named skill was executed — phase adherence, gate compliance, outcome |
| `skill-authoring-guide` | auto-loaded | Reference for creating skills, subagents, and hooks (not user-invocable) |
| `context-engineering` | `/context-engineering` | Best practices for curating agent context — rules files, context hierarchy, anti-patterns |
| `find-docs` | `/find-docs` | Fetches current library/framework docs via Context7 CLI |

## Installation

### Local symlink (for personal use — changes take effect immediately)

```bash
mkdir -p ~/.claude/plugins/marketplaces
ln -s /path/to/ai-plugins ~/.claude/plugins/marketplaces/taciogt-plugins
```

Then add an entry to `~/.claude/plugins/known_marketplaces.json`:

```json
{
  "taciogt-plugins": {
    "source": { "source": "local" },
    "installLocation": "/Users/<you>/.claude/plugins/marketplaces/taciogt-plugins",
    "lastUpdated": "2026-04-20T00:00:00.000Z"
  }
}
```

### Install from GitHub

```bash
git clone https://github.com/taciogt/ai-plugins.git \
  ~/.claude/plugins/marketplaces/taciogt-plugins
```

Register in `known_marketplaces.json`:

```json
{
  "taciogt-plugins": {
    "source": { "source": "github", "repo": "taciogt/ai-plugins" },
    "installLocation": "/Users/<you>/.claude/plugins/marketplaces/taciogt-plugins",
    "lastUpdated": "2026-04-20T00:00:00.000Z"
  }
}
```

## Version

`v0.1.0` — initial release
