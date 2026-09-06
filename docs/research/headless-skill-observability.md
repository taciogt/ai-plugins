# Headless skill observability

Research note for **HF-77 — "Can a headless Claude run tell us which skill fired?"**
<https://linear.app/taciogt/issue/HF-77/can-a-headless-claude-run-tell-us-which-skill-fired>

Researched 2026-07-29 against Claude Code **2.1.220** (`claude --version`). Every empirical claim
below is tagged with the command that produced it; the spike ran in a scratchpad directory, not in
this repo.

---

## The question

Is skill selection observable **programmatically** from a non-interactive Claude Code run? If we
launch `claude -p "<query>"` (or the Agent SDK equivalent) in a directory with plugins installed,
can we determine from its output — not by eyeballing a transcript — which skill, if any, was
invoked, and in what order?

---

## Verdict

**YES — partially, with one sharp caveat that inverts the naive answer.**

Model-chosen skill invocation is fully structured and machine-readable. A skill the model selects is
a real `tool_use` block named `Skill` with `input.skill` carrying the skill name. It is visible in
`--output-format stream-json`, in the on-disk transcript JSONL, and to a `PreToolUse` hook.

The caveat: **explicit slash invocation (`/caveman ...`) is expanded client-side and emits no `Skill`
tool_use at all** — not in the stream, not on disk, not to any hook. It is recoverable only from a
`<command-name>` marker inside the on-disk user message. For an eval harness this is *good* news, as
long as prompts are phrased in natural language: the presence of a `Skill` tool_use is then an
unambiguous signal that the **model chose** the skill rather than the operator naming it.

Two clean negatives:

- `--output-format json` gives you **nothing** — prose plus metadata, zero tool records.
- **"Considered but rejected" is not recoverable.** Only the winner is emitted.

---

## Per-channel findings

### 1. What `--output-format json` and `--output-format stream-json` actually emit

#### `--output-format json` — negative result

Command run:

```
claude -p "Reply with exactly: OK" --model sonnet --output-format json \
  --session-id 11111111-1111-4111-8111-111111111111 --max-budget-usd 0.5
```

Emits exactly one JSON object. Its keys: `is_error`, `duration_api_ms`, `num_turns`, `stop_reason`,
`session_id`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials`, `terminal_reason`,
`subtype`, `api_error_status`, `result`, `ttft_ms`, `type`, `duration_ms`, `uuid`.

There is **no per-tool record of any kind**. `result` is the final assistant prose. This format
cannot answer HF-77. Confirmed by the run above.

`--json-schema` does not help either — per `claude --help` it is "JSON Schema for structured output
validation", i.e. it constrains the shape of the **final answer**, not the tool record stream. Ruled
out; do not revisit.

#### `--output-format stream-json` — positive result

Command run (natural-language phrasing that lets the model choose):

```
claude -p "Explain in one sentence what git rebase does. Use caveman mode." \
  --model sonnet --output-format stream-json --verbose \
  --session-id 22222222-2222-4222-8222-222222222222 --max-budget-usd 0.5
```

Observed event sequence (`type` / `subtype`):

```
system  hook_started
system  hook_response
system  init
assistant  -
assistant  -     <- Skill tool_use
user  -
user  -
rate_limit_event  -
assistant  -
result  success
```

The skill firing is this record (verbatim, trimmed for readability):

```json
{"type":"assistant","message":{"model":"claude-sonnet-5","role":"assistant",
 "content":[{"type":"tool_use","id":"toolu_01MiAigJmmaGMSE3s3cCcYeZ",
             "name":"Skill","input":{"skill":"caveman"},
             "caller":{"type":"direct"}}]},
 "parent_tool_use_id":null,
 "session_id":"22222222-2222-4222-8222-222222222222",
 "uuid":"c927c62b-ba30-41dc-b4ab-d60f88ce6084",
 "timestamp":"2026-07-29T12:33:26.979Z"}
