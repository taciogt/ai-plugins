# Domain Model — ai-plugins

This file is the canonical glossary for the plugin marketplace project. Terms here take precedence over informal usage in code comments or READMEs.

---

## Glossary

### Plugin Version
Plugins are versioned independently. A breaking change to `dev-workflow` advances its version without affecting `claude-productivity`. The Marketplace itself is not versioned as a unit — the Marketplace is just the container; version state lives at the Plugin level.

### Plugin Self-containment
A Plugin must not depend on Skills or Sub-agents from another Plugin. All Skills and Sub-agents a Plugin needs must be defined within it. If logic is shared across Plugins, it is either duplicated or extracted into a Skill within one Plugin. This keeps installation atomic and prevents version mismatch across Plugins.

### Marketplace
A personal, curated collection of Plugins owned and maintained by a single author. The Marketplace is the top-level unit of distribution — users add a Marketplace by URL or local path, then install individual Plugins from it. It owns its Plugins (Plugins are not independently distributable). Will eventually support versioning and contribution guidelines. Defined by a `marketplace.json` manifest at the root of the repository.

### Plugin
A distributable package that groups related Skills, Sub-agents, Hooks, and MCP servers around a single workflow concern. The unit of installation — users install a Plugin, not individual Skills. Defined by a `plugin.json` manifest inside a `.claude-plugin/` directory.

### Skill
Reusable instructions that run inside the main conversation context. Skills can invoke other Skills while sharing context, with no spawn overhead. The primary unit of user-facing behaviour — every slash command (`/implement`, `/review`, etc.) is backed by a Skill. Defined as a `SKILL.md` file with YAML frontmatter inside a `skills/<name>/` directory.

Reach for a Skill when: the work belongs in the main conversation flow, or when you want to chain steps without the cost of context isolation.

Reach for a Sub-agent instead when: you need context isolation to avoid bloating the main session, or when the task benefits from a specialized model (smarter or cheaper than the default).

### Sub-agent
A worker that runs in isolation from the main Claude conversation. Only a summary of its output returns to the main context. Can be configured with a dedicated model (e.g. Opus for deep planning, Haiku for fast search). Defined as a `.md` file with YAML frontmatter under `agents/`. Complies with the official Claude Code "Sub-agent" terminology. Previously referred to as "Agent" in this repo — those two terms are synonymous.

Sub-agents are **shared workers within a Plugin** — any Skill in the same Plugin may invoke them, but they have no independent user-facing identity (not invocable via slash command) and are not accessible to Skills in other Plugins.

---

### Skill Invocation Modes
Skills have three invocation modes controlled by frontmatter:

- **Public Skill** *(default)* — invocable by both the user (via slash command) and Claude (auto-invoked when relevant). Appears in the `/` command menu.
- **Guarded Skill** *(`disable-model-invocation: true`)* — user-triggered only. Used for Skills with side effects (push, deploy, create PR) where Claude must not fire them autonomously.
- **Internal Skill** *(`user-invocable: false`)* — Claude-only reference material. Hidden from the slash command menu; Claude loads it automatically when relevant.

### Installation
The act of registering a Plugin from a Marketplace into a target environment. Installation follows a subscription model — the Plugin is registered as a dependency, and the installed version updates when the user explicitly runs a Marketplace update command. Not a one-time copy. Installation scope determines where the Plugin lands (see *Installation Scope*).

### Installation Scope
The target environment where an installed Plugin's Skills and Sub-agents become available. Three scopes exist:
- **user** — available across all of the user's projects (`~/.claude/`)
- **project** — shared with all collaborators on a repository (committed to `.claude/settings.json`)
- **local** — available in the current project for the current user only (gitignored)

*Terms are added here as they are resolved during domain modelling sessions.*
