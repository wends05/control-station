import type { Mode } from '../types'

export type GaugeKind =
  | 'moon'
  | 'dial'
  | 'pool'
  | 'orbit'
  | 'core'
  | 'tube'
  | 'tower'
  | 'sun'
  | 'tree'

export type Scene = {
  id: string
  mode: Mode
  title: string
  motto: string
  // Palette: base is the panel background the art fades into.
  base: string
  mid: string
  accent: string
  ink: string
  // Names for the context, 5-hour and weekly gauges.
  gauges: [string, string, string]
  gauge: GaugeKind
  seed: number
}

// The face every scene of a mode draws its text in. They are system faces: a
// drawing cannot load one. fit scales the text so a wider face, the monospace,
// fits the boxes the others do.
export const MODES: { id: Mode; label: string; font: string; fit: number }[] = [
  { id: 'liminal', label: 'Liminal space', font: "'Helvetica Neue', Helvetica, Arial, sans-serif", fit: 1 },
  { id: 'station', label: 'Space station', font: "'SF Mono', ui-monospace, Menlo, Monaco, monospace", fit: 0.86 },
  { id: 'utopia', label: 'Utopia', font: "Optima, 'Gill Sans', 'Avenir Next', sans-serif", fit: 1 },
]

export const SCENES: Scene[] = [
  {
    id: 'empty-atrium',
    mode: 'liminal',
    title: 'Empty Atrium',
    motto: 'No one has been here. Someone is coming.',
    base: '#17150e',
    mid: '#2b2716',
    accent: '#e8d98a',
    ink: '#f1ebcb',
    gauges: ['SANITY', 'WANDER · 5H', 'EXPOSURE · WEEK'],
    gauge: 'moon',
    seed: 11,
  },
  {
    id: 'night-parking-deck',
    mode: 'liminal',
    title: 'Night Parking Deck',
    motto: 'Level 3 looks a lot like Level 2.',
    base: '#0d1016',
    mid: '#1b2230',
    accent: '#ffb15a',
    ink: '#eadfca',
    gauges: ['LUCIDITY', 'LOOP · 5H', 'DRIFT · WEEK'],
    gauge: 'dial',
    seed: 23,
  },
  {
    id: 'poolrooms',
    mode: 'liminal',
    title: 'Poolrooms',
    motto: 'The water is always the same temperature.',
    base: '#081519',
    mid: '#10303a',
    accent: '#7fe6e0',
    ink: '#d7f5f3',
    gauges: ['COMPOSURE', 'DEPTH · 5H', 'TIDE · WEEK'],
    gauge: 'pool',
    seed: 37,
  },
  {
    id: 'observation-ring',
    mode: 'station',
    title: 'Observation Ring',
    motto: 'The planet turns. We hold steady.',
    base: '#060a18',
    mid: '#111a38',
    accent: '#6cb4ff',
    ink: '#dbe8ff',
    gauges: ['OXYGEN', 'ORBIT · 5H', 'VOYAGE · WEEK'],
    gauge: 'orbit',
    seed: 41,
  },
  {
    id: 'reactor-bay',
    mode: 'station',
    title: 'Reactor Bay',
    motto: 'Steady core. Steady hands.',
    base: '#10080a',
    mid: '#2a1113',
    accent: '#ff6a3d',
    ink: '#ffe1d6',
    gauges: ['CORE LOAD', 'CYCLE · 5H', 'FUEL · WEEK'],
    gauge: 'core',
    seed: 53,
  },
  {
    id: 'hydroponics-deck',
    mode: 'station',
    title: 'Hydroponics Deck',
    motto: 'Something is growing in the dark.',
    base: '#06130c',
    mid: '#0e2b1b',
    accent: '#7dff9a',
    ink: '#dcf8e4',
    gauges: ['BIOMASS', 'DAYLIGHT · 5H', 'HARVEST · WEEK'],
    gauge: 'tube',
    seed: 67,
  },
  {
    id: 'terraced-arcology',
    mode: 'utopia',
    title: 'Terraced Arcology',
    motto: 'Everyone is content. Everyone is counted.',
    base: '#0c1316',
    mid: '#1a292e',
    accent: '#9be7d8',
    ink: '#eef6f5',
    gauges: ['COMPLIANCE', 'QUOTA · 5H', 'CENSUS · WEEK'],
    gauge: 'tower',
    seed: 71,
  },
  {
    id: 'dawn-plaza',
    mode: 'utopia',
    title: 'Dawn Plaza',
    motto: 'The shift bell rings. Smile.',
    base: '#170e1d',
    mid: '#37203a',
    accent: '#ffb36b',
    ink: '#ffe9d6',
    gauges: ['CONTENTMENT', 'SHIFT · 5H', 'RATION · WEEK'],
    gauge: 'sun',
    seed: 83,
  },
  {
    id: 'solarpunk-commons',
    mode: 'utopia',
    title: 'Solarpunk Commons',
    motto: 'We built it together. It grows.',
    base: '#0b1a10',
    mid: '#1c3a21',
    accent: '#ffd45e',
    ink: '#f3f7d9',
    gauges: ['SUNLIGHT', 'GROWTH · 5H', 'COMMONS · WEEK'],
    gauge: 'tree',
    seed: 97,
  },
]

export const DEFAULT_SCENES: Record<Mode, string> = {
  liminal: 'empty-atrium',
  station: 'observation-ring',
  utopia: 'terraced-arcology',
}

export function sceneById(id: string): Scene {
  return SCENES.find(scene => scene.id === id) ?? SCENES[0]!
}

export function scenesOf(mode: Mode): Scene[] {
  return SCENES.filter(scene => scene.mode === mode)
}
