# cockpit

A Claude Code **mod** (a hooks module, not skills or agents) that draws a compact, readable session status as one row above the prompt. It is meant to live alongside or replace a multi-line status line.

```
Opus 5.5·high │ ctx ██▓▓▒░░░░░░░▒▒ 38% 76k │ 5h ▰▰▰┃▱▱ 60% ⚠1h20 ↻3h00 · 7d ▰┃▱▱▱▱ 20% │ main ±3 ↑1  #42 ✗CI 💬3 │ ⚙2 │ ~$0.42 │ last 4m12 · 7 tools ⋯ ×
```

The band stays above the prompt while a turn runs, so it never flickers in and out.

## What it shows

- **Model · effort · output style.** The style is shown only when it is not the default.
- **Context.** A stacked bar with one colored segment per category (system prompt, tools, MCP, memory, messages…), with free space dimmed and the autocompact buffer as `▒`, followed by the percentage and the token count. The percentage is green under 70%, yellow from 70% to 89%, red at 90% and above. `⟳N` appears only after compactions.
- **Rate limits (5h, 7d) with pace.** The bar fills with usage, and the `┃` cursor marks how much of the window has elapsed. Fill past the cursor means you are using quota faster than the window drains. The color reflects the projected usage at reset: green ≤85%, yellow up to 100%, red when it would run out. `⚠` gives the time until the quota runs out at the current pace. `↻` gives the time to reset and appears once usage passes 50% or is at risk.
- **Git.** Branch, `⑂worktree` when you are in a worktree, `±N` changed files (`✓` when clean), and `↑`/`↓` for commits ahead of and behind the remote.
- **Pull request** of the current branch (via `gh`): `#n`, CI as `✓`/`✗`/`●` (pass/fail/running), `💬n` comments and reviews, `✔` approved or `✗rev` changes requested, `⚠conflict`.
- **Agents.** `⚙N` while subagents are running.
- **Cost.** A client-side estimate. On a subscription, usage inside the plan is not billed.
- **Last turn.** Duration and number of tool calls.

On narrow windows (under 100 columns), the bars, the token count, the cost and the last turn are dropped.

## Band buttons

Each segment of the band is a button. Click it, or focus the band (ctrl+x tab, or a click) and press its hotkey:

| Segment | Action | Hotkey |
|---|---|---|
| `ctx 38%` | Opens the pane on the Context section | `c` |
| `5h … · 7d …` | Toggles a detail row per limit under the band: pace, share of the window gone, reset | `l` |
| `main ±3` | Toggles a git detail row: ahead/behind and the changed files | `g` |
| `#42` | Opens the PR in the browser (a link, so click only) | — |
| `✗CI` | Fills the prompt with `/fix-ci 42` | `f` |
| `💬3` | Fills the prompt with a request to address the review comments | `r` |
| `⚙2` | Opens the pane on the Agents section | `a` |
| `⋯` / `×` | Opens the pane / hides the band (`/cockpit show` brings it back) | `o` / `x` |

The detail rows are useful under ~110 columns, where the pane can't open beside the chat. They are dropped when the band has no room left for them.

Hotkey hints (`c: ctx 38%`) appear once the band's focus lands on one of its buttons. The mod API has no event for the band losing focus, so the hints stay until you send a prompt or hide the band.

## Alerts

A toast fires once when context reaches 85% and once when the 5h limit reaches 80%. Each alert re-arms after its value drops back below the threshold.

## Command

- `/cockpit`, or the `⋯` button at the end of the band, opens a side pane. The `ctx` and `⚙` band buttons open it on their own section. Each section in the pane opens and closes by clicking its title, and the pane remembers which sections are closed across sessions.
  - **Session.** Model, effort, style, cost estimate and the last turn.
  - **Context.** A grid like `/context`'s, with a legend of tokens and share per category, the autocompact threshold, and a per-turn sparkline of context use where `⟳` marks a compaction. A **Compact** button runs `/compact`.
  - **Rate limits.** Each window with its pace cursor, how much of the window has elapsed, and whether the quota runs out before the reset.
  - **Git & PR.** Branch and worktree; the PR title, state, review decision and mergeability; failing and running checks; and the latest comments. Buttons: **Open PR**, **Fix CI** (fills the prompt with `/fix-ci <n>`), **Address comments** (fills the prompt with a request to address them) and **↻ refresh**.
  - **Agents.** Each subagent's status, model·effort, a context bar, tokens, elapsed time, cost and a sparkline of its token use.
- `/cockpit hide` and `/cockpit show` toggle the band.

The prompt-filling buttons only put text in the prompt, so you can edit it before sending.

## Data and refresh

The band refreshes after each turn. Git refreshes after edits and Bash calls. The PR is read with `gh pr view`, cached for 60 s, and re-read right after a `git push` or `gh pr` command. Agents are re-read as subagents make requests.

## Surfaces

Works in the terminal and in the desktop app's Code tab.

## Install

```
/plugin install cockpit --marketplace taciogt/ai-plugins
```

## Develop

```
claude plugin validate plugins/cockpit
claude plugin test plugins/cockpit
claude --plugin-dir plugins/cockpit
```
