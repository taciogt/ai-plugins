# Per-plugin Versioning

Plugins are versioned independently rather than versioning the Marketplace as a whole. A breaking change to `deliver` advances its version without affecting `craft`.

The Marketplace is a container for distribution, not a product with a release cycle. Versioning it as a unit would couple unrelated Plugins and force consumers to reason about Marketplace versions instead of the Plugin they actually depend on. Per-plugin versioning aligns with the Plugin being the unit of installation.

## Consequences

The `plugin.json` manifest must include a `version` field. As of this writing it does not — that is a gap to close before versioning is formally enforced.
