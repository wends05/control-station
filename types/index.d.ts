export type Mode = 'liminal' | 'station' | 'utopia'

export type PartKey =
  | 'bar'
  | 'panel'
  | 'background'
  | 'animation'
  | 'project'
  | 'limits'
  | 'today'
  | 'actions'

export type Prefs = {
  mode: Mode
  // The chosen scene id for each mode.
  scenes: Record<Mode, string>
  parts: Record<PartKey, boolean>
}

export type Window = { percent: number | null; resetsAt: number | null }

export type UsageSnap = {
  context: number | null
  tokens: number | null
  window: number | null
  five: Window
  week: Window
  model: string
}

export type Commit = { hash: string; subject: string }

export type ProjectSnap = {
  name: string
  isRepo: boolean
  branch: string
  changes: number
  ahead: number
  behind: number
  commits: Commit[]
}

export type TodaySnap = { prompts: number; tools: number; files: number }

declare module 'claude-code' {
  interface PluginState {
    'control-station': {
      prefs: Shaped<Prefs>
      usage: Shaped<UsageSnap>
      project: Shaped<ProjectSnap>
      today: Shaped<TodaySnap>
    }
  }
}
