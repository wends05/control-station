import type { Mode, PartKey, Prefs, ProjectSnap, TodaySnap, UsageSnap } from '../types'
import { DEFAULT_SCENES, MODES, SCENES, sceneById } from './scenes'

export const PARTS: { key: PartKey; about: string }[] = [
  { key: 'bar', about: 'the banner above the prompt' },
  { key: 'panel', about: 'the side panel' },
  { key: 'background', about: 'the scene art behind the panel’s text' },
  { key: 'animation', about: 'twinkle, drift and flicker in the art' },
  { key: 'project', about: 'the panel’s project section' },
  { key: 'limits', about: 'the panel’s limits section' },
  { key: 'today', about: 'the panel’s today section' },
  { key: 'actions', about: 'the panel’s quick actions' },
]

export const DEFAULT_PREFS: Prefs = {
  mode: 'station',
  scenes: { ...DEFAULT_SCENES },
  parts: {
    bar: true,
    panel: true,
    background: true,
    animation: true,
    project: true,
    limits: true,
    today: true,
    actions: true,
  },
}

export const EMPTY_USAGE: UsageSnap = {
  context: null,
  tokens: null,
  window: null,
  five: { percent: null, resetsAt: null },
  week: { percent: null, resetsAt: null },
  model: '',
}

export const EMPTY_PROJECT: ProjectSnap = {
  name: '',
  isRepo: false,
  branch: '',
  changes: 0,
  ahead: 0,
  behind: 0,
  commits: [],
}

export const EMPTY_TODAY: TodaySnap = { prompts: 0, tools: 0, files: 0 }

// What the shared store holds may come from an older version or by hand, so
// every field is checked and anything unusable falls back to its default.
export function normalizePrefs(raw: unknown): Prefs {
  const base = DEFAULT_PREFS
  if (typeof raw !== 'object' || raw === null) {
    return { ...base, scenes: { ...base.scenes }, parts: { ...base.parts } }
  }
  const input = raw as Partial<Prefs>
  const mode = MODES.some(m => m.id === input.mode) ? (input.mode as Mode) : base.mode
  const scenes = { ...base.scenes }
  for (const m of MODES) {
    const id = input.scenes?.[m.id]
    if (typeof id === 'string' && SCENES.some(s => s.id === id && s.mode === m.id)) {
      scenes[m.id] = id
    }
  }
  const parts = { ...base.parts }
  for (const key of Object.keys(parts) as PartKey[]) {
    const value = input.parts?.[key]
    if (typeof value === 'boolean') parts[key] = value
  }
  return {
    mode,
    scenes,
    parts,
  }
}

export function currentScene(prefs: Prefs) {
  return sceneById(prefs.scenes[prefs.mode])
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + '…'
}

export function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function percentText(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`
}

export function resetText(resetsAt: number | null, now: number): string {
  if (resetsAt === null) return '—'
  const ms = resetsAt - now
  if (ms <= 0) return 'resets now'
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const rest = minutes % 60
  if (days > 0) return `resets in ${days}d ${hours}h`
  if (hours > 0) return `resets in ${hours}h ${rest}m`
  return minutes < 1 ? 'resets in <1m' : `resets in ${rest}m`
}

export function tokensText(tokens: number | null, window: number | null): string {
  const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)
  if (tokens === null || window === null) return '—'
  return `${k(tokens)} / ${k(window)}`
}

export function dayKey(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

export function barText(percent: number | null, width: number): string {
  const filled = percent === null ? 0 : Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}
