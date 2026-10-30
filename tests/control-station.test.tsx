import { expect, mock, test } from 'claude-code/testing'

import { bannerSvg, panelSvg } from '../hooks/art'
import { EMPTY_PROJECT, EMPTY_TODAY, EMPTY_USAGE } from '../hooks/model'
import { SCENES } from '../hooks/scenes'

const PLUGIN = 'control-station'
const NOON = Date.UTC(2026, 9, 30, 12)

const BAND = {
  plugin: PLUGIN,
  surface: 'desktop',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const PANE = {
  plugin: PLUGIN,
  surface: 'desktop',
  component: 'Pane',
  requestId: 'control-station',
  props: {
    title: 'Control station',
    isFocused: false,
    bodyColumns: 46,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const RUN_OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

// What sits beneath the plugin: the host answers each call on `$`.
function host(on: any, entries: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: NOON })
  const store = new Map<string, unknown>(Object.entries(entries))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: store.has(e.key) ? JSON.parse(JSON.stringify(store.get(e.key))) : undefined }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_: unknown, e: { key: string }) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  const ran: string[][] = []
  const submitted: string[] = []
  const commands: string[] = []
  const filled: string[] = []
  on('session.id', () => ({ value: 'chat-1' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.root', () => ({ value: '/work/demo' }))
  // A test empties this to play a host that reports no rate limits.
  const limits = [
    { kind: 'five_hour', percentUsed: 61, resetsAt: new Date(NOON + 3 * 3_600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 23, resetsAt: new Date(NOON + 4 * 86_400_000).toISOString() },
  ]
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: limits },
  }))
  on('process.run', (_: unknown, e: { argv: string[] }) => {
    ran.push([...e.argv])
    const [bin, first] = e.argv
    if (bin === 'git' && first === 'rev-parse') return { value: { ...RUN_OK, stdout: 'main\n' } }
    if (bin === 'git' && first === 'status') return { value: { ...RUN_OK, stdout: ' M a.ts\n?? b.ts\n' } }
    if (bin === 'git' && first === 'rev-list') return { value: { ...RUN_OK, stdout: '0\t2\n' } }
    if (bin === 'git' && first === 'log') return { value: { ...RUN_OK, stdout: 'abc1234\tfirst commit\ndef5678\tsecond commit' } }
    return { value: RUN_OK }
  })
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.run', (_: unknown, e: { command: string }) => {
    commands.push(e.command)
    return { text: 'ok' }
  })
  on('prompt.fill', (_: unknown, e: { text: string }) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('tool.call', () => ({ result: {} }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return { clock, ran, commands, filled, store, limits }
}

const saved = (world: { store: Map<string, unknown> }) => world.store.get('prefs') as any

// The text a drawing shows, its words in order.
function flat(el: any): string {
  if (typeof el === 'string') return el
  if (el === null || typeof el !== 'object') return ''
  const kids = Array.isArray(el.children) ? el.children.map(flat).join('') : ''
  return `${kids}${el.props?.alt ?? ''}`
}

test('the banner shows the scene and draws no buttons', async ($, on) => {
  host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('the banner leaves other surfaces and the off switch alone', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'terminal', isInteractive: true })

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(await terminal.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await terminal.unmount()

  await $.command.run({ command: 'cs', args: 'toggle bar off' })
  const desktop = await $.ui.mount(BAND)
  expect(await desktop.find({ type: 'Svg' })).toBeUndefined()
  await desktop.unmount()
})

test('the dropdowns switch mode and scene for the banner and the panel', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  const banner = await $.ui.mount(BAND)
  const pane = await $.ui.mount(PANE)
  await $.ui.select({ plugin: PLUGIN, key: 'mode', value: 'utopia', requestId: 'control-station' })
  expect(saved(world).mode).toBe('utopia')
  await $.ui.select({ plugin: PLUGIN, key: 'scene', value: 'solarpunk-commons', requestId: 'control-station' })
  expect(saved(world).scenes.utopia).toBe('solarpunk-commons')

  expect(flat(await banner.drawn())).toContain('Solarpunk Commons')
  expect(flat(await pane.drawn())).toContain('SUNLIGHT')

  // Each mode remembers its own scene.
  await $.ui.select({ plugin: PLUGIN, key: 'mode', value: 'liminal', requestId: 'control-station' })
  expect(flat(await banner.drawn())).toContain('Empty Atrium')
  await $.ui.select({ plugin: PLUGIN, key: 'mode', value: 'utopia', requestId: 'control-station' })
  expect(flat(await banner.drawn())).toContain('Solarpunk Commons')
  await banner.unmount()
  await pane.unmount()
})

test('/cs scene random picks another scene in the same mode', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })
  const before = saved(world) ?? { scenes: { station: 'observation-ring' } }
  await $.command.run({ command: 'cs', args: 'scene random' })
  const after = saved(world)
  expect(after.mode).toBe('station')
  expect(after.scenes.station).not.toBe(before.scenes.station)
})

