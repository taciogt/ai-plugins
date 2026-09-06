# Issue tracker: Linear

Issues, PRDs, and wayfinder maps for this repo live in **Linear**, in the **Home Finances** team
(the only team in this workspace — the name is historical, not a scope constraint). Use the
`linear-server` MCP tools for all operations.

The MCP server is registered at **local scope** for this project. If the `mcp__linear-server__*`
tools are not present in a session, they were not loaded at session start — start a fresh session,
or run `ToolSearch "+linear"` to load their schemas.

## Conventions

- **Create an issue**: `save_issue` with `title` and `team: "Home Finances"` (both required on create).
  Omit `id` — passing it switches the call to update mode.
- **Update an issue**: `save_issue` with `id` (e.g. `HF-81`).
- **Read an issue**: `get_issue` with `id`. Pass `includeRelations: true` to see blocking edges —
  they are **not** returned by default, and `save_issue` does not echo them back either.
- **List issues**: `list_issues`, filtered by `project`, `parentId`, `state`, `assignee`, or `label`.
- **Comment**: `save_comment` with `issueId` and `body`.
- **Labels**: `list_issue_labels` / `create_issue_label`.

### Workflow states

This team's states are `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`.

Linear has no "open" state — it groups states by *type* (`backlog`, `unstarted`, `started`,
`completed`, `canceled`). Wherever a skill says **open**, read it as "not `Done` and not `Canceled`".
Since `state` accepts one value, express "open" by listing the states you want rather than trying to
negate. Wayfinder tickets are created in **`Todo`** and closed to **`Done`**.

### Two footguns

1. **`save_issue(labels:)` replaces the entire label set.** Any label not included is removed.
   When claiming a ticket or wiring blockers, **omit `labels` entirely** — otherwise you will strip
   the `wayfinder:<type>` label off the ticket.
2. **`blockedBy` / `blocks` are append-only.** They never remove existing relations. Use
   `removeBlockedBy` / `removeBlocks` for that.

## When a skill says "publish to the issue tracker"

Create a Linear issue in the **Home Finances** team.

## When a skill says "fetch the relevant ticket"

`get_issue` with the identifier, plus `list_comments` for the discussion.

## Wayfinding operations

Used by `/wayfinder`. Linear has both projects and parent/child issues, so an effort uses **both**:
a **Project** is the container and gives the effort its own board and URL; the **map** is a single
issue inside it, and tickets are that map issue's children.

The map body must live on the **map issue**, not the project description — wayfinder appends to
Decisions-so-far, and the `wayfinder:map` label plus `parentId` are what make the frontier query
work at all.

- **Project**: `save_project` with `name` and `addTeams: ["Home Finances"]`. Its description should
  point at the map issue and nothing else.

- **Map**: an issue in that project labelled `wayfinder:map`, holding the Destination / Notes /
  Decisions-so-far / Not-yet-specified / Out-of-scope body. Set it to `In Progress` for the life of
  the effort.

  ```
  save_issue(team: "Home Finances", project: "<project>", title: "Map — <effort>",
             labels: ["wayfinder:map"], state: "In Progress", description: "<map body>")
  ```

- **Child ticket**: an issue with `parentId: "<map id>"`, in the same project, in `Todo`.
  Labels: `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`), plus this workspace's
  existing `AFK` / `HITL` labels — `research` is AFK, the rest are HITL unless the ticket says
  otherwise.

  ```
  save_issue(team: "Home Finances", project: "<project>", parentId: "<map id>",
             labels: ["wayfinder:grilling", "HITL"], state: "Todo", ...)
  ```

- **Blocking**: Linear's **native** blocking relation, which renders in Linear's own UI so the
  frontier is visible without opening the map. Wire it in a **second pass**, after the issues have
  ids:

  ```
  save_issue(id: "HF-81", blockedBy: ["HF-77", "HF-79"])   # no `labels` — it would strip them
  ```

  A ticket is **unblocked** when every issue in its `blockedBy` is `Done` or `Canceled`.

- **Frontier query**: the map's children that are open, unblocked, and unclaimed.

  ```
  list_issues(parentId: "<map id>", state: "Todo", assignee: null)
  ```

  then, for each result, `get_issue(id, includeRelations: true)` and drop any whose `blockedBy`
  contains an issue that is not yet `Done`/`Canceled`. First in map order wins.

- **Claim**: `save_issue(id: "<ticket>", assignee: "me", state: "In Progress")` — the session's
  first write, before any work. Omit `labels`. The assignee *is* the claim.

- **Resolve**: `save_comment(issueId: "<ticket>", body: "<the answer>")`, then
  `save_issue(id: "<ticket>", state: "Done")`, then append a one-line context pointer
  (gist + link, referring to the ticket **by title**) to the map issue's Decisions-so-far section.

- **Rule out of scope**: `save_issue(id, state: "Canceled")` and add one line to the map's
  **Out of scope** section. It does **not** go in Decisions-so-far.

## Active maps

- **[Map — Eval strategy for the ai-plugins marketplace](https://linear.app/taciogt/issue/HF-76/map-eval-strategy-for-the-ai-plugins-marketplace)**
  in project [Skill Evals for ai-plugins](https://linear.app/taciogt/project/skill-evals-for-ai-plugins-eb0ecfa1d992)
  — charted 2026-07-29.
