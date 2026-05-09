# Plugin Self-containment

A Plugin must not depend on Skills or Sub-agents defined in another Plugin. All components a Plugin needs must be defined within it; shared logic is either duplicated or extracted into a Skill inside one of the Plugins.

This keeps installation atomic — installing a Plugin has no hidden prerequisites — and prevents version mismatch bugs where two Plugins that depend on each other advance at different rates. The cost is intentional duplication over DRY, which is acceptable given the small scale of this marketplace and the low rate of change across Plugin boundaries.