test('/cs toggle changes a part, a list of parts, and refuses a bad name', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  const one = await $.command.run({ command: 'cs', args: 'toggle background' })
  expect(JSON.stringify(one)).toContain('background: off')
  const many = await $.command.run({ command: 'control-station', args: 'toggle project,today,actions off' })
  expect(JSON.stringify(many)).toContain('project: off')
  const got = saved(world)
  expect(got.parts).toMatchObject({ background: false, project: false, today: false, actions: false, bar: true })

  const bad = await $.command.run({ command: 'cs', args: 'toggle nonsense' })
  expect(JSON.stringify(bad)).toContain('Unknown part: nonsense')
  const old = await $.command.run({ command: 'cs', args: 'toggle files' })
  expect(JSON.stringify(old)).toContain('Unknown part: files')

  const pane = await $.ui.mount(PANE)
  const text = flat(await pane.drawn())
  // A part that is off is not drawn; the scene's name always is, and with the art off
  // the context gauge becomes a bar among the limits.
  expect(text).not.toContain('prompts')
  expect(text).not.toContain('demo')
  expect(text).toContain('OXYGEN')
  expect(text).toContain('Observation Ring')
  await pane.unmount()
})

test('/cs mode and scene', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  await $.command.run({ command: 'cs', args: 'mode liminal' })
  expect(saved(world).mode).toBe('liminal')
  await $.command.run({ command: 'cs', args: 'scene poolrooms' })
  expect(saved(world).scenes.liminal).toBe('poolrooms')
  await $.command.run({ command: 'cs', args: 'scene solarpunk' })
  expect(saved(world).mode).toBe('utopia')
  await $.command.run({ command: 'cs', args: 'reset' })
  expect(saved(world).mode).toBe('station')
})

test('the panel shows project, limits and today from the host', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  const pane = await $.ui.mount(PANE)
  const text = flat(await pane.drawn())
  expect(text).toContain('demo')
  expect(text).toContain('main')
  expect(text).toContain('2 uncommitted')
  expect(text).toContain('abc1234')
  expect(text).toContain('42%')
  expect(text).toContain('61%')
  expect(text).toContain('resets in 3h 0m')
  await pane.unmount()
})

