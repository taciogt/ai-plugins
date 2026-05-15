# Plugin naming: `deliver` and `craft`

The two plugins are named `deliver` (formerly `dev-workflow`) and `craft` (formerly `claude-productivity`). The original names were rejected for being long and vague — `dev-workflow` describes the shape of a process, not its purpose; `claude-productivity` describes a vague outcome for a vague audience.

`deliver` captures the full cycle of the plugin's skills (plan → implement → validate → review → ship → fix-ci): the point of all of it is to deliver working software. It was preferred over `ship` (collides with the `/ship` skill inside the plugin) and `craft` (fits the artisanal framing but breaks down for operational skills like `fix-ci` and `plan-issue`).

`craft` captures the meta-layer purpose of its plugin: building and improving the Claude toolchain itself (authoring skills, auditing sessions, finding docs). It was preferred over `studio` and `meta` because it emphasises intentional construction over mere tooling or abstraction. The name is deliberately non-obvious about its Claude-specific scope — the assumption is that a personal marketplace needs clarity for its owner, not for strangers browsing a registry.
