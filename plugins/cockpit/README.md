# cockpit

A Claude Code **mod** (a hooks module, not skills or agents) that draws a compact, readable session status as one row above the prompt. It is meant to live alongside or replace a multi-line status line.

```
Opus 5.5·high │ ctx ▰▰▰▱▱▱▱▱ 38% 76k │ 5h ▰▰▰┃▱▱ 60% ⚠1h20 ↻3h00 · 7d ▰┃▱▱▱▱ 20% │ main ±3 ↑1 │ ~$0.42 │ last 4m12 · 7 tools
```

## What it shows

- **Model · effort · output style.** The style is shown only when it is not the default.
- **Context.** A bar, the percentage and the token count. Green under 70%, yellow from 70% to 89%, red at 90% and above. `⟳N` appears only after compactions.
- **Rate limits (5h, 7d) with pace.** The bar fills with usage, and the `┃` cursor marks how much of the window has elapsed. Fill past the cursor means you are using quota faster than the window drains. The color reflects the projected usage at reset: green ≤85%, yellow up to 100%, red when it would run out. `⚠` gives the time until the quota runs out at the current pace. `↻` gives the time to reset and appears once usage passes 50% or is at risk.
- **Git.** Branch, `⑂worktree` when you are in a worktree, `±N` changed files (`✓` when clean), and `↑`/`↓` for commits ahead of and behind the remote.
- **Cost.** A client-side estimate. On a subscription, usage inside the plan is not billed.
- **Last turn.** Duration and number of tool calls.

On narrow windows (under 100 columns), the bars, the token count, the cost and the last turn are dropped.

## Alerts

A toast fires once when context reaches 85% and once when the 5h limit reaches 80%. Each alert re-arms after its value drops back below the threshold.

## Command

- `/cockpit` opens a side pane with the details: the context broken down by category, each limit with its pace and when it resets, git, cost and the last turn.
- `/cockpit hide` and `/cockpit show` toggle the band.

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