```

Followed by a matching `tool_result` with `content: "Launching skill: caveman"`, then a `user`
record carrying the skill body text.

**This is everything the ticket asks for**: skill identity (`input.skill`), ordering (record order +
`timestamp`), correlation (`id` / `tool_use_id`), and attribution (`parent_tool_use_id`).

`--verbose` was passed alongside `stream-json`; it is required in some versions and harmless here.

##### The `system/init` event is a free bonus

The first `system` record with `subtype: "init"` carries the full **candidate inventory** before any
model turn. Its keys: `agents`, `analytics_disabled`, `apiKeySource`, `capabilities`,
`claude_code_version`, `cwd`, `mcp_servers`, `memory_paths`, `model`, `output_style`,
`permissionMode`, `plugins`, `session_id`, `skills`, `slash_commands`, `subtype`, `tools`, `type`,
`uuid`.

In the spike, `.skills | length` was **70** and `.agents` was
`["claude","Explore","general-purpose","Plan","statusline-setup"]`. An eval harness should record
this — it is the denominator for any selection-accuracy metric, and it proves the target skill was
actually loaded and eligible.

#### The discriminating test: slash vs natural language

Same skill, same question, invoked explicitly:

```
claude -p "/caveman Explain in one sentence what git rebase does." \
  --model sonnet --output-format stream-json --verbose \
  --session-id 33333333-3333-4333-8333-333333333333 --max-budget-usd 0.5
```

Observed sequence — **no `Skill` tool_use anywhere**:

```
system  hook_started
system  hook_response
system  init
system  thinking_tokens
system  thinking_tokens
assistant  -
assistant  -
rate_limit_event  -
result  success
```

The skill nevertheless **did** take effect. Compare the two `result` strings:

- run 2 (natural language): `Rebase move commits from branch, replay on top new base -> straight history, no merge bump.`
- run 3 (slash): `Rebase = take commits, replay on top new base -> straight history, no merge bump.`

Both are unmistakably caveman-styled. The skill fired; the observation channel simply did not see it,
because slash commands are expanded client-side into the user message rather than routed through the
`Skill` tool.

**Consequence for an eval harness: phrase eval prompts in natural language.** Slash-invoked runs are
untestable through the stream channel, and are in any case not a test of skill *selection*.

### 2. Does the Claude Agent SDK expose skill/tool selection as structured data?

Yes. The SDK surfaces the same message stream as typed objects.

- `SDKAssistantMessage` has `type: "assistant"`, `uuid`, `session_id`, `message` (a `BetaMessage`
  from the Anthropic SDK, whose `content` array carries the `tool_use` blocks), and
  **`parent_tool_use_id: string | null`**.
  Source: <https://code.claude.com/docs/en/agent-sdk/typescript>

- Interception is available two ways:
  - **`canUseTool`** — a callback taking `toolName`, `input`, and options including `toolUseID` and
    `agentID`. The docs warn it is *not* a complete channel: "Tool calls already approved by
    `allowedTools`, a settings allow rule, or the permission mode never invoke it; to gate every tool
    call, use a `PreToolUse` hook instead."
    Source: <https://code.claude.com/docs/en/agent-sdk/typescript>
  - **`options.hooks`** — callback hooks registered in-process, plus shell-command hooks loaded from
    settings files when the matching `settingSources` / `setting_sources` entry is enabled (which it
    is for default `query()` options).
    Source: <https://code.claude.com/docs/en/agent-sdk/hooks>

**Gotcha — the SDK hook surface is a subset of the CLI's.** The Python SDK's `HookEvent` type omits
`SessionStart` and `SessionEnd`; they are TypeScript-only as callback hooks, and in Python are
reachable only as shell-command hooks defined in `.claude/settings.json`.
Source: <https://code.claude.com/docs/en/agent-sdk/hooks>

The SDK equivalent of `--include-hook-events` is the `includeHookEvents` option
(`include_hook_events` in Python). Without it, "the SDK surfaces hook output in the message stream
only for `SessionStart` and `Setup` hooks."
Source: <https://code.claude.com/docs/en/agent-sdk/hooks>

### 3. Can a hook serve as the observation channel? And what events exist?

**Yes — and this is the richest channel.** There is no skill-specific hook event, but `PreToolUse`
with matcher `Skill` works precisely, because skill invocation *is* a tool call.

#### Enumeration of hook events (primary source, not memory)

From <https://code.claude.com/docs/en/hooks> — 29 events in the CLI:

`SessionStart`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`,
`PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`,
`Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`,
`Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`,
`FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`,
`ElicitationResult`.

