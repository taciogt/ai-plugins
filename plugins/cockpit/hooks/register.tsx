import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type {
  AgentRow,
  Category,
  Cell,
  CheckState,
  Git,
  HistoryPoint,
  Limit,
  Pr,
  PrComment,
  Snapshot,
} from '../types'

const PANE = 'cockpit'
const CTX_ALERT = 85
const FIVE_HOUR_ALERT = 80
const GIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])
const PR_TTL_MS = 60_000
const AGENTS_TTL_MS = 2_000
const ACTIVE_AGENT = new Set(['pending', 'running', 'waiting'])

// Change the tag when Snapshot's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snap = atom({ plugin: 'cockpit', key: 'snap' } as const, null, {
  shape: 'snap-4',
})
const isHidden = atom({ plugin: 'cockpit', key: 'isHidden' } as const, false)
const collapsed = atom({ plugin: 'cockpit', key: 'collapsed' } as const, [])
const details = atom({ plugin: 'cockpit', key: 'details' } as const, [])
const bandFocus = atom({ plugin: 'cockpit', key: 'bandFocus' } as const, false)

const SECTIONS = ['session', 'context', 'limits', 'git', 'agents']
const GIT_FILES_MAX = 8

const EMPTY: Snapshot = {
  model: '',
  ctxWindow: 0,
  categories: [],
  grid: [],
  history: [],
  hasCompactedSincePoint: false,
  limits: [],
  compactions: 0,
  git: null,
  pr: null,
  agents: [],
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

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// ---------- context visuals ----------

type Run = { text: string; color?: string; dim: boolean }

const GLYPH: Record<Category['kind'], string> = { used: '█', free: '░', buffer: '▒' }

const kindColor = (kind: Category['kind'], color: string) =>
  kind === 'used' ? color : kind === 'buffer' ? 'warning' : undefined

// Stacked bar: each category gets cells in proportion to its tokens
// (largest-remainder rounding), drawn in its /context colour.
const stackedRuns = (categories: Category[], cells: number): Run[] => {
  const total = categories.reduce((sum, c) => sum + c.tokens, 0)
  if (total === 0) return []
  const exact = categories.map(c => (c.tokens / total) * cells)
  const counts = exact.map(Math.floor)
  let left = cells - counts.reduce((a, b) => a + b, 0)
  exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r)
    .forEach(({ i }) => {
      if (left > 0) {
        counts[i] = (counts[i] ?? 0) + 1
        left -= 1
      }
    })
  return categories
    .map((c, i) => ({
      text: GLYPH[c.kind].repeat(counts[i] ?? 0),
      color: kindColor(c.kind, c.color),
      dim: c.kind !== 'used',
    }))
    .filter(run => run.text.length > 0)
}

// /context's own grid glyphs: full, partial, free, autocompact buffer.
const cellGlyph = (cell: Cell) =>
  cell.kind === 'free' ? '⛶' : cell.kind === 'buffer' ? '⛝' : cell.fullness >= 0.7 ? '⛁' : '⛀'

const legendGlyph = (c: Category) => (c.kind === 'free' ? '⛶' : c.kind === 'buffer' ? '⛝' : '⛁')

const SPARK = '▁▂▃▄▅▆▇█'
const sparkChar = (fraction: number) =>
  SPARK[Math.min(SPARK.length - 1, Math.floor(Math.max(0, fraction) * SPARK.length))] ?? '▁'

const sparkline = (values: number[], width: number) => {
  const tail = values.slice(-width)
  const max = Math.max(1, ...tail)
  return tail.map(v => sparkChar(v / max)).join('')
}

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

// ---------- PR visuals ----------

const CI_GLYPH: Record<Pr['ci'], { glyph: string; color?: string }> = {
  pass: { glyph: '✓', color: 'success' },
  fail: { glyph: '✗', color: 'error' },
  running: { glyph: '●', color: 'warning' },
  none: { glyph: '', color: undefined },
}

const CHECK_GLYPH: Record<CheckState, { glyph: string; color?: string }> = {
  pass: { glyph: '✓', color: 'success' },
  fail: { glyph: '✗', color: 'error' },
  running: { glyph: '●', color: 'warning' },
  skipped: { glyph: '–', color: undefined },
}

