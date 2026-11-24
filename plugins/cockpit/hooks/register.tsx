import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Git, Limit, Snapshot } from '../types'

const PANE = 'cockpit'
const CTX_ALERT = 85
const FIVE_HOUR_ALERT = 80
const GIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])

// Change the tag when Snapshot's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snap = atom({ plugin: 'cockpit', key: 'snap' } as const, null, {
  shape: 'snap-1',
})
const isHidden = atom({ plugin: 'cockpit', key: 'isHidden' } as const, false)

const EMPTY: Snapshot = {
  model: '',
  ctxWindow: 0,
  categories: [],
  limits: [],
  compactions: 0,
  git: null,
  alerted: { ctx: false, fiveHour: false },
}

// ---------- formatting ----------

const LIMIT_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

const bar = (percent: number, cells: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

const ctxColor = (p: number) => (p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success')
const limitColor = (p: number) => (p >= 80 ? 'error' : p >= 50 ? 'warning' : 'success')

const kTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`

const duration = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

const seconds = (s: number) =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`)

const untilReset = (limit: Limit, now: number) => {
  const at = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  return Number.isNaN(at) ? undefined : duration(at - now)
}

const shortModel = (model: string) => model.replace(/^Claude\s+/i, '')

// ---------- pace: where usage would end at the current rate ----------

const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * 24 * 3_600_000,
}

type Pace = {
  elapsed: number // 0..1 of the window gone
  projected: number // % used at reset if the current rate holds
  runsOutInMs?: number // when the quota ends at this rate, if before reset
  resetInMs: number
}

const pace = (limit: Limit, now: number): Pace | undefined => {
  const length = WINDOW_MS[limit.kind]
  const at = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  if (!length || Number.isNaN(at)) return undefined

  const resetInMs = Math.max(0, at - now)
  const elapsedMs = Math.min(length, Math.max(0, length - resetInMs))
  const elapsed = elapsedMs / length
  // Too early in the window for the rate to mean anything.
  if (elapsed < 0.03) return { elapsed, projected: limit.percent, resetInMs }

  const projected = limit.percent / elapsed
  const rate = limit.percent / elapsedMs
  const runsOutInMs =
    projected > 100 && rate > 0 ? Math.max(0, (100 - limit.percent) / rate) : undefined
  return { elapsed, projected, runsOutInMs, resetInMs }
}

const paceColor = (limit: Limit, p?: Pace) => {
  if (limit.percent >= 90) return 'error'
  if (!p) return limitColor(limit.percent)
  return p.projected > 100 ? 'error' : p.projected > 85 ? 'warning' : 'success'
}

// Usage bar with a cursor at the share of the window already gone:
// fill behind the cursor = under pace, fill past it = over pace.
const paceBar = (percent: number, elapsed: number | undefined, cells: number) => {
  const chars = bar(percent, cells).split('')
  if (elapsed !== undefined) {
    chars[Math.min(cells - 1, Math.floor(elapsed * cells))] = '┃'
  }
  return chars.join('')
}

// ---------- collecting ----------

const readGit = async ($: EngineInterface): Promise<Git | null> => {
  try {
    const status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], {
      timeoutMs: 5000,
    })
    if (status.exitCode !== 0) return null

    let branch = '?'
    let ahead = 0
    let behind = 0
    let changes = 0
    for (const line of status.stdout.split('\n')) {
      if (line.startsWith('# branch.head ')) branch = line.slice(14).trim()
      else if (line.startsWith('# branch.ab ')) {
        const [a, b] = line.slice(12).trim().split(' ')
        ahead = Math.abs(Number(a)) || 0
        behind = Math.abs(Number(b)) || 0
      } else if (line.length > 0 && !line.startsWith('#')) changes += 1
    }
    if (branch === '(detached)') branch = 'detached'

    const dirs = await $.process.run(
      ['git', 'rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir'],
      { timeoutMs: 5000 },
    )
    const [top, gitDir, commonDir] = dirs.stdout.trim().split('\n')
    const isWorktree = dirs.exitCode === 0 && gitDir !== commonDir && !!top
    const worktree = isWorktree ? top.split('/').pop() : undefined

    return { branch, changes, ahead, behind, worktree }
  } catch {
    return null
  }
}

const refresh = async ($: EngineInterface, withBreakdown = false) => {
  const usage = await $.session.usage(withBreakdown ? { breakdown: 'summary' } : undefined)
  const model = await $.session.model()
  const git = await readGit($)
  const categories = withBreakdown
    ? (usage.context.breakdown?.categories ?? [])
        .filter((c) => !c.isDeferred && c.kind !== 'free' && c.tokens > 0)
        .map((c) => ({ name: c.name, tokens: c.tokens }))
    : undefined

  await update($, snap, prev => {
    const base = prev ?? EMPTY
    return {
      ...base,
      model,
      ctxPercent: usage.context.percent,
      ctxTokens: usage.context.tokens,
      ctxWindow: usage.context.window,
      limits: usage.rateLimits.map((l) => ({
        kind: l.kind,
        percent: l.percentUsed,
        resetsAt: l.resetsAt,
      })),
      costUsd: usage.cost?.usd,
      git,
      categories: categories ?? base.categories,
    }
  })
}