The Agent SDK exposes a narrower set (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
`PostToolBatch`, `UserPromptSubmit`, `UserPromptExpansion`, `MessageDisplay`, `Stop`, `StopFailure`,
`SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `PermissionRequest`,
`PermissionDenied`, `SessionStart`, `SessionEnd`, `Notification`, `Setup`, `TeammateIdle`,
`TaskCreated`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`), with a
Python/TypeScript availability split per event.
Source: <https://code.claude.com/docs/en/agent-sdk/hooks>

**There is no skill-specific hook event.** Hooks *can* be declared inside a skill's own frontmatter,
but those are scoped to that skill's lifecycle and are not a separate event type.
Source: <https://code.claude.com/docs/en/hooks>

#### Empirical verification

Settings written to scratchpad (never to this repo) and passed with `--settings`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Skill|Task|Agent", "hooks": [ { "type": "command", "command": "<log-hook.sh>" } ] }
    ],
    "SubagentStart": [
      { "hooks": [ { "type": "command", "command": "<log-hook.sh>" } ] }
    ]
  }
}
```

where `log-hook.sh` is simply `cat >> hook-log.jsonl`. Command run:

```
claude -p "First, use caveman mode. Then dispatch ONE Explore subagent to list the filenames
           in this directory. Report what it found." \
  --model sonnet --output-format stream-json --verbose --include-hook-events \
  --settings <scratchpad>/settings.json \
  --session-id 44444444-4444-4444-8444-444444444444 \
  --max-budget-usd 1.0 --permission-mode bypassPermissions
```

The hook received (verbatim, subset of fields):

```json
{"hook_event_name":"PreToolUse","tool_name":"Skill",
 "tool_input":{"skill":"caveman"},
 "tool_use_id":"toolu_013koArHGKDaD7DJhL5D8GtC",
 "session_id":"44444444-4444-4444-8444-444444444444",
 "agent_type":null,"agent_id":null}
```

The documented `PreToolUse` payload also includes `prompt_id`, `transcript_path`, `cwd`,
`permission_mode`. Confirmed at <https://code.claude.com/docs/en/hooks>.

`tool_input.skill` gives the skill name directly — no parsing of prose required.

#### `--include-hook-events` fires unconditionally for configured hooks

`claude --help` documents it as: "Include all hook lifecycle events in the output stream (only works
with `--output-format=stream-json`)."

Empirically it emits `system` records with `subtype: "hook_started"` / `"hook_response"` carrying
`hook_event` and `hook_name`. In run 4 the stream showed:

```
system  hook_started   SessionStart  SessionStart:startup
system  hook_response  SessionStart  SessionStart:startup
system  hook_started   PreToolUse    PreToolUse:Skill
system  hook_response  PreToolUse    PreToolUse:Skill
system  hook_started   PreToolUse    PreToolUse:Agent
system  hook_response  PreToolUse    PreToolUse:Agent
system  hook_started   SubagentStart SubagentStart:Explore
system  hook_response  SubagentStart SubagentStart:Explore
```

The `hook_name` field encodes `Event:Matcher`, so `PreToolUse:Skill` and `SubagentStart:Explore` are
readable without even inspecting the hook's own output.

**These events reflect hooks that are actually configured** — they are a view onto hook execution,
not a synthetic event feed. Note that `hook_started` / `hook_response` records appeared in runs 2 and
3 *without* `--include-hook-events`, because user-level `SessionStart` hooks exist on this machine;
`--include-hook-events` is what makes `PreToolUse`-level records appear.

**Caveat:** `--bare` explicitly "skips hooks" per `claude --help`, and `--safe-mode` disables
customizations including hooks. Neither can be combined with a hook-based observation channel.

### 4. Is "the model considered but rejected skill X" recoverable?

**No. Only the winner is recoverable.**

Structurally: skill `description` and `when_to_use` are injected into the system prompt as an
inventory, and selection resolves inside a single forward pass. No per-candidate score, ranking, or
rejection record is emitted anywhere — not in the stream (whose full event vocabulary is enumerated
above), not in the hook payloads, not in the transcript JSONL. Nothing observed across five spike
runs contained a rejected-candidate record.

The *candidate set* is recoverable (`system/init.skills`, 70 entries in the spike), but that is the
menu, not the deliberation.

Thinking blocks are not a workaround. They are unstructured prose, they only exist when extended
thinking is engaged, and they are a narrative rather than a faithful record of what was weighed.
Treat them as inadmissible for an eval metric.

**The workable proxy: run N times and measure the distribution of winners.** Skill selection is
stochastic. A harness that runs each eval prompt N times and reports "skill X won 8/10, skill Y won
2/10" recovers, in aggregate, the near-miss information that a single run's introspection cannot
provide. This is the right shape for a trigger-accuracy metric anyway.

### 5. Sub-agent dispatch (the Agent/Task tool)

Sub-agent dispatch is observable through all the same channels, plus a dedicated hook event.

#### Naming gotcha: `Task` vs `Agent`

**The init event advertises `Task`; the actual `tool_use` record is named `Agent`.**

`system/init.tools` in run 3 listed: `Task, Bash, CronCreate, ..., Skill, TaskCreate, ...` — note
`Task`, and no `Agent`.

But the emitted tool call in run 4 was:

```json
{"hook_event_name":"PreToolUse","tool_name":"Agent",
 "tool_input":{"description":"List filenames in dir",
               "subagent_type":"Explore","run_in_background":false,"prompt":"..."}}
