import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mode, PartKey, Prefs, ProjectSnap, TodaySnap, UsageSnap, Window } from '../types'
import { bannerSvg, gaugeSlots, gaugesAlt, panelSvg, todayAlt } from './art'
import {
  DEFAULT_PREFS,
  EMPTY_PROJECT,
  EMPTY_TODAY,
  EMPTY_USAGE,
  PARTS,
  barText,
  basename,
  clip,
  currentScene,
  dayKey,
  normalizePrefs,
  percentText,
} from './model'
import { MODES, SCENES, scenesOf } from './scenes'

const PANE = 'control-station'
const PREFS_KEY = 'prefs'

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const prefsA = atom({ plugin: 'control-station', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-3' })
const usageA = atom({ plugin: 'control-station', key: 'usage' } as const, EMPTY_USAGE, { shape: 'usage-1' })
const projectA = atom({ plugin: 'control-station', key: 'project' } as const, EMPTY_PROJECT, { shape: 'project-1' })
const todayA = atom({ plugin: 'control-station', key: 'today' } as const, EMPTY_TODAY, { shape: 'today-1' })

type Engine = EngineInterface

// One chat's counts for one day. Each chat writes only its own record, so two
// chats never overwrite each other; the panel sums them.
type Mine = { day: string; prompts: number; tools: number; files: string[] }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

async function savePrefs($: Engine, change: (prefs: Prefs) => Prefs): Promise<Prefs> {
  const next = normalizePrefs(change(await read($, prefsA)))
  await update($, prefsA, () => next)
  await $.store.set(PREFS_KEY, next)
  return next
}

async function syncPrefs($: Engine): Promise<void> {
  const raw = await $.store.get(PREFS_KEY)
  const stored = normalizePrefs(raw)
  // Anything an older version left behind is rewritten in the shape this one reads.
  if (raw !== undefined && !same(raw, stored)) await $.store.set(PREFS_KEY, stored)
  if (!same(stored, await read($, prefsA))) await update($, prefsA, () => stored)
}

function windowOf(limit: { percentUsed: number; resetsAt?: string } | undefined): Window {
  if (limit === undefined) return { percent: null, resetsAt: null }
  const at = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt)
  return { percent: limit.percentUsed, resetsAt: Number.isNaN(at) ? null : at }
}

async function refreshUsage($: Engine): Promise<void> {
  const usage = await $.session.usage()
  const snap: UsageSnap = {
    context: usage.context.percent ?? null,
    tokens: usage.context.tokens ?? null,
    window: usage.context.window,
    five: windowOf(usage.rateLimits.find(limit => limit.kind === 'five_hour')),
    week: windowOf(usage.rateLimits.find(limit => limit.kind === 'seven_day')),
    model: (await $.session.model()).replace(/^claude-/, ''),
  }
  if (!same(snap, await read($, usageA))) await update($, usageA, () => snap)
}

async function git($: Engine, args: string[]): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...args], { timeoutMs: 8000 })
    return run.exitCode === 0 ? run.stdout.trim() : null
  } catch {
    return null
  }
}