const refreshGit = async ($: EngineInterface) => {
  const git = await readGit($)
  await update($, snap, prev => ({ ...(prev ?? EMPTY), git }))
}

const alert = async ($: EngineInterface) => {
  const s = await read($, snap)
  if (!s) return
  const ctx = s.ctxPercent ?? 0
  const fiveHour = s.limits.find(l => l.kind === 'five_hour')?.percent ?? 0
  const alerted = { ...s.alerted }

  if (ctx >= CTX_ALERT && !alerted.ctx) {
    $.ui.toast(`Context at ${ctx}% — consider /compact or a fresh session`)
    alerted.ctx = true
  } else if (ctx < CTX_ALERT) alerted.ctx = false

  if (fiveHour >= FIVE_HOUR_ALERT && !alerted.fiveHour) {
    $.ui.toast(`5h limit at ${Math.round(fiveHour)}%`)
    alerted.fiveHour = true
  } else if (fiveHour < FIVE_HOUR_ALERT) alerted.fiveHour = false

  await update($, snap, prev => ({ ...(prev ?? EMPTY), alerted }))
}

// ---------- hooks ----------

export const register: Register = on => {
  let turnStartedAt = 0
  let turnTools = 0

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'cockpit',
      description: 'Session cockpit: open details pane, or "hide"/"show" the band',
    })
    await refresh($)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    turnTools = 0
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const style = e.outputStyle?.name
    await update($, snap, prev => ({ ...(prev ?? EMPTY), style }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      const effort = String(e.effort)
      await update($, snap, prev => ({ ...(prev ?? EMPTY), effort }))
    }
    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) turnTools += 1
    const ran = await next(e)
    if (GIT_TOOLS.has(e.tool)) await refreshGit($)
    return ran
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute') {
      await update($, snap, prev => {
        const base = prev ?? EMPTY
        return { ...base, compactions: base.compactions + 1 }
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    const secs = turnStartedAt ? Math.round(((await $.clock.now()) - turnStartedAt) / 1000) : 0
    const tools = turnTools
    await update($, snap, prev => ({ ...(prev ?? EMPTY), lastTurn: { seconds: secs, tools } }))
    await refresh($, true)
    await alert($)
    return result
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      return { text: `Cockpit band ${arg === 'hide' ? 'hidden' : 'shown'}.` }
    }
    await refresh($, true)
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Cockpit' })
    return {
      text: isPlaced
        ? 'Cockpit pane opened.'
        : 'Cockpit pane opened; it shows once the window is wide enough.',
    }
  })

  // ---------- band above the prompt ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    if (e.props.hasSurvey || s === null || s.model === '' || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const width = e.props.bodyColumns
    const isNarrow = width < 100
    const sep = <Text dimColor> │ </Text>

    const ctx = s.ctxPercent
    const limits = s.limits.filter(l => LIMIT_LABEL[l.kind])
    const git = s.git

    return (
      <Box flexDirection="row" flexWrap="wrap">
        <Text color="claude" bold>{shortModel(s.model)}</Text>
        {s.effort && <Text dimColor>·{s.effort}</Text>}
        {s.style && s.style !== 'default' && <Text dimColor>·{s.style}</Text>}

        {sep}
        <Text dimColor>ctx </Text>
        {ctx === undefined ? (
          <Text dimColor>—</Text>
        ) : (
          <Text color={ctxColor(ctx)}>
            {isNarrow ? '' : `${bar(ctx, 8)} `}
            {ctx}%
          </Text>
        )}
        {!isNarrow && s.ctxTokens !== undefined && (
          <Text dimColor> {kTokens(s.ctxTokens)}</Text>
        )}
        {s.compactions > 0 && <Text color="warning"> ⟳{s.compactions}</Text>}

        {limits.length > 0 && sep}
        {limits.map((l, i) => {
          const p = pace(l, now)
          const isAtRisk = p?.runsOutInMs !== undefined
          const reset = l.percent >= 50 || isAtRisk ? untilReset(l, now) : undefined
          return (
            <Text>
              {i > 0 && <Text dimColor> · </Text>}
              <Text dimColor>{LIMIT_LABEL[l.kind]} </Text>
              <Text color={paceColor(l, p)}>
                {isNarrow ? '' : `${paceBar(l.percent, p?.elapsed, 6)} `}
                {Math.round(l.percent)}%
              </Text>
              {isAtRisk && <Text color="error"> ⚠{duration(p.runsOutInMs ?? 0)}</Text>}
              {reset && <Text dimColor> ↻{reset}</Text>}
            </Text>
          )
        })}

        {git && sep}
        {git && <Text color="permission">{git.branch}</Text>}
        {git?.worktree && <Text dimColor> ⑂{git.worktree}</Text>}
        {git && (git.changes > 0 ? <Text color="warning"> ±{git.changes}</Text> : <Text color="success"> ✓</Text>)}
        {git && git.ahead > 0 && <Text dimColor> ↑{git.ahead}</Text>}
        {git && git.behind > 0 && <Text color="warning"> ↓{git.behind}</Text>}

        {s.costUsd !== undefined && s.costUsd > 0 && !isNarrow && sep}
        {s.costUsd !== undefined && s.costUsd > 0 && !isNarrow && (
          <Text dimColor>~{usd(s.costUsd)}</Text>
        )}

        {s.lastTurn && !isNarrow && sep}
        {s.lastTurn && !isNarrow && (
          <Text dimColor>
            last {seconds(s.lastTurn.seconds)} · {s.lastTurn.tools} tools
          </Text>
        )}
      </Box>
    )
  })

  // ---------- details pane ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    if (s === null) return <Text dimColor>Waiting for the first turn…</Text>

    const now = await $.clock.now()
    const cols = Math.max(20, e.props.bodyColumns)
    const barCells = Math.max(8, Math.min(30, cols - 14))
    const ctx = s.ctxPercent ?? 0
    const topCats = [...s.categories].sort((a, b) => b.tokens - a.tokens).slice(0, 8)
    const catTotal = s.categories.reduce((sum, c) => sum + c.tokens, 0) || 1

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Model</Text>
          <Text>
            <Text color="claude">{shortModel(s.model)}</Text>
            {s.effort && <Text dimColor> · effort {s.effort}</Text>}
          </Text>
          {s.style && <Text dimColor>style: {s.style}</Text>}
        </Box>

        <Box flexDirection="column">
          <Text bold>Context</Text>
          <Text color={ctxColor(ctx)}>
            {bar(ctx, barCells)} {s.ctxPercent ?? '—'}%
          </Text>
          <Text dimColor>
            {s.ctxTokens !== undefined ? kTokens(s.ctxTokens) : '—'} of {kTokens(s.ctxWindow)} tokens
            {s.compactions > 0 ? ` · ${s.compactions} compaction(s)` : ''}
          </Text>
          {topCats.map(c => (
            <Text dimColor wrap="truncate-end">
              {String(Math.round((c.tokens / catTotal) * 100)).padStart(3)}%  {c.name} ({kTokens(c.tokens)})
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>Rate limits</Text>
          {s.limits.length === 0 && <Text dimColor>No reading yet.</Text>}
          {s.limits.map(l => {
            const reset = untilReset(l, now)
            const p = pace(l, now)
            return (
              <Box flexDirection="column">
                <Text>
                  <Text dimColor>{(LIMIT_LABEL[l.kind] ?? l.kind).padEnd(6)}</Text>
                  <Text color={paceColor(l, p)}>
                    {paceBar(l.percent, p?.elapsed, Math.min(20, barCells))} {Math.round(l.percent)}%
                  </Text>
                  {reset && <Text dimColor>  resets in {reset}</Text>}
                </Text>
                {p && p.elapsed >= 0.03 && (
                  <Text color={p.runsOutInMs !== undefined ? 'error' : undefined} dimColor={p.runsOutInMs === undefined}>
                    {'      '}
                    {Math.round(p.elapsed * 100)}% of window gone ·{' '}
                    {p.runsOutInMs !== undefined
                      ? `at this pace runs out in ${duration(p.runsOutInMs)}, ${duration(p.resetInMs - p.runsOutInMs)} before reset`
                      : `on pace to end at ~${Math.round(p.projected)}%`}
                  </Text>
                )}
              </Box>
            )
          })}
        </Box>

        {s.git && (
          <Box flexDirection="column">
            <Text bold>Git</Text>
            <Text>
              <Text color="permission">{s.git.branch}</Text>
              {s.git.worktree && <Text dimColor>  worktree {s.git.worktree}</Text>}
            </Text>
            <Text dimColor>
              {s.git.changes === 0 ? 'clean' : `${s.git.changes} changed file(s)`} · ↑{s.git.ahead} ↓{s.git.behind}
            </Text>
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>Session</Text>
          {s.costUsd !== undefined && <Text dimColor>cost ~{usd(s.costUsd)} (estimate)</Text>}
          {s.lastTurn && (
            <Text dimColor>
              last turn {seconds(s.lastTurn.seconds)} · {s.lastTurn.tools} tool call(s)
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}