```

and the stream record was an `assistant` message whose `tool_use.name` was `Agent`. The same holds
in this repo's own interactive transcript
(`~/.claude/projects/-Users-tacio-projects-ai-plugins/ab32a94a-….jsonl`), where three dispatches all
recorded `name: "Agent"` with `input.subagent_type`.

**A `PreToolUse` matcher written as `Task` from the docs will silently never fire in 2.1.220.** Use
`Skill|Task|Agent` defensively — that is exactly what the spike used, and it is why both fired.

#### What you get

- **Stream / transcript:** `tool_use` named `Agent` with `input.subagent_type` (e.g. `"Explore"`,
  `"general-purpose"`) and `input.description`.
- **Hook:** `SubagentStart` fires with `agent_type` and `agent_id`:
  ```json
  {"hook_event_name":"SubagentStart","agent_type":"Explore",
   "agent_id":"a1e3f8f8cdfc083dd","tool_name":null,"tool_input":null}
  ```
  Its matcher matches on **agent type** (`general-purpose`, `Explore`, `Plan`, custom names,
  `^my-plugin:reviewer$`). Source: <https://code.claude.com/docs/en/hooks>
- **Stream lifecycle:** additional `system` subtypes `task_started`, `task_progress`,
  `task_updated`, `task_notification` bracket the dispatch.

#### Skills fired *inside* a subagent — the crux

This is where the channels diverge, and it decides the recommendation.

Command run:

```
claude -p "Dispatch ONE general-purpose subagent with this exact instruction:
           'Use caveman mode, then say in one sentence what git bisect does.'
           Report its answer verbatim. Do not use caveman mode yourself." \
  --model sonnet --output-format stream-json --verbose \
  --settings <scratchpad>/settings.json \
  --session-id 55555555-5555-4555-8555-555555555555 \
  --max-budget-usd 1.0 --permission-mode bypassPermissions