async function refreshProject($: Engine): Promise<void> {
  const root = await $.session.root()
  const [branch, status, counts, log] = await Promise.all([
    git($, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git($, ['status', '--porcelain']),
    git($, ['rev-list', '--left-right', '--count', '@{u}...HEAD']),
    git($, ['log', '-3', '--pretty=format:%h%x09%s']),
  ])
  const [behind, ahead] = (counts ?? '').split(/\s+/).map(Number)
  const snap: ProjectSnap = {
    name: basename(root),
    isRepo: branch !== null,
    branch: branch ?? '',
    changes: status === null || status === '' ? 0 : status.split('\n').length,
    ahead: ahead ?? 0,
    behind: behind ?? 0,
    commits: (log ?? '')
      .split('\n')
      .filter(Boolean)
      .map(row => {
        const [hash, ...subject] = row.split('\t')
        return { hash: hash ?? '', subject: subject.join('\t') }
      }),
  }
  if (!same(snap, await read($, projectA))) await update($, projectA, () => snap)
}

const todayKey = (day: string, sid: string) => `today:${day}:${sid}`

function isMine(raw: unknown, day: string): raw is Mine {
  const m = raw as Partial<Mine> | null
  return (
    typeof m === 'object' &&
    m !== null &&
    m.day === day &&
    typeof m.prompts === 'number' &&
    typeof m.tools === 'number' &&
    Array.isArray(m.files)
  )
}

// Adds up every chat's record for today, and drops the records of other days.
async function syncToday($: Engine, day: string): Promise<void> {
  const keys = await $.store.keys()
  const prefix = `today:${day}:`
  let prompts = 0
  let tools = 0
  const files = new Set<string>()
  for (const key of keys) {
    if (!key.startsWith('today:')) continue
    if (!key.startsWith(prefix)) {
      await $.store.delete(key)
      continue
    }
    const raw = await $.store.get(key)
    if (isMine(raw, day)) {
      prompts += raw.prompts
      tools += raw.tools
      for (const file of raw.files) files.add(file)
    }
  }
  const snap: TodaySnap = { prompts, tools, files: files.size }
  if (!same(snap, await read($, todayA))) await update($, todayA, () => snap)
}

let mine: Mine | null = null

async function touch($: Engine, change: (m: Mine) => void): Promise<void> {
  const day = dayKey(await $.clock.now())
  const sid = await $.session.id()
  if (mine === null || mine.day !== day) {
    const raw = await $.store.get(todayKey(day, sid))
    mine = isMine(raw, day) ? raw : { day, prompts: 0, tools: 0, files: [] }
  }
  change(mine)
  await $.store.set(todayKey(day, sid), mine)
  await syncToday($, day)
}

// Counts a file this chat edited once a day, for the files-touched tile.
async function countFile($: Engine, path: string): Promise<void> {
  await touch($, m => {
    if (!m.files.includes(path)) m.files = [...m.files, path].slice(-2000)
  })
}

async function refreshAll($: Engine): Promise<void> {
  await Promise.all([refreshUsage($).catch(() => {}), refreshProject($).catch(() => {})])
  $.ui.invalidate('ui.render')
}

// A press ends its dispatch, and a command a press runs is abandoned with it, so a timer
// starts the command in a dispatch of its own and the run keeps that dispatch alive.
function queueSlash($: Engine, command: string): void {
  $.clock.after(1, () =>
    $.command.run({ command }).catch(() => {
      $.ui.toast(`/${command} could not run`)
    }),
  )
}

function openPanel($: Engine) {
  return $.ui.open({ id: PANE, title: 'Control station', columns: 46 })
}

async function shuffleScene($: Engine): Promise<void> {
  const now = await $.clock.now()
  await savePrefs($, p => {
    const list = scenesOf(p.mode)
    const at = Math.max(0, list.findIndex(s => s.id === p.scenes[p.mode]))
    const next = list[(at + 1 + (now % Math.max(1, list.length - 1))) % list.length]!
    return { ...p, scenes: { ...p.scenes, [p.mode]: next.id } }
  })
}


async function runCommand($: Engine, args: string): Promise<{ text: string }> {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const verb = words[0] ?? 'status'
  const prefs = await read($, prefsA)

  if (verb === 'toggle') {
    const rest = words.slice(1)
    const forced = rest[rest.length - 1] === 'on' ? true : rest[rest.length - 1] === 'off' ? false : null
    const names = (forced === null ? rest : rest.slice(0, -1)).join(',').split(',').filter(Boolean)
    const known = PARTS.map(part => part.key as string)
    const bad = names.filter(name => !known.includes(name))
    if (names.length === 0 || bad.length > 0) {
      return {
        text: `${bad.length > 0 ? `Unknown part: ${bad.join(', ')}. ` : ''}Parts: ${known.join(', ')}.\nUse /cs toggle <part>[,<part>…] [on|off].`,
      }
    }
    const next = await savePrefs($, p => {
      const parts = { ...p.parts }
      for (const name of names as PartKey[]) parts[name] = forced ?? !parts[name]
      return { ...p, parts }
    })
    if (!next.parts.panel) await $.ui.close({ id: PANE })
    return { text: names.map(name => `${name}: ${next.parts[name as PartKey] ? 'on' : 'off'}`).join('\n') }
  }

  if (verb === 'mode') {
    const wanted = MODES.find(m => m.id.startsWith(words[1] ?? '\0') || m.label.toLowerCase().startsWith(words[1] ?? '\0'))
    if (wanted === undefined) return { text: `Modes: ${MODES.map(m => m.id).join(', ')}.` }
    const next = await savePrefs($, p => ({ ...p, mode: wanted.id }))
    return { text: `Mode: ${wanted.label} · scene: ${currentScene(next).title}` }
  }

  if (verb === 'scene') {
    const query = words.slice(1).join(' ')
    const list = scenesOf(prefs.mode)
    let pick = SCENES.find(s => s.id === query || s.title.toLowerCase() === query)
    pick ??= SCENES.find(s => query !== '' && (s.id.includes(query.replace(/\s+/g, '-')) || s.title.toLowerCase().includes(query)))
    if (query === 'next') pick = list[(list.findIndex(s => s.id === prefs.scenes[prefs.mode]) + 1) % list.length]
    if (query === 'random') {
      await shuffleScene($)
      return { text: `Scene: ${currentScene(await read($, prefsA)).title}` }
    }
    if (pick === undefined) {
      return { text: `Scenes: ${SCENES.map(s => s.id).join(', ')}.\nOr: next, random.` }
    }
    const chosen = pick
    await savePrefs($, p => ({ ...p, mode: chosen.mode, scenes: { ...p.scenes, [chosen.mode]: chosen.id } }))
    return { text: `Scene: ${chosen.title}` }
  }

  if (verb === 'open' || verb === 'close') {
    if (verb === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Panel closed.' }
    }
    if (!prefs.parts.panel) return { text: 'The panel is off. /cs toggle panel on' }
    const opened = await openPanel($)
    return { text: opened.isPlaced ? 'Panel opened.' : 'The panel has no room to open here.' }
  }

  if (verb === 'reset') {
    await savePrefs($, () => DEFAULT_PREFS)
    return { text: 'Control station reset to its defaults.' }
  }

  if (verb === 'status') {
    const scene = currentScene(prefs)
    return {
      text: [
        `Mode: ${MODES.find(m => m.id === prefs.mode)?.label} · scene: ${scene.title}`,
        PARTS.map(part => `${part.key} ${prefs.parts[part.key] ? 'on' : 'off'}`).join(' · '),
      ].join('\n'),
    }
  }

  return {
    text: [
      '/control-station (or /cs)',
      '  toggle <part>[,<part>…] [on|off]   parts: ' + PARTS.map(part => part.key).join(', '),
      '  mode <liminal|station|utopia>',
      '  scene <name|next|random>',
      '  open | close      the side panel',
      '  status | reset',
    ].join('\n'),
  }
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'control-station',
      description: 'Sci-fi control deck: toggle parts, switch mode or scene, open the panel',
      argumentHint: 'toggle <part> | mode <name> | scene <name> | open | status | reset',
      immediate: true,
    })
    await $.command.register({
      name: 'cs',
      description: 'Short for /control-station',
      argumentHint: 'toggle <part> | mode <name> | scene <name> | open | status | reset',
      immediate: true,
    })

    await syncPrefs($)
    if ((await $.store.get(PREFS_KEY)) === undefined) await $.store.set(PREFS_KEY, await read($, prefsA))

    // An earlier version kept a list of edited files for each chat; none is kept now.
    for (const key of await $.store.keys()) {
      if (key.startsWith('files:')) await $.store.delete(key)
    }

    await syncToday($, dayKey(await $.clock.now()))
    await refreshAll($)
    $.clock.every(60_000, () => void refreshAll($).catch(() => {}))
    $.clock.every(5_000, () => void syncPrefs($).catch(() => {}))
    $.clock.every(20_000, () => void (async () => syncToday($, dayKey(await $.clock.now())))().catch(() => {}))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined) {
      try {
        await touch($, m => void (m.prompts += 1))
      } catch {
        // Counting never stands in the way of a prompt.
      }
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      await touch($, m => void (m.tools += 1))
      const path =
        e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : undefined
      if (path !== undefined && ran.deny === undefined && ran.isError !== true) await countFile($, path)
    } catch {
      // Counting never stands in the way of a tool.
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await refreshUsage($).catch(() => {})
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refreshUsage($).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'control-station' }, async ($, e) => runCommand($, e.args))
  on('command.run', { command: 'cs' }, async ($, e) => runCommand($, e.args))

  // The banner above the prompt. Whatever the app draws there stays; the strip goes below it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const theirs = await next(e)
    if (e.surface !== 'desktop' || e.props.hasSurvey) return theirs
    const prefs = await read($, prefsA)
    if (!prefs.parts.bar) return theirs

    const { Box, Svg } = $.ui.resolve(e)
    const sc = currentScene(prefs)

    const usage = await read($, usageA)
    const project = await read($, projectA)
    const today = await read($, todayA)
    const now = await $.clock.now()
    const source = bannerSvg(
      sc,
      { usage, project: project.name, branch: project.branch, now, today },
      { uid: `csb-${sc.id}`, animate: prefs.parts.animation },
    )
    const { slots } = gaugeSlots(sc, usage, now)
    const alt = `${sc.title}: ${sc.motto} ${gaugesAlt(slots)}.`

    return (
      <Box flexDirection="column">
        {theirs}
        <Box marginTop={1}>
          <Svg source={source} alt={alt} width={760} height={48} isInteractive={prefs.parts.animation} />
        </Box>
      </Box>
    )
  })

  // The side panel: the mode and scene dropdowns, then the scene with the limits, today and project
  // written over it as one drawing, then the quick actions.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Select, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const prefs = await read($, prefsA)
    const usage = await read($, usageA)
    const project = await read($, projectA)
    const today = await read($, todayA)
    const now = await $.clock.now()
    const sc = currentScene(prefs)
    const bar = Math.max(10, Math.min(24, (e.props.bodyColumns ?? 40) - 14))
    const { slots, isMissing } = gaugeSlots(sc, usage, now)
    const panel =
      Svg === undefined
        ? null
        : panelSvg(
            sc,
            { usage, project, today, now },
            { uid: `csp-${sc.id}`, animate: prefs.parts.animation, isArt: prefs.parts.background, parts: prefs.parts },
          )

    const section = (label: string, kids: unknown) => (
      <Box flexDirection="column" backgroundColor={sc.base} paddingX={1} marginTop={1}>
        <Text color={sc.accent} bold>
          {label}
        </Text>
        {kids}
      </Box>
    )

    return (
      <Box flexDirection="column" flexGrow={1} backgroundColor={sc.base}>
        <Box flexDirection="column" backgroundColor={sc.base} paddingX={1} paddingTop={1} gap={1}>
          <Select
            key="mode"
            label="Mode"
            options={MODES.map(m => ({ value: m.id, label: m.label }))}
            value={prefs.mode}
            onSelect={value => void savePrefs($, p => ({ ...p, mode: value as Mode }))}
          />
          <Select
            key="scene"
            label="Scene"
            options={scenesOf(prefs.mode).map(s => ({ value: s.id, label: s.title }))}
            value={prefs.scenes[prefs.mode]}
            onSelect={value => void savePrefs($, p => ({ ...p, scenes: { ...p.scenes, [p.mode]: value } }))}
          />
        </Box>

        {Svg !== undefined && panel !== null ? (
          <Box marginTop={1} backgroundColor={sc.base}>
            <Svg source={panel.source} alt={panel.alt} width={340} height={panel.height} isInteractive={prefs.parts.animation} />
          </Box>
        ) : (
          <Box flexDirection="column" backgroundColor={sc.base}>
            <Box flexDirection="column" paddingX={1} marginTop={1}>
              <Text color={sc.ink} bold>
                {sc.title}
              </Text>
              <Text color={sc.ink} dimColor>
                {sc.motto}
              </Text>
            </Box>
            {prefs.parts.project &&
              section(
                project.name.toUpperCase() || 'PROJECT',
                <Box flexDirection="column">
                  <Text color={sc.ink} bold>
                    {project.isRepo ? `⎇ ${project.branch}` : 'not a git repository'}
                  </Text>
                  {project.isRepo && (
                    <Text color={sc.ink} dimColor>
                      {project.changes} uncommitted · ↑{project.ahead} ↓{project.behind}
                    </Text>
                  )}
                  {project.commits.map(commit => (
                    <Text key={commit.hash} color={sc.ink} dimColor>
                      {commit.hash} {clip(commit.subject, 36)}
                    </Text>
                  ))}
                </Box>,
              )}
            {prefs.parts.limits &&
              section(
                'LIMITS',
                <Box flexDirection="column">
                  {slots.map(one => (
                    <Box key={one.name} flexDirection="column">
                      <Text color={sc.ink}>
                        {one.name} <Text color={sc.accent}>{barText(one.percent, bar)}</Text> {percentText(one.percent)}
                      </Text>
                      <Text color={sc.ink} dimColor>
                        {one.note}
                      </Text>
                    </Box>
                  ))}
                  {isMissing && (
                    <Text color={sc.ink} dimColor>
                      Limits not reported for this session are left out.
                    </Text>
                  )}
                </Box>,
              )}
            {prefs.parts.today && section('TODAY', <Text color={sc.ink}>{todayAlt(today)}</Text>)}
          </Box>
        )}

        {prefs.parts.actions &&
          section(
            'QUICK ACTIONS',
            <Box gap={2}>
              <Button key="simplify" label="Simplify" onPress={() => queueSlash($, 'simplify')} />
              <Button key="plain" label="Plain English" onPress={() => queueSlash($, 'plain-english')} />
              <Button key="learn" label="Learn…" onPress={() => void $.prompt.fill({ text: '/anthropic-skills:learn ', mode: 'replace' })} />
            </Box>,
          )}
        <Box flexGrow={1} backgroundColor={sc.base} />
      </Box>
    )
  })
}