test('edited files are counted today, and the panel lists none', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount(PANE)

  await $.tool.call({ tool: 'Edit', file_path: '/work/demo/src/a.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Write', file_path: '/work/demo/src/b.ts', content: 'z' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/demo/src/a.ts', old_string: 'y', new_string: 'w' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect(await pane.find({ type: 'Text', text: /THIS CHAT/ })).toBeUndefined()
  expect(await pane.find({ type: 'Button', key: 'file:/work/demo/src/a.ts' })).toBeUndefined()
  const text = flat(await pane.drawn())
  expect(text).toContain('4 tool actions')
  expect(text).toContain('2 files touched')
  expect(world.ran.some(argv => argv[0] === 'open')).toBe(false)
  await pane.unmount()
})

test('a limit the host does not report is left out of the banner and the panel', async ($, on) => {
  const world = host(on)
  world.limits.length = 0
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  const banner = await $.ui.mount(BAND)
  const pane = await $.ui.mount(PANE)
  const drawn = flat(await banner.drawn()) + flat(await pane.drawn())
  expect(drawn).toContain('42%')
  expect(drawn).not.toContain('ORBIT')
  expect(drawn).not.toContain('VOYAGE')
  expect(drawn).not.toContain('—')
  expect(drawn).toContain('not reported')
  await banner.unmount()
  await pane.unmount()
})

test('every scene draws its text in the face of its mode', async () => {
  const faces = { liminal: 'Helvetica Neue', station: 'SF Mono', utopia: 'Optima' }
  for (const sc of SCENES) {
    const strip = bannerSvg(sc, { usage: EMPTY_USAGE, project: 'demo', branch: 'main', now: NOON }, { uid: 'b', animate: false })
    const card = panelSvg(
      sc,
      { usage: EMPTY_USAGE, project: EMPTY_PROJECT, today: EMPTY_TODAY, now: NOON },
      { uid: 'p', animate: false, isArt: true, parts: { project: true, limits: true, today: true } },
    ).source
    expect(strip).toContain(faces[sc.mode])
    expect(card).toContain(faces[sc.mode])
  }
})

test('today starts over at midnight and adds up other chats', async ($, on) => {
  const day = '2026-10-30'
  // No session start here: its timers would all fall due when the clock jumps a day.
  const world = host(on, {
    [`today:${day}:chat-2`]: { day, prompts: 3, tools: 10, files: ['/x/one.ts', '/x/two.ts'] },
    'today:2026-10-29:chat-9': { day: '2026-10-29', prompts: 99, tools: 99, files: [] },
  })
  const pane = await $.ui.mount(PANE)

  await $.tool.call({ tool: 'Edit', file_path: '/x/one.ts', old_string: 'a', new_string: 'b' })
  expect(flat(await pane.drawn())).toContain('3 prompts · 11 tool actions · 2 files touched')
  expect(world.store.get('today:2026-10-29:chat-9')).toBeUndefined()

  await world.clock.advance(86_400_000)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(flat(await pane.drawn())).toContain('0 prompts · 1 tool actions · 0 files touched')
  expect(world.store.get('today:2026-10-30:chat-2')).toBeUndefined()
  await pane.unmount()
})

test('quick actions run two commands and fill the third', async ($, on) => {
  const world = host(on)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount(PANE)

  await $.ui.press({ plugin: PLUGIN, key: 'simplify' })
  await $.ui.press({ plugin: PLUGIN, key: 'plain' })
  await $.ui.press({ plugin: PLUGIN, key: 'learn' })
  await world.clock.advance(10)
  expect(world.commands).toEqual(['simplify', 'plain-english'])
  expect(world.filled).toEqual(['/anthropic-skills:learn '])
  await pane.unmount()
})

test('a value an earlier version stored is declined', async ($, on) => {
  const world = host(on, {
    prefs: { mode: 'nonsense', scenes: { liminal: 'poolrooms', station: 'missing' }, parts: { files: 'yes' }, editor: 5, isHidden: true },
    'files:old-chat': { t: 0, list: ['/x/one.ts'] },
  })
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ type: 'Select', key: 'mode' })).toBeDefined()
  expect(saved(world).mode).toBe('station')
  // What the file list and the editor setting left behind is dropped.
  expect(saved(world).editor).toBeUndefined()
  expect(saved(world).isHidden).toBeUndefined()
  expect(saved(world).parts.files).toBeUndefined()
  expect(world.store.has('files:old-chat')).toBe(false)
  await pane.unmount()
})
