# Per-plugin Versioning

Plugins are versioned independently rather than versioning the Marketplace as a whole. A breaking change to `deliver` advances its version without affecting `craft`.

The Marketplace is a container for distribution, not a product with a release cycle. Versioning it as a unit would couple unrelated Plugins and force consumers to reason about Marketplace versions instead of the Plugin they actually depend on. Per-plugin versioning aligns with the Plugin being the unit of installation.

## Consequences

Claude Code detects an update by comparing a Plugin's computed version with the installed one. Each Plugin takes one of two modes, set by whether its `plugin.json` has a `version` field:

- **Pinned** (`version` set, e.g. `cockpit`): installed users stay on their cached copy until the string changes. Every change to a shipped file must bump `version` in the same push, or it never reaches them.
- **Tracking** (no `version`, e.g. `craft`, `deliver`): the version is the commit SHA, so every pushed commit is an update and no bump is needed.

Never set `version` in the Marketplace entry as well: `plugin.json` wins silently.

### Bump rule (pinned Plugins)

Semver, decided by what an installed user notices:

- **patch**: a fix or wording change with no new behaviour.
- **minor**: new or changed behaviour (a new skill, command, segment, option). Below 1.0, a breaking change is also minor.
- **major** (from 1.0): a removed or renamed skill, command, agent or setting.

Shipped files are everything under `plugins/<name>/` except `tests/`, `tsconfig.json` and `.gitignore`. `scripts/check-plugin-versions.sh` enforces the bump, run by the pre-push hook and CI.
