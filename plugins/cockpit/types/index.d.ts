export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Git = {
  branch: string
  changes: number
  ahead: number
  behind: number
  worktree?: string
  /** First changed paths from `git status`, for the band's git detail row. */
  files: string[]
}

export type CategoryKind = 'used' | 'free' | 'buffer'

export type Category = { name: string; tokens: number; color: string; kind: CategoryKind }

/** One square of the /context-style grid. */
export type Cell = { color: string; kind: CategoryKind; fullness: number }

/** Context % after a main-loop turn; `compacted` when a compaction ran before it. */
export type HistoryPoint = { percent: number; compacted: boolean }

export type CheckState = 'pass' | 'fail' | 'running' | 'skipped'

export type PrCheck = { name: string; state: CheckState }

export type PrComment = { author: string; body: string; kind: 'comment' | 'review'; state?: string }

export type Pr = {
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  reviewDecision?: string
  mergeable?: string
  ci: 'pass' | 'fail' | 'running' | 'none'
  checks: PrCheck[]
  comments: PrComment[]
  commentCount: number
}

export type AgentRow = {
  id: string
  label: string
  type: string
  status: string
  model?: string
  effort?: string
  tokens: number
  window?: number
  costUsd?: number
  startTime: number
  samples: number[]
}

export type Snapshot = {
  model: string
  effort?: string
  style?: string
  ctxPercent?: number
  ctxTokens?: number
  ctxWindow: number
  categories: Category[]
  grid: Cell[][]
  autoCompactAt?: number
  history: HistoryPoint[]
  hasCompactedSincePoint: boolean
  limits: Limit[]
  costUsd?: number
  compactions: number
  git: Git | null
  pr: Pr | null
  agents: AgentRow[]
  lastTurn?: { seconds: number; tools: number }
  alerted: { ctx: boolean; fiveHour: boolean }
}

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      snap: Shaped<Snapshot | null>
      isHidden: boolean
      collapsed: string[]
      /** Band detail rows that are open: `limits`, `git`. */
      details: string[]
      /** The band's focus ring sits on one of its Buttons: hotkey hints show. */
      bandFocus: boolean
    }
  }
}
