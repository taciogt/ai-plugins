# Contributing

## Local development

To work on this repo with changes taking effect immediately (no reinstall needed):

```bash
mkdir -p ~/.claude/plugins/marketplaces
ln -s /path/to/ai-plugins ~/.claude/plugins/marketplaces/taciogt-plugins
```

Or via CLI:

```
/plugin marketplace add /path/to/ai-plugins
```

## Adding a plugin

1. Create `plugins/<plugin-name>/` with:
   - `.claude-plugin/plugin.json` — plugin metadata
   - `README.md` — description and skill reference
2. Register it in `.claude-plugin/marketplace.json` under the `"plugins"` array:
   ```json
   {
     "name": "my-plugin",
     "description": "...",
     "category": "development",
     "source": "./plugins/my-plugin"
   }
   ```

## Adding a skill

Inside the plugin directory, create `skills/<skill-name>/SKILL.md` with at minimum:

```markdown
---
name: my-skill
description: One sentence — when Claude should use this skill.
---

# Skill instructions here
```

Key frontmatter fields:

| Field | When to use |
|-------|-------------|
| `disable-model-invocation: true` | Skills with side effects (push, create issue, deploy) — only user can trigger |
| `user-invocable: false` | Internal reference skills Claude loads automatically |
| `allowed-tools` | Pre-approve tools to avoid per-use prompts |
| `argument-hint` | Autocomplete hint shown in the `/` menu |

For the full field reference, run `/skill-authoring-guide` inside any Claude Code session that has the `craft` plugin installed.
