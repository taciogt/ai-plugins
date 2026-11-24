export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Git = {
  branch: string
  changes: number
  ahead: number
  behind: number
  worktree?: string
}

export type Category = { name: string; tokens: number }

export type Snapshot = {
  model: string
  effort?: string
  style?: string
  ctxPercent?: number
  ctxTokens?: number
  ctxWindow: number
  categories: Category[]
  limits: Limit[]
  costUsd?: number
  compactions: number
  git: Git | null
  lastTurn?: { seconds: number; tools: number }
  alerted: { ctx: boolean; fiveHour: boolean }
}

declare module 'claude-code' {
  interface PluginState {
    cockpit: { snap: Shaped<Snapshot | null>; isHidden: boolean }
  }
}