const REVIEW: Record<string, { text: string; color: string }> = {
  APPROVED: { text: 'approved', color: 'success' },
  CHANGES_REQUESTED: { text: 'changes requested', color: 'error' },
  REVIEW_REQUIRED: { text: 'review required', color: 'warning' },
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
    const files: string[] = []
    for (const line of status.stdout.split('\n')) {
      if (line.startsWith('# branch.head ')) branch = line.slice(14).trim()
      else if (line.startsWith('# branch.ab ')) {
        const [a, b] = line.slice(12).trim().split(' ')
        ahead = Math.abs(Number(a)) || 0
        behind = Math.abs(Number(b)) || 0
      } else if (line.length > 0 && !line.startsWith('#')) {
        changes += 1
        const path = statusPath(line)
        if (path && files.length < GIT_FILES_MAX) files.push(path)
      }
    }
    if (branch === '(detached)') branch = 'detached'

    const dirs = await $.process.run(
      ['git', 'rev-parse', '--show-toplevel', '--git-dir', '--git-common-dir'],
      { timeoutMs: 5000 },
    )
    const [top, gitDir, commonDir] = dirs.stdout.trim().split('\n')
    const isWorktree = dirs.exitCode === 0 && gitDir !== commonDir && !!top
    const worktree = isWorktree ? top?.split('/').pop() : undefined

    return { branch, changes, ahead, behind, worktree, files }
  } catch {
    return null
  }
}

// The path of one `git status --porcelain=v2` entry: ordinary (1), renamed
// (2, new path before the tab), unmerged (u), untracked (?) or ignored (!).
const PATH_FIELD: Record<string, number> = { '1': 8, '2': 9, u: 10, '?': 1, '!': 1 }
const statusPath = (line: string): string | undefined => {
  const fields = line.split(' ')
  const skip = PATH_FIELD[fields[0] ?? '']
  if (skip === undefined) return undefined
  return fields.slice(skip).join(' ').split('\t')[0] || undefined
}

type GhCheck = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}
type GhNote = {
  author?: { login?: string }
  body?: string
  state?: string
  createdAt?: string
  submittedAt?: string
}

const checkState = (c: GhCheck): CheckState => {
  if (c.state !== undefined && c.status === undefined) {
    if (c.state === 'SUCCESS') return 'pass'
    if (c.state === 'PENDING' || c.state === 'EXPECTED') return 'running'
    return 'fail'
  }
  if (c.status !== 'COMPLETED') return 'running'
  if (c.conclusion === 'SUCCESS') return 'pass'
  if (c.conclusion === 'NEUTRAL' || c.conclusion === 'SKIPPED') return 'skipped'
  return 'fail'
}

const PR_FIELDS =
  'number,title,url,state,isDraft,reviewDecision,mergeable,statusCheckRollup,comments,reviews'

const readPr = async ($: EngineInterface): Promise<Pr | null> => {
  try {
    const r = await $.process.run(['gh', 'pr', 'view', '--json', PR_FIELDS], {
      timeoutMs: 15_000,
    })
    if (r.exitCode !== 0) return null
    const d = JSON.parse(r.stdout)

    const checks = ((d.statusCheckRollup ?? []) as GhCheck[]).map(c => ({
      name: c.name ?? c.context ?? '?',
      state: checkState(c),
    }))
    const ci: Pr['ci'] =
      checks.length === 0
        ? 'none'
        : checks.some(c => c.state === 'fail')
          ? 'fail'
          : checks.some(c => c.state === 'running')
            ? 'running'
            : 'pass'

    const notes: (PrComment & { at: string })[] = [
      ...((d.comments ?? []) as GhNote[]).map(c => ({
        author: c.author?.login ?? '?',
        body: c.body ?? '',
        kind: 'comment' as const,
        at: c.createdAt ?? '',
      })),
      ...((d.reviews ?? []) as GhNote[])
        .filter(rv => (rv.body ?? '').trim().length > 0 || rv.state === 'CHANGES_REQUESTED')
        .map(rv => ({
          author: rv.author?.login ?? '?',
          body: rv.body ?? '',
          kind: 'review' as const,
          state: rv.state,
          at: rv.submittedAt ?? '',
        })),
    ].sort((a, b) => a.at.localeCompare(b.at))

    return {
      number: d.number,
      title: d.title ?? '',
      url: d.url ?? '',
      state: d.state ?? '',
      isDraft: !!d.isDraft,
      reviewDecision: d.reviewDecision || undefined,
      mergeable: d.mergeable || undefined,
      ci,
      checks,
      comments: notes.slice(-5).map(({ at: _at, ...n }) => ({ ...n, body: oneLine(n.body, 240) })),
      commentCount: notes.length,
    }
  } catch {
    return null
  }
}

const readAgents = async ($: EngineInterface): Promise<AgentRow[]> => {
  try {
    const list = await $.agent.list()
    return list
      .map(a => ({
        id: a.id,
        label: a.label || a.description || a.type,
        type: a.type,
        status: a.status,
        model: a.model,
        effort: a.effort === undefined ? undefined : String(a.effort),
        tokens: a.tokenCount,
        window: a.contextWindowSize,
        costUsd: a.cost?.usd,
        startTime: a.startTime,
        samples: a.tokenSamples.slice(-30),
      }))
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 12)
  } catch {
    return []
  }
}