```

Results, three channels, same run:

| Channel | Sees the subagent's `Skill` firing? |
|---|---|
| `stream-json` | **Yes** — `Skill` / `caveman` with `parent_tool_use_id: toolu_01BBZnms4xbQxVRjeRyQ2Pfj` |
| `PreToolUse` hook | **Yes** — and payload carries `agent_type: "general-purpose"` |
| Main on-disk transcript JSONL | **No** — only the `Agent` tool_use appears |

The main transcript's tool_use sequence was just `Agent`. The subagent's `Skill` lived exclusively in
`…/55555555-…/subagents/agent-aca37bd9c7735bebe.jsonl`.

Two important corollaries:

1. **`--forward-subagent-text` is not required for this.** That flag is documented in `claude --help`
   as forwarding "subagent text and thinking blocks". Sub-agent **`tool_use` blocks are forwarded
   regardless**, tagged with `parent_tool_use_id`. Verified twice: run 4 forwarded the Explore
   agent's `Bash` call with `parent_tool_use_id: toolu_01Dw4jHeLjFijzMfKwLGNagV`, and run 5 forwarded
   the subagent's `Skill` call. Neither run passed the flag.
2. **A harness that reads only the top-level transcript JSONL undercounts skill firings**, silently,
   whenever a subagent is involved. It must walk `subagents/*.jsonl` too.

### 6. Is the on-disk session transcript JSONL a viable channel?

**Yes, with two significant caveats.**

Location: `~/.claude/projects/<slugified-cwd>/<session-id>.jsonl`. Pass `--session-id <uuid>` so the
harness knows the filename deterministically instead of guessing by mtime — this was essential to the
spike.

What it records for a model-chosen skill: the same `tool_use` block, structurally identical to the
stream. From this repo's interactive transcript:

```json
{"type":"assistant","uuid":"56267991-bbf9-46b8-9997-4af833177fff",
 "sessionId":"ab32a94a-e974-4db7-b84a-7ebbbdad5e78","isSidechain":false,
 "tu":[{"name":"Skill","input":{"skill":"mattpocock-skills:grilling"}}]}
```

Note the fully-qualified `plugin:skill` name — exactly the granularity a plugin-marketplace eval
needs.

Record `type`s observed in a real transcript: `assistant`, `user`, `attachment`, `system`,
`bridge-session`, `file-history-snapshot`, `file-history-delta`, `last-prompt`, `mode`,
`permission-mode`, `queue-operation`, `ai-title`.

#### Caveat A — slash invocations are here, but in a different shape

Run 3's transcript contained no `Skill` tool_use, but its user message was:

```
<command-message>caveman</command-message>
<command-name>/caveman</command-name>
<command-args>Explain in one sentence what git rebase does.</command-args>
[{"type":"text","text":"Base directory for this skill: /Users/tacio/.claude/skills/caveman ..."}]
```

So `<command-name>` is the on-disk marker for operator-invoked skills. This makes the transcript the
**only** channel that can distinguish "model chose it" from "operator named it" — a useful property,
but it requires string parsing rather than reading a typed field.

Also present in run 3's transcript: an `attachment` of type `skill_listing` with keys
`content`, `isInitial`, `names`, `skillCount` — the transcript's equivalent of `system/init.skills`.

#### Caveat B — subagents are separate files

Sub-agent turns are **not** inlined into the parent transcript in 2.1.220. They live at:

```
~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl
~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.meta.json
```

The `.meta.json` is a clean dispatch record:

```json
{"agentType":"general-purpose","description":"Research ephemeral plugin environment",
 "toolUseId":"toolu_01RFua51nzUBPr2U9AHDqQjv","spawnDepth":1}
```

`toolUseId` correlates back to the parent's `Agent` tool_use, and `spawnDepth` handles nesting.

**Do not rely on `isSidechain` as the subagent mechanism.** In this version it was absent from all
230 records of a real interactive transcript (`jq -r '.isSidechain // "none"' … | sort | uniq -c` →
`230 none`). Separate files are the mechanism in 2.1.220.

---

## Recommendation for an eval harness

**Primary channel: `--output-format stream-json --verbose`, parsing `tool_use` blocks where
`name == "Skill"`.**

Why this over the alternatives:

- It is a **single stream**, already ordered, already timestamped. No file-system slugification, no
  mtime races, no directory walking.
- It **includes subagent firings** with `parent_tool_use_id` attribution, for free — which the main
  transcript JSONL does not.
- It requires **zero configuration**: no hooks to install, no settings files, nothing written to the
  repo under test. That matters here, where the artifact under test *is* a plugin marketplace and
  contaminating it with harness config would confound the eval.
- The same shape is available in-process via the Agent SDK (`SDKAssistantMessage.message.content`),
  so a TS/Python harness and a shell harness see identical data.

Concretely, the harness should:

1. Run `claude -p "<natural-language prompt>" --output-format stream-json --verbose --model <m>
   --session-id <uuid> --max-budget-usd <cap>`.
2. Capture `system/init` → record `.skills` (candidate set), `.agents`, `.claude_code_version`,
   `.model`. Assert the target skill is present, so a "no fire" result is never a silent
   packaging bug.
3. Collect, in order, every `tool_use` with `name == "Skill"` → `(input.skill, id, parent_tool_use_id,
   timestamp)`. That list *is* the answer to HF-77: which skills fired, in what order, at which
   depth.
4. Also collect `name == "Agent"` → `(input.subagent_type, input.description)` for dispatch
   observability.
5. Read `result.total_cost_usd` and `result.subtype` for cost accounting and run validity.
6. Repeat each prompt **N times** and report the distribution of winners, since near-misses are not
   individually recoverable (see §4).

**Two rules the harness must obey:**

- **Phrase eval prompts in natural language, never as `/skill-name`.** Slash invocation emits no
  `Skill` tool_use and tests nothing about selection (§1).
- **Match `Skill|Task|Agent`** anywhere a tool-name matcher is written, because the advertised name
  (`Task`) and the emitted name (`Agent`) disagree in 2.1.220 (§5).

**Secondary channel, when durability across crashes or cross-process collection matters: a
`PreToolUse` hook with matcher `Skill`**, writing `tool_input.skill` to disk. Its unique advantage is
`agent_type` / `agent_id` in the payload, which names the subagent directly rather than requiring a
`parent_tool_use_id` join. Its cost is that it requires a settings file — acceptable if passed via
`--settings <path-outside-the-repo>` rather than committed. Incompatible with `--bare` and
`--safe-mode`.

**Tertiary / forensic only: the transcript JSONL.** Use it when you need to distinguish model-chosen
from operator-invoked skills (the `<command-name>` marker), or to reconstruct a run after the fact.
Do not make it the primary channel: it requires deterministic `--session-id`, cwd slugification, and
a walk of `subagents/*.jsonl` to avoid undercounting.

**Do not use `--output-format json`.** It contains no tool records at all (§1).

---

## Commands and sources

Empirical (all run 2026-07-29 against Claude Code 2.1.220, in a scratchpad directory):

- `claude --version` → `2.1.220 (Claude Code)`
- `claude --help` → flags `--output-format`, `--include-hook-events`, `--forward-subagent-text`,
  `--json-schema`, `--session-id`, `--settings`, `--bare`, `--safe-mode`, `--replay-user-messages`
- run 1 — `--output-format json` baseline (session `1111…`)
- run 2 — natural-language skill trigger, `stream-json` (session `2222…`)
- run 3 — slash invocation `/caveman`, `stream-json` (session `3333…`)
- run 4 — `--include-hook-events` + `PreToolUse`/`SubagentStart` hooks + subagent dispatch (session `4444…`)
- run 5 — skill fired inside a subagent (session `5555…`)
- `jq` inspection of `~/.claude/projects/-Users-tacio-projects-ai-plugins/*.jsonl` and of
  `<session>/subagents/agent-*.{jsonl,meta.json}`

Primary documentation:

- Claude Code hooks reference — <https://code.claude.com/docs/en/hooks>
- Agent SDK hooks — <https://code.claude.com/docs/en/agent-sdk/hooks>
- Agent SDK TypeScript reference — <https://code.claude.com/docs/en/agent-sdk/typescript>
- Agent SDK overview — <https://code.claude.com/docs/en/agent-sdk/overview>

## Validity notes

- All findings are pinned to **2.1.220**. The `Task`/`Agent` naming split and the
  separate-file subagent layout are both version-sensitive; re-verify on upgrade.
- The spike used `--model sonnet`. Selection behaviour may differ by model, which is another reason
  the harness should record `system/init.model`.
- `--permission-mode bypassPermissions` was used in runs 4 and 5 to keep the spike non-interactive.
  A real harness should prefer an explicit `--allowedTools` allowlist.