const refresh = async ($: EngineInterface, withBreakdown = false) => {
  // columns 80 keeps /context's 10-wide grid (20-wide for 1M windows).
  const usage = await $.session.usage(
    withBreakdown ? { breakdown: 'summary', columns: 80 } : undefined,
  )
  const model = await $.session.model()
  const git = await readGit($)
  const breakdown = usage.context.breakdown

  const categories: Category[] | undefined = breakdown
    ? breakdown.categories
        .filter(c => !c.isDeferred && c.tokens > 0)
        .map(c => ({
          name: c.name,
          tokens: c.tokens,
          color: c.color,
          kind: c.kind === 'free' || c.kind === 'buffer' ? c.kind : 'used',
        }))
    : undefined

  const kindOf = new Map((categories ?? []).map(c => [c.name, c.kind] as const))
  const grid: Cell[][] | undefined = breakdown?.gridRows.map(row =>
    row.map(sq => ({
      color: sq.color,
      kind: kindOf.get(sq.categoryName) ?? (sq.isFilled ? 'used' : 'free'),
      fullness: sq.squareFullness,
    })),
  )
  const autoCompactAt =
    breakdown?.isAutoCompactEnabled && breakdown.autoCompactThreshold && breakdown.rawMaxTokens
      ? Math.round((breakdown.autoCompactThreshold / breakdown.rawMaxTokens) * 100)
      : undefined

  await update($, snap, prev => {
    const base = prev ?? EMPTY
    return {
      ...base,
      model,
      ctxPercent: usage.context.percent,
      ctxTokens: usage.context.tokens,
      ctxWindow: usage.context.window,
      limits: usage.rateLimits.map(l => ({
        kind: l.kind,
        percent: l.percentUsed,
        resetsAt: l.resetsAt,
      })),
      costUsd: usage.cost?.usd,
      git,
      categories: categories ?? base.categories,
      grid: grid ?? base.grid,
      autoCompactAt: breakdown ? autoCompactAt : base.autoCompactAt,
    }
  })
}

const refreshGit = async ($: EngineInterface) => {
  const git = await readGit($)
  await update($, snap, prev => ({ ...(prev ?? EMPTY), git }))
}

const HISTORY_MAX = 120

const recordHistory = async ($: EngineInterface) => {
  await update($, snap, prev => {
    const base = prev ?? EMPTY
    if (base.ctxPercent === undefined) return base
    const point: HistoryPoint = {
      percent: base.ctxPercent,
      compacted: base.hasCompactedSincePoint,
    }
    return {
      ...base,
      history: [...base.history, point].slice(-HISTORY_MAX),
      hasCompactedSincePoint: false,
    }
  })
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

// Throttles; module variables start over on a reload, which only forces a read.
let prReadAt = 0
let agentsReadAt = 0

const refreshPr = async ($: EngineInterface, isForced = false) => {
  const now = await $.clock.now()
  if (!isForced && now - prReadAt < PR_TTL_MS) return
  prReadAt = now
  const pr = await readPr($)
  await update($, snap, prev => ({ ...(prev ?? EMPTY), pr }))
}

const refreshAgents = async ($: EngineInterface, isForced = false) => {
  const now = await $.clock.now()
  if (!isForced && now - agentsReadAt < AGENTS_TTL_MS) return
  agentsReadAt = now
  const agents = await readAgents($)
  await update($, snap, prev => ({ ...(prev ?? EMPTY), agents }))
}

// ---------- press handlers ----------
// A press hook has a 10 s budget and `gh` alone may take 15: every handler
// starts slow work unawaited and returns once the visible change is made.

const inBackground = (work: Promise<unknown>) => {
  work.catch(() => undefined)
}

const openPane = async ($: EngineInterface) => {
  const opened = await $.ui.open({ id: PANE, title: 'Cockpit' })
  inBackground(Promise.all([refresh($, true), refreshPr($, true), refreshAgents($, true)]))
  return opened
}

// Expands `id` and folds the other sections, then opens the pane.
const openPaneOn = async ($: EngineInterface, id: string) => {
  await update($, collapsed, () => SECTIONS.filter(x => x !== id))
  await $.store.set('collapsed', await read($, collapsed))
  await openPane($)
}

const toggleSection = async ($: EngineInterface, id: string) => {
  await update($, collapsed, list =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id],
  )
  await $.store.set('collapsed', await read($, collapsed))
}

const toggleDetail = async ($: EngineInterface, id: string) => {
  await update($, details, list =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id],
  )
}

const hideBand = async ($: EngineInterface) => {
  await update($, isHidden, () => true)
  await update($, bandFocus, () => false)
  $.ui.toast('Cockpit band hidden: /cockpit show brings it back')
}

const fixCi = async ($: EngineInterface, pr: number) => {
  await $.prompt.fill({ text: `/fix-ci ${pr}`, mode: 'replace' })
}

const addressComments = async ($: EngineInterface, pr: number) => {
  await $.prompt.fill({
    text: `Read the review comments on PR #${pr} with gh, address each one in code, and summarise what changed per comment.`,
    mode: 'replace',
  })
}

const compactSession = ($: EngineInterface) => {
  inBackground($.session.compact())
}

const refreshPrSoon = ($: EngineInterface) => {
  inBackground(refreshPr($, true))
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
    const saved = await $.store.get('collapsed')
    if (Array.isArray(saved)) {
      await update($, collapsed, () => saved.filter((x): x is string => typeof x === 'string'))
    }
    await Promise.all([refresh($), refreshAgents($, true)])
    void refreshPr($, true)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    turnTools = 0
    // The band has no blur event: a prompt sent means the keys are back in
    // the composer, so the hotkey hints go.
    await update($, bandFocus, () => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const style = e.outputStyle?.name
    await update($, snap, prev => ({ ...(prev ?? EMPTY), style }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      if (e.effort !== undefined) {
        const effort = String(e.effort)
        await update($, snap, prev => ({ ...(prev ?? EMPTY), effort }))
      }
    } else {
      await refreshAgents($)
    }
    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) turnTools += 1
    const ran = await next(e)
    if (GIT_TOOLS.has(e.tool)) await refreshGit($)
    if (e.tool === 'Bash' && /\bgit\s+push\b|\bgh\s+pr\b/.test(e.command)) {
      await refreshPr($, true)
    }
    if (e.tool === 'Agent') await refreshAgents($, true)
    return ran
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute') {
      await update($, snap, prev => {
        const base = prev ?? EMPTY
        return { ...base, compactions: base.compactions + 1, hasCompactedSincePoint: true }
      })
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      await refreshAgents($, true)
      return result
    }

    const secs = turnStartedAt ? Math.round(((await $.clock.now()) - turnStartedAt) / 1000) : 0
    const tools = turnTools
    await update($, snap, prev => ({ ...(prev ?? EMPTY), lastTurn: { seconds: secs, tools } }))
    await refresh($, true)
    await recordHistory($)
    await refreshAgents($, true)
    await refreshPr($)
    await alert($)
    return result
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      return { text: `Cockpit band ${arg === 'hide' ? 'hidden' : 'shown'}.` }
    }
    const { isPlaced } = await openPane($)
    return {
      text: isPlaced
        ? 'Cockpit pane opened.'
        : 'Cockpit pane opened; it shows once the window is wide enough.',
    }
  })

  // ---------- band above the prompt ----------

  // The band has no isFocused prop: a ring landing on one of its Buttons
  // (the `autoFocus` one as the band takes the keys) is the signal.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) await update($, bandFocus, () => true)
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, snap)
    // While a turn runs the Spinner sits right above this row; the summary
    // moves into the Spinner (below) so the two never read as one block.
    if (
      e.props.hasSurvey ||
      e.props.isWorking ||
      s === null ||
      s.model === '' ||
      (await read($, isHidden))
    ) {
      return next(e)
    }

    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const isNarrow = e.props.bodyColumns < 100
    const open = await read($, details)
    // A plain Button draws `c: label` whenever it has a hotkey, so the hint
    // is the hotkey itself: given only while the band holds the focus.
    const isFocused = await read($, bandFocus)
    const hk = (key: string) => (isFocused ? { hotkey: key } : {})
    const sep = <Text dimColor> │ </Text>

    const ctx = s.ctxPercent
    const limits = s.limits.filter(l => LIMIT_LABEL[l.kind])
    const git = s.git
    const pr = s.pr
    const activeAgents = s.agents.filter(a => ACTIVE_AGENT.has(a.status)).length

    const row = (
      <Box flexDirection="row" flexWrap="wrap">
        <Text color="claude" bold>{shortModel(s.model)}</Text>
        {s.effort && <Text dimColor>·{s.effort}</Text>}
        {s.style && s.style !== 'default' && <Text dimColor>·{s.style}</Text>}

        {sep}
        <Button key="band-ctx" plain autoFocus {...hk('c')} onPress={() => openPaneOn($, 'context')}>
          <Text dimColor>ctx </Text>
          {!isNarrow && s.categories.length > 0 ? (
            <Text>
              {stackedRuns(s.categories, 14).map(run => (
                <Text color={run.color} dimColor={run.dim}>{run.text}</Text>
              ))}{' '}
            </Text>
          ) : (
            !isNarrow && ctx !== undefined && <Text color={ctxColor(ctx)}>{bar(ctx, 8)} </Text>
          )}
          {ctx === undefined ? <Text dimColor>—</Text> : <Text color={ctxColor(ctx)}>{ctx}%</Text>}
          {!isNarrow && s.ctxTokens !== undefined && <Text dimColor> {kTokens(s.ctxTokens)}</Text>}
          {s.compactions > 0 && <Text color="warning"> ⟳{s.compactions}</Text>}
        </Button>

        {limits.length > 0 && sep}
        {limits.length > 0 && (
          <Button key="band-limits" plain {...hk('l')} onPress={() => toggleDetail($, 'limits')}>
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
                  {isAtRisk && <Text color="error"> ⚠{duration(p?.runsOutInMs ?? 0)}</Text>}
                  {reset && <Text dimColor> ↻{reset}</Text>}
                </Text>
              )
            })}
          </Button>
        )}

        {git && sep}
        {git && (
          <Button key="band-git" plain {...hk('g')} onPress={() => toggleDetail($, 'git')}>
            <Text color="permission">{git.branch}</Text>
            {git.worktree && <Text dimColor> ⑂{git.worktree}</Text>}
            {git.changes > 0 ? (
              <Text color="warning"> ±{git.changes}</Text>
            ) : (
              <Text color="success"> ✓</Text>
            )}
            {git.ahead > 0 && <Text dimColor> ↑{git.ahead}</Text>}
            {git.behind > 0 && <Text color="warning"> ↓{git.behind}</Text>}
          </Button>
        )}

        {pr && <Text dimColor>  </Text>}
        {/* A Link takes no hotkey and no plugin call opens a URL: `#42` is a click. */}
        {pr &&
          (pr.url ? (
            <Link href={pr.url}>
              <Text dimColor={pr.isDraft}>#{pr.number}</Text>
            </Link>
          ) : (
            <Text dimColor={pr.isDraft}>#{pr.number}</Text>
          ))}
        {pr?.ci === 'fail' && (
          <Button key="band-fix-ci" plain {...hk('f')} onPress={() => fixCi($, pr.number)}>
            <Text color={CI_GLYPH.fail.color}> {CI_GLYPH.fail.glyph}CI</Text>
          </Button>
        )}
        {pr && pr.ci !== 'none' && pr.ci !== 'fail' && (
          <Text color={CI_GLYPH[pr.ci].color}> {CI_GLYPH[pr.ci].glyph}CI</Text>
        )}
        {pr && pr.commentCount > 0 && (
          <Button key="band-comments" plain {...hk('r')} onPress={() => addressComments($, pr.number)}>
            <Text dimColor> 💬{pr.commentCount}</Text>
          </Button>
        )}
        {pr?.reviewDecision === 'APPROVED' && <Text color="success"> ✔</Text>}
        {pr?.reviewDecision === 'CHANGES_REQUESTED' && <Text color="error"> ✗rev</Text>}
        {pr?.mergeable === 'CONFLICTING' && <Text color="error"> ⚠conflict</Text>}

        {activeAgents > 0 && sep}
        {activeAgents > 0 && (
          <Button key="band-agents" plain {...hk('a')} onPress={() => openPaneOn($, 'agents')}>
            <Text color="claude">⚙{activeAgents}</Text>
          </Button>
        )}

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

        <Text> </Text>
        <Button key="cockpit-open" plain dimColor {...hk('o')} label="⋯" onPress={() => openPane($)} />
        <Text> </Text>
        <Button key="band-hide" plain dimColor {...hk('x')} label="×" onPress={() => hideBand($)} />
      </Box>
    )

    // ---------- inline detail rows, for widths where the pane can't seat ----------

    const limitLines = open.includes('limits')
      ? limits.map(l => {
          const p = pace(l, now)
          const reset = untilReset(l, now)
          const isPaced = p !== undefined && p.elapsed >= 0.03
          const runsOut = p?.runsOutInMs
          return (
            <Text wrap="truncate-end">
              <Text dimColor>{'  '}{(LIMIT_LABEL[l.kind] ?? l.kind).padEnd(6)}</Text>
              <Text color={paceColor(l, p)}>
                {paceBar(l.percent, p?.elapsed, 12)} {Math.round(l.percent)}%
              </Text>
              {isPaced && <Text dimColor> · {Math.round((p?.elapsed ?? 0) * 100)}% of window gone</Text>}
              {isPaced && runsOut !== undefined && (
                <Text color="error">
                  {' · '}runs out in {duration(runsOut)}, {duration((p?.resetInMs ?? 0) - runsOut)} before reset
                </Text>
              )}
              {isPaced && runsOut === undefined && (
                <Text dimColor> · on pace for ~{Math.round(p?.projected ?? 0)}%</Text>
              )}
              {reset && <Text dimColor> · resets in {reset}</Text>}
            </Text>
          )
        })
      : []

    const gitLines =
      open.includes('git') && git
        ? [
            <Text wrap="truncate-end">
              <Text dimColor>{'  '}</Text>
              <Text color="permission">{git.branch}</Text>
              {git.worktree && <Text dimColor> ⑂{git.worktree}</Text>}
              <Text dimColor> ↑{git.ahead} ↓{git.behind} · </Text>
              {git.changes === 0 ? (
                <Text color="success">clean</Text>
              ) : (
                <Text color="warning">{git.changes} changed</Text>
              )}
              {git.files.length > 0 && (
                <Text dimColor>
                  : {git.files.join(', ')}
                  {git.changes > git.files.length ? ', …' : ''}
                </Text>
              )}
            </Text>,
          ]
        : []

    // A full main row runs ~145 cells, ~170 with hotkey hints: below that it
    // wraps to two lines (rarely three). Keep the detail rows that fit.
    const mainRows = e.props.bodyColumns < 80 ? 3 : e.props.bodyColumns < 170 ? 2 : 1
    const room = Math.max(0, e.props.maxRows - mainRows)
    const extra = [...limitLines, ...gitLines].slice(0, room)

    return (
      <Box flexDirection="column">
        {row}
        {extra}
      </Box>
    )
  })

  // ---------- summary beside the Spinner while a turn runs ----------

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const engine = await next(e)
    const s = await read($, snap)
    // A subagent's spinner carries its agent id: leave those as they are.
    if (
      s === null ||
      s.model === '' ||
      (await read($, isHidden)) ||
      s.agents.some(a => a.id === e.requestId)
    ) {
      return engine
    }

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const fiveHour = s.limits.find(l => l.kind === 'five_hour')
    const fivePace = fiveHour ? pace(fiveHour, now) : undefined
    const activeAgents = s.agents.filter(a => ACTIVE_AGENT.has(a.status)).length

    return (
      <Box flexDirection="row" flexWrap="wrap">
        {engine}
        <Text dimColor> │ </Text>
        {s.ctxPercent !== undefined && (
          <Text>
            <Text dimColor>ctx </Text>
            <Text color={ctxColor(s.ctxPercent)}>{s.ctxPercent}%</Text>
          </Text>
        )}
        {fiveHour && (
          <Text>
            <Text dimColor> · 5h </Text>
            <Text color={paceColor(fiveHour, fivePace)}>{Math.round(fiveHour.percent)}%</Text>
            {fivePace?.runsOutInMs !== undefined && <Text color="error">⚠</Text>}
          </Text>
        )}
        {activeAgents > 0 && <Text color="claude"> · ⚙{activeAgents}</Text>}
        {s.pr?.ci === 'fail' && <Text color="error"> · ✗CI</Text>}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // ---------- details pane ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const s = await read($, snap)
    if (s === null) return <Text dimColor>Waiting for the first turn…</Text>

    const closed = await read($, collapsed)
    const now = await $.clock.now()
    const cols = Math.max(20, e.props.bodyColumns)
    const barCells = Math.max(8, Math.min(30, cols - 14))
    const ctx = s.ctxPercent ?? 0
    const catTotal = s.categories.reduce((sum, c) => sum + c.tokens, 0) || 1
    const gridWidth = (s.grid[0]?.length ?? 0) * 2
    const isSideBySide = gridWidth > 0 && cols >= gridWidth + 32
    const history = s.history.slice(-Math.max(10, cols - 2))

    const section = (id: string, title: string, summary: string, body: RenderChildren) => {
      const isOpen = !closed.includes(id)
      return (
        <Box flexDirection="column">
          <Button key={`section-${id}`} plain onPress={() => toggleSection($, id)}>
            {isOpen ? '▾ ' : '▸ '}
            <Text bold>{title}</Text>
            {summary ? <Text dimColor>  {summary}</Text> : ''}
          </Button>
          {isOpen && body}
        </Box>
      )
    }

    // --- context ---
    const grid = (
      <Box flexDirection="column">
        {s.grid.map(row => (
          <Text>
            {row.map(cell => (
              <Text color={kindColor(cell.kind, cell.color)} dimColor={cell.kind !== 'used'}>
                {cellGlyph(cell)}{' '}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    )

    const legend = (
      <Box flexDirection="column">
        {s.categories.map(c => (
          <Text wrap="truncate-end">
            <Text color={kindColor(c.kind, c.color)} dimColor={c.kind !== 'used'}>
              {legendGlyph(c)}{' '}
            </Text>
            <Text dimColor={c.kind !== 'used'}>{c.name}</Text>
            <Text dimColor>
              {'  '}
              {kTokens(c.tokens)} · {Math.round((c.tokens / catTotal) * 100)}%
            </Text>
          </Text>
        ))}
      </Box>
    )

    const lastDelta =
      history.length >= 2
        ? (history.at(-1)?.percent ?? 0) - (history.at(-2)?.percent ?? 0)
        : undefined

    const contextBody = (
      <Box flexDirection="column">
        <Text color={ctxColor(ctx)}>
          {bar(ctx, barCells)} {s.ctxPercent ?? '—'}%
        </Text>
        <Text dimColor>
          {s.ctxTokens !== undefined ? kTokens(s.ctxTokens) : '—'} of {kTokens(s.ctxWindow)} tokens
          {s.autoCompactAt !== undefined ? ` · autocompact at ${s.autoCompactAt}%` : ''}
          {s.compactions > 0 ? ` · ${s.compactions} compaction(s)` : ''}
        </Text>
        {s.grid.length > 0 && (
          <Box
            flexDirection={isSideBySide ? 'row' : 'column'}
            columnGap={3}
            rowGap={1}
            marginTop={1}
          >
            {grid}
            {legend}
          </Box>
        )}
        {history.length > 1 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>per turn</Text>
            <Text>
              {history.map(p =>
                p.compacted ? (
                  <Text color="warning">⟳</Text>
                ) : (
                  <Text color={ctxColor(p.percent)}>{sparkChar(p.percent / 100)}</Text>
                ),
              )}
            </Text>
            <Text dimColor>
              {history.length} turns · min {Math.min(...history.map(p => p.percent))}% · max{' '}
              {Math.max(...history.map(p => p.percent))}%
              {lastDelta !== undefined ? ` · last ${lastDelta >= 0 ? '+' : ''}${lastDelta}pp` : ''}
            </Text>
          </Box>
        )}
        <Box flexDirection="row" marginTop={1}>
          <Button key="compact" label="Compact" onPress={() => compactSession($)} />
        </Box>
      </Box>
    )

    // --- limits ---
    const limitsBody = (
      <Box flexDirection="column">
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
                <Text
                  color={p.runsOutInMs !== undefined ? 'error' : undefined}
                  dimColor={p.runsOutInMs === undefined}
                >
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
    )

    // --- git & PR ---
    const pr = s.pr
    const failing = pr?.checks.filter(c => c.state === 'fail') ?? []
    const running = pr?.checks.filter(c => c.state === 'running') ?? []
    const passed = pr?.checks.filter(c => c.state === 'pass').length ?? 0

    const gitBody = (
      <Box flexDirection="column">
        {s.git ? (
          <Box flexDirection="column">
            <Text>
              <Text color="permission">{s.git.branch}</Text>
              {s.git.worktree && <Text dimColor>  worktree {s.git.worktree}</Text>}
            </Text>
            <Text dimColor>
              {s.git.changes === 0 ? 'clean' : `${s.git.changes} changed file(s)`} · ↑{s.git.ahead}{' '}
              ↓{s.git.behind}
            </Text>
          </Box>
        ) : (
          <Text dimColor>Not a git repository.</Text>
        )}

        {pr ? (
          <Box flexDirection="column" marginTop={1}>
            <Text wrap="truncate-end">
              <Text bold>#{pr.number}</Text> {pr.title}
            </Text>
            <Text>
              <Text dimColor>{pr.isDraft ? 'draft' : pr.state.toLowerCase()}</Text>
              {pr.reviewDecision && REVIEW[pr.reviewDecision] && (
                <Text color={REVIEW[pr.reviewDecision]?.color}>
                  {' · '}
                  {REVIEW[pr.reviewDecision]?.text}
                </Text>
              )}
              {pr.mergeable === 'CONFLICTING' && <Text color="error"> · conflicts</Text>}
              {pr.mergeable === 'MERGEABLE' && <Text dimColor> · mergeable</Text>}
            </Text>

            {pr.checks.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text>
                  <Text color={CI_GLYPH[pr.ci].color}>{CI_GLYPH[pr.ci].glyph} CI</Text>
                  <Text dimColor>
                    {'  '}
                    {passed} passed
                    {failing.length > 0 ? ` · ${failing.length} failing` : ''}
                    {running.length > 0 ? ` · ${running.length} running` : ''}
                  </Text>
                </Text>
                {[...failing, ...running].slice(0, 8).map(c => (
                  <Text wrap="truncate-end">
                    {'  '}
                    <Text color={CHECK_GLYPH[c.state].color}>{CHECK_GLYPH[c.state].glyph}</Text> {c.name}
                  </Text>
                ))}
              </Box>
            )}

            {pr.comments.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>
                  {pr.commentCount} comment(s)/review(s){pr.commentCount > pr.comments.length ? ', latest:' : ':'}
                </Text>
                {pr.comments.map(c => (
                  <Text wrap="truncate-end">
                    <Text bold>{c.author}</Text>
                    {c.state === 'CHANGES_REQUESTED' && <Text color="error"> [changes]</Text>}
                    {c.state === 'APPROVED' && <Text color="success"> [approved]</Text>}
                    <Text dimColor> {c.body || '(no text)'}</Text>
                  </Text>
                ))}
              </Box>
            )}

            <Box flexDirection="row" columnGap={2} marginTop={1} flexWrap="wrap">
              {pr.url && <Link href={pr.url} label="Open PR" />}
              {pr.ci === 'fail' && (
                <Button key="fix-ci" label="Fix CI" onPress={() => fixCi($, pr.number)} />
              )}
              {pr.commentCount > 0 && (
                <Button
                  key="address-comments"
                  label="Address comments"
                  onPress={() => addressComments($, pr.number)}
                />
              )}
              <Button key="refresh-pr" plain dimColor label="↻ refresh" onPress={() => refreshPrSoon($)} />
            </Box>
          </Box>
        ) : (
          <Text dimColor>No pull request for this branch.</Text>
        )}
      </Box>
    )

    const gitSummary = [
      s.git?.branch,
      pr ? `#${pr.number}${pr.ci !== 'none' ? ` ${CI_GLYPH[pr.ci].glyph}` : ''}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ')

    // --- agents ---
    const agentsBody = (
      <Box flexDirection="column">
        {s.agents.length === 0 && <Text dimColor>No agents this session.</Text>}
        {s.agents.map(a => {
          const isActive = ACTIVE_AGENT.has(a.status)
          const pct = a.window ? Math.round((a.tokens / a.window) * 100) : undefined
          return (
            <Box flexDirection="column">
              <Text wrap="truncate-end">
                <Text color={isActive ? 'warning' : a.status === 'failed' || a.status === 'killed' ? 'error' : 'success'}>
                  {isActive ? '●' : a.status === 'failed' || a.status === 'killed' ? '✗' : '✓'}
                </Text>{' '}
                <Text bold={isActive} dimColor={!isActive}>{a.label}</Text>
                <Text dimColor>  {a.type} · {a.status}</Text>
              </Text>
              <Text dimColor wrap="truncate-end">
                {'  '}
                {a.model ? shortModel(a.model) : '?'}
                {a.effort ? `·${a.effort}` : ''}
                {pct !== undefined ? '  ctx ' : `  ${kTokens(a.tokens)} tok`}
              </Text>
              {pct !== undefined && (
                <Text wrap="truncate-end">
                  {'  '}
                  <Text color={ctxColor(pct)}>{bar(pct, 10)} {pct}%</Text>
                  <Text dimColor>
                    {' '}
                    {kTokens(a.tokens)} · {duration(now - a.startTime)}
                    {a.costUsd !== undefined ? ` · ~${usd(a.costUsd)}` : ''}
                    {a.samples.length > 1 ? '  ' : ''}
                  </Text>
                  {a.samples.length > 1 && <Text color="claude">{sparkline(a.samples, 16)}</Text>}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    )

    const activeCount = s.agents.filter(a => ACTIVE_AGENT.has(a.status)).length

    // --- session ---
    const sessionBody = (
      <Box flexDirection="column">
        <Text>
          <Text color="claude">{shortModel(s.model)}</Text>
          {s.effort && <Text dimColor> · effort {s.effort}</Text>}
          {s.style && <Text dimColor> · style {s.style}</Text>}
        </Text>
        {s.costUsd !== undefined && <Text dimColor>cost ~{usd(s.costUsd)} (estimate)</Text>}
        {s.lastTurn && (
          <Text dimColor>
            last turn {seconds(s.lastTurn.seconds)} · {s.lastTurn.tools} tool call(s)
          </Text>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" rowGap={1}>
        {section('session', 'Session', shortModel(s.model), sessionBody)}
        {section('context', 'Context', s.ctxPercent !== undefined ? `${s.ctxPercent}%` : '', contextBody)}
        {section(
          'limits',
          'Rate limits',
          s.limits
            .filter(l => LIMIT_LABEL[l.kind])
            .map(l => `${LIMIT_LABEL[l.kind]} ${Math.round(l.percent)}%`)
            .join(' · '),
          limitsBody,
        )}
        {section('git', 'Git & PR', gitSummary, gitBody)}
        {section(
          'agents',
          'Agents',
          activeCount > 0 ? `${activeCount} running` : s.agents.length > 0 ? `${s.agents.length} done` : '',
          agentsBody,
        )}
      </Box>
    )
  })
}
