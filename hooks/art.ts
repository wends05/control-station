// Original SVG art for the nine scenes and the banner strip. Everything is
// drawn from code: a seeded random source keeps each scene identical on every
// draw, and every id carries a per-drawing prefix so two drawings on one page
// never share a gradient, mask or clip path.
import type { ProjectSnap, TodaySnap, UsageSnap } from '../types'
import { clip, percentText, resetText, tokensText } from './model'
import { MODES } from './scenes'
import type { Scene } from './scenes'

const W = 340
const H = 440

export type ArtOptions = { uid: string; animate: boolean; context: number | null }

type P = {
  uid: string
  animate: boolean
  sc: Scene
  // Context used, 0 to 1.
  c: number
  rnd: () => number
}

const f = (n: number) => String(Math.round(n * 10) / 10)

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')
}

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '', kids = '') =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}>${kids}</rect>`
const circ = (cx: number, cy: number, r: number, fill: string, extra = '', kids = '') =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" ${extra}>${kids}</circle>`
const poly = (pts: number[][], fill: string, extra = '') =>
  `<polygon points="${pts.map(q => `${f(q[0]!)},${f(q[1]!)}`).join(' ')}" fill="${fill}" ${extra}/>`
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 1, extra = '') =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`
const path = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`

// A looping attribute animation. A negative begin starts it part-way round, so
// the first frame is already mid-motion.
function loop(p: P, attr: string, values: string, dur: number, begin: number): string {
  return p.animate
    ? `<animate attributeName="${attr}" values="${values}" dur="${f(dur)}s" begin="-${f(begin)}s" repeatCount="indefinite"/>`
    : ''
}

function drift(p: P, dx: number, dur: number, begin: number): string {
  return p.animate
    ? `<animateTransform attributeName="transform" type="translate" values="${-dx} 0;${dx} 0;${-dx} 0" dur="${f(dur)}s" begin="-${f(begin)}s" repeatCount="indefinite"/>`
    : ''
}

function stars(p: P, count: number, y0: number, y1: number, color: string): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = p.rnd() * W
    const y = y0 + p.rnd() * (y1 - y0)
    const s = 0.5 + p.rnd() * 1.1
    const o = 0.35 + p.rnd() * 0.5
    const dur = 2 + p.rnd() * 4
    const begin = p.rnd() * 6
    out += circ(x, y, s, color, `opacity="${f(o)}"`, loop(p, 'opacity', `${f(o)};${f(o * 0.2)};${f(o)}`, dur, begin))
  }
  return out
}

function fog(p: P, y: number, ry: number, op: number, dur: number): string {
  const begin = p.rnd() * dur
  return `<ellipse cx="170" cy="${f(y)}" rx="240" ry="${f(ry)}" fill="url(#${p.uid}-fog)" opacity="${op}">${drift(p, 26, dur, begin)}</ellipse>`
}

function glow(p: P, x: number, y: number, r: number, op = 0.5): string {
  return circ(x, y, r, `url(#${p.uid}-glow)`, `opacity="${op}"`)
}

function flicker(p: P, op: number): string {
  const dur = 1.4 + p.rnd() * 3
  const begin = p.rnd() * 5
  return loop(p, 'opacity', `${op};${f(op * 0.55)};${op};${f(op * 0.9)};${op}`, dur, begin)
}

// A one-point-perspective hall: ceiling, floor and two walls meeting a back
// wall at the vanishing point. depth 0 is the back wall and 1 the viewer.
function hall(p: P, vx: number, vy: number, halfW: number, halfH: number) {
  const { sc } = p
  const top = (t: number) => (vy - halfH) * (1 - t)
  const bottom = (t: number) => vy + halfH + (H - vy - halfH) * t
  const left = (t: number) => (vx - halfW) * (1 - t)
  const right = (t: number) => vx + halfW + (W - vx - halfW) * t
  let s = rect(0, 0, W, H, sc.base)
  s += poly([[0, 0], [W, 0], [vx + halfW, vy - halfH], [vx - halfW, vy - halfH]], mix(sc.base, '#000000', 0.3))
  s += poly([[0, H], [W, H], [vx + halfW, vy + halfH], [vx - halfW, vy + halfH]], sc.mid)
  s += poly([[0, 0], [vx - halfW, vy - halfH], [vx - halfW, vy + halfH], [0, H]], mix(sc.mid, sc.base, 0.4))
  s += poly([[W, 0], [vx + halfW, vy - halfH], [vx + halfW, vy + halfH], [W, H]], mix(sc.mid, sc.base, 0.4))
  s += rect(vx - halfW, vy - halfH, halfW * 2, halfH * 2, mix(sc.accent, sc.base, 0.25))
  return { s, top, bottom, left, right }
}

type Hall = ReturnType<typeof hall>

function floorLines(p: P, h: Hall, vx: number, vy: number, halfW: number, halfH: number, color: string): string {
  let s = ''
  for (let i = -4; i <= 4; i++) {
    s += line(vx + (i * halfW) / 4, vy + halfH, vx + i * 62, H, color, 1, 'opacity=".5"')
  }
  for (let i = 1; i <= 7; i++) {
    const t = Math.pow(i / 7, 1.9)
    s += line(h.left(t), h.bottom(t), h.right(t), h.bottom(t), color, 1, 'opacity=".45"')
  }
  return s
}

function atrium(p: P): string {
  const { sc } = p
  const vx = 170
  const vy = 238
  const h = hall(p, vx, vy, 36, 28)
  let s = h.s
  s += glow(p, vx, vy, 120, 0.6)
  s += floorLines(p, h, vx, vy, 36, 28, sc.accent)
  for (const t of [0.1, 0.22, 0.38, 0.6, 0.92]) {
    const cw = 6 + 26 * t
    const yTop = h.top(t)
    const yBot = h.bottom(t)
    s += rect(h.left(t), yTop, cw, yBot - yTop, mix(sc.mid, sc.accent, 0.12), 'opacity=".95"')
    s += rect(h.right(t) - cw, yTop, cw, yBot - yTop, mix(sc.mid, sc.accent, 0.12), 'opacity=".95"')
  }
  for (const t of [0.14, 0.3, 0.52]) {
    const wd = 30 + 120 * t
    const y = h.top(t) + 4 + 8 * t
    s += rect(vx - wd / 2, y, wd, 3 + 5 * t, sc.accent, 'opacity=".8"', flicker(p, 0.8))
  }
  s += fog(p, 262, 26, 0.5, 15)
  // The moon in the skylight shows how full the context is.
  const mx = 170
  const my = 62
  const mr = 27
  s += circ(mx, my, mr + 3, '#070705')
  s += `<clipPath id="${p.uid}-moon"><circle cx="${mx}" cy="${my}" r="${mr}"/></clipPath>`
  s += `<g clip-path="url(#${p.uid}-moon)">${circ(mx, my, mr, sc.accent, 'opacity=".95"')}${circ(mx + p.c * mr * 2, my, mr, '#070705')}</g>`
  s += circ(mx, my, mr + 3, 'none', `stroke="${sc.accent}" stroke-width="1.2" opacity=".6"`)
  s += stars(p, 14, 20, 100, sc.ink)
  return s
}

function parking(p: P): string {
  const { sc } = p
  const vx = 190
  const vy = 250
  const h = hall(p, vx, vy, 42, 22)
  let s = h.s
  s += glow(p, vx, vy, 90, 0.4)
  s += floorLines(p, h, vx, vy, 42, 22, sc.ink)
  for (const t of [0.12, 0.28, 0.5, 0.78]) {
    const y = h.top(t)
    s += poly([[h.left(t), y], [h.right(t), y], [h.right(t) + 10, y + 12 + 14 * t], [h.left(t) - 10, y + 12 + 14 * t]], mix(sc.base, '#000000', 0.55))
  }
  for (const t of [0.18, 0.4, 0.7, 0.98]) {
    const yTop = h.top(t)
    const yBot = h.bottom(t)
    const pw = 8 + 30 * t
    s += rect(h.left(t) + 18 * t, yTop, pw, yBot - yTop, mix(sc.mid, sc.ink, 0.1))
    s += rect(h.left(t) + 18 * t, yBot - 18 * t, pw, 5 * t + 2, sc.accent, 'opacity=".85"')
  }
  for (const t of [0.16, 0.36, 0.62]) {
    const lx = vx - 8 + (p.rnd() - 0.5) * 10
    const ly = h.top(t) + 14 + 22 * t
    s += glow(p, lx, ly, 30 + 70 * t, 0.7)
    s += rect(lx - 14 - 20 * t, ly - 2, 28 + 40 * t, 3 + 3 * t, '#fff3d6', '', flicker(p, 1))
  }
  s += fog(p, 275, 20, 0.35, 18)
  // A fuel-gauge dial on the wall: empty to full as the context fills.
  const cx = 170
  const cy = 92
  const r = 38
  s += circ(cx, cy, r + 6, mix(sc.base, '#000000', 0.5), `stroke="${sc.accent}" stroke-width="1" opacity=".95"`)
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (Math.PI * i) / 10
    const l = i % 5 === 0 ? 9 : 5
    s += line(cx + Math.cos(a) * (r - l), cy - Math.sin(a) * (r - l), cx + Math.cos(a) * r, cy - Math.sin(a) * r, sc.ink, i % 5 === 0 ? 1.6 : 1, 'opacity=".8"')
  }
  const na = Math.PI - Math.PI * p.c
  s += line(cx, cy, cx + Math.cos(na) * (r - 6), cy - Math.sin(na) * (r - 6), sc.accent, 2.2, `stroke-linecap="round"`)
  s += circ(cx, cy, 4, sc.accent)
  return s
}

function poolrooms(p: P): string {
  const { sc } = p
  const vx = 170
  const vy = 240
  const h = hall(p, vx, vy, 40, 30)
  let s = h.s
  const water = mix(sc.mid, sc.accent, 0.25)
  s += poly([[0, H], [W, H], [vx + 40, vy + 30], [vx - 40, vy + 30]], water, 'opacity=".95"')
  s += glow(p, vx, vy + 10, 120, 0.5)
  for (let i = 1; i <= 9; i++) {
    const t = Math.pow(i / 9, 1.8)
    s += line(h.left(t), h.top(t) + (h.bottom(t) - h.top(t)) * 0.18, h.left(t) * 0.2, h.top(t) * 0.7, sc.accent, 1, 'opacity=".12"')
    s += line(h.left(t), h.bottom(t), h.right(t), h.bottom(t), sc.ink, 1, 'opacity=".2"')
  }
  for (const t of [0.15, 0.3, 0.5, 0.75]) {
    const archW = 22 + 70 * t
    const y0 = h.top(t) + (h.bottom(t) - h.top(t)) * 0.22
    s += path(`M${f(h.left(t))} ${f(h.bottom(t) - 4)} L${f(h.left(t))} ${f(y0 + archW)} Q${f(h.left(t) + archW * 0.7)} ${f(y0)} ${f(h.left(t) + archW * 1.4)} ${f(y0 + archW)} L${f(h.left(t) + archW * 1.4)} ${f(h.bottom(t) - 4)} Z`, mix(sc.base, '#000000', 0.5), 'opacity=".7"')
    s += path(`M${f(h.right(t))} ${f(h.bottom(t) - 4)} L${f(h.right(t))} ${f(y0 + archW)} Q${f(h.right(t) - archW * 0.7)} ${f(y0)} ${f(h.right(t) - archW * 1.4)} ${f(y0 + archW)} L${f(h.right(t) - archW * 1.4)} ${f(h.bottom(t) - 4)} Z`, mix(sc.base, '#000000', 0.5), 'opacity=".7"')
  }
  for (let i = 0; i < 7; i++) {
    const cx = 60 + p.rnd() * 220
    const cy = 290 + p.rnd() * 120
    const rx = 18 + p.rnd() * 34
    const dur = 3 + p.rnd() * 3
    const begin = p.rnd() * 4
    s += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(rx * 0.18)}" fill="none" stroke="${sc.ink}" stroke-width="1" opacity=".3">${loop(p, 'rx', `${f(rx * 0.6)};${f(rx)};${f(rx * 0.6)}`, dur, begin)}</ellipse>`
  }
  s += fog(p, 258, 22, 0.4, 20)
  // A tall window of water: the level is the context used.
  const fx = 138
  const fy = 18
  const fw = 64
  const fh = 112
  s += rect(fx, fy, fw, fh, mix(sc.base, '#000000', 0.5), `stroke="${sc.accent}" stroke-width="1.5" rx="5"`)
  const wh = fh * p.c
  s += rect(fx + 2, fy + fh - wh - 2, fw - 4, wh, water, 'opacity=".95"')
  s += rect(fx + 2, fy + fh - wh - 2, fw - 4, 3, sc.accent, 'opacity=".9"', loop(p, 'opacity', '.9;.4;.9', 3, 0.4))
  return s
}

function observation(p: P): string {
  const { sc } = p
  let s = rect(0, 0, W, H, sc.base)
  s += stars(p, 70, 0, 300, sc.ink)
  s += glow(p, 170, 330, 230, 0.5)
  s += circ(170, 520, 310, 'none', `stroke="${sc.accent}" stroke-width="7" opacity=".14"`)
  s += circ(170, 520, 300, `url(#${p.uid}-planet)`, `stroke="${sc.accent}" stroke-width="3" opacity=".95"`)
  s += circ(170, 520, 292, 'none', `stroke="${sc.ink}" stroke-width="1" opacity=".25"`)
  for (let i = 0; i < 5; i++) {
    const rr = 200 + i * 22
    s += `<circle cx="${f(120 + i * 22)}" cy="${f(540)}" r="${f(rr)}" fill="none" stroke="${sc.accent}" stroke-width="1" opacity=".1"/>`
  }
  // The orbit, with a satellite that sweeps left to right as the context fills.
  const ox = 170
  const oy = 190
  const rx = 128
  const ry = 52
  s += `<ellipse cx="${ox}" cy="${oy}" rx="${rx}" ry="${ry}" fill="none" stroke="${sc.accent}" stroke-width="1.2" stroke-dasharray="3 5" opacity=".7"/>`
  const th = Math.PI + Math.PI * p.c
  const sx = ox + rx * Math.cos(th)
  const sy = oy + ry * Math.sin(th)
  s += glow(p, sx, sy, 22, 0.9)
  s += circ(sx, sy, 4.5, sc.ink, '', loop(p, 'r', '4.5;5.5;4.5', 2.6, 0.7))
  s += rect(sx - 9, sy - 1, 18, 2, sc.accent, 'opacity=".8"')
  // The ring's window frame and rail in the foreground.
  s += poly([[0, 0], [38, 0], [18, H], [0, H]], mix(sc.mid, sc.base, 0.3))
  s += poly([[W, 0], [W - 38, 0], [W - 18, H], [W, H]], mix(sc.mid, sc.base, 0.3))
  s += rect(0, 330, W, 110, mix(sc.base, '#000000', 0.35))
  s += rect(0, 328, W, 4, sc.accent, 'opacity=".55"')
  for (let i = 0; i < 12; i++) s += rect(14 + i * 28, 332, 3, 30, mix(sc.mid, sc.ink, 0.25))
  s += rect(0, 362, W, 3, mix(sc.mid, sc.ink, 0.3))
  return s
}

function reactor(p: P): string {
  const { sc } = p
  let s = rect(0, 0, W, H, sc.base)
  for (let i = 0; i < 6; i++) s += rect(0, 40 + i * 62, W, 2, mix(sc.mid, sc.accent, 0.12))
  for (const x of [26, 52, 288, 314]) s += rect(x, 0, 9, 360, mix(sc.mid, sc.ink, 0.12))
  for (const y of [112, 170, 232]) {
    s += rect(0, y, 120, 8, mix(sc.mid, sc.ink, 0.18))
    s += rect(220, y + 14, 120, 8, mix(sc.mid, sc.ink, 0.18))
  }
  s += glow(p, 170, 192, 170, 0.55)
  s += rect(128, 52, 84, 292, mix(sc.base, sc.mid, 0.6), `stroke="${sc.accent}" stroke-width="1.4" rx="10"`)
  const coreR = 24
  s += circ(170, 192, coreR + 14, mix(sc.accent, sc.base, 0.7), '', loop(p, 'opacity', '.8;1;.8', 2.8, 0.9))
  s += circ(170, 192, coreR, sc.accent, '', loop(p, 'r', `${coreR};${coreR + 4};${coreR}`, 2.8, 0.9))
  s += circ(170, 192, 9, '#fff6ec', 'opacity=".95"')
  // A ring of segments around the core lights up as the context fills.
  const lit = Math.round(p.c * 40)
  for (let i = 0; i < 40; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 40
    const r0 = 66
    const r1 = 78
    const on = i < lit
    s += line(170 + Math.cos(a) * r0, 192 + Math.sin(a) * r0, 170 + Math.cos(a) * r1, 192 + Math.sin(a) * r1, on ? sc.accent : mix(sc.mid, sc.ink, 0.2), 3, `stroke-linecap="round" opacity="${on ? 1 : 0.7}"`)
  }
  s += rect(0, 344, W, 6, mix(sc.mid, sc.ink, 0.25))
  s += rect(0, 350, W, 90, mix(sc.base, '#000000', 0.4))
  for (let i = 0; i < 14; i++) s += rect(i * 25, 332, 2, 12, mix(sc.mid, sc.ink, 0.3))
  s += rect(0, 332, W, 2, mix(sc.mid, sc.ink, 0.3))
  for (const x of [34, 306, 100, 240]) {
    s += circ(x, 322, 3.4, '#ff3b2f', '', loop(p, 'opacity', '1;.15;1', 1.6 + p.rnd(), p.rnd() * 2))
  }
  s += fog(p, 352, 18, 0.55, 14)
  s += stars(p, 8, 10, 40, sc.accent)
  return s
}

function hydroponics(p: P): string {
  const { sc } = p
  let s = rect(0, 0, W, H, sc.base)
  s += glow(p, 170, 200, 220, 0.35)
  for (let i = 0; i < 6; i++) s += rect(i * 60 - 10, 0, 2, 380, mix(sc.mid, sc.accent, 0.1))
  for (const y of [190, 262, 334]) {
    s += rect(0, y - 40, W, 3, mix(sc.accent, sc.base, 0.35), 'opacity=".7"', flicker(p, 0.7))
    s += `<polygon points="30,${y - 37} 310,${y - 37} 340,${y - 4} 0,${y - 4}" fill="${sc.accent}" opacity=".07"/>`
    s += rect(0, y, W, 6, mix(sc.mid, sc.ink, 0.22))
    s += rect(0, y + 6, W, 6, mix(sc.base, '#000000', 0.4))
    for (let x = 6; x < W; x += 22) {
      const hgt = 8 + p.rnd() * 22
      const tilt = (p.rnd() - 0.5) * 14
      s += path(`M${f(x)} ${y} Q${f(x + tilt)} ${f(y - hgt * 0.6)} ${f(x + tilt * 1.4)} ${f(y - hgt)} Q${f(x + 6 + tilt * 0.6)} ${f(y - hgt * 0.5)} ${f(x + 9)} ${y} Z`, mix(sc.accent, sc.mid, 0.35 + p.rnd() * 0.3), 'opacity=".9"')
    }
  }
  // A growth tube: the nutrient level is the context used, with bubbles rising.
  const tx = 150
  const ty = 18
  const tw = 40
  const th = 120
  s += rect(tx, ty, tw, th, mix(sc.base, '#000000', 0.4), `stroke="${sc.ink}" stroke-width="1.4" rx="14" opacity=".95"`)
  const lh = (th - 8) * p.c
  s += rect(tx + 3, ty + th - 4 - lh, tw - 6, lh, mix(sc.accent, sc.mid, 0.25), 'rx="10" opacity=".92"')
  for (let i = 0; i < 5; i++) {
    const bx = tx + 10 + p.rnd() * (tw - 20)
    const dur = 3 + p.rnd() * 3
    const begin = p.rnd() * 4
    const by = ty + th - 8
    s += circ(bx, by, 1.8, sc.ink, 'opacity=".6"', loop(p, 'cy', `${f(by)};${f(Math.max(ty + 8, ty + th - lh))}`, dur, begin))
  }
  s += fog(p, 392, 24, 0.5, 16)
  return s
}

function arcology(p: P): string {
  const { sc } = p
  let s = rect(0, 0, W, H, sc.base)
  s += stars(p, 22, 0, 90, sc.ink)
  for (let i = 0; i < 12; i++) {
    const w = 18 + p.rnd() * 26
    const hh = 60 + p.rnd() * 140
    s += rect(i * 30 - 6, 330 - hh, w, hh, mix(sc.mid, sc.base, 0.45), 'opacity=".8"')
  }
  s += glow(p, 170, 220, 190, 0.35)
  const tiers = 8
  const lit = Math.ceil(p.c * tiers)
  for (let i = 0; i < tiers; i++) {
    const w = 250 - i * 27
    const y = 330 - (i + 1) * 30
    const on = i < lit
    s += rect(170 - w / 2, y, w, 28, mix(sc.mid, sc.base, 0.15), `stroke="${on ? sc.accent : mix(sc.mid, sc.ink, 0.2)}" stroke-width="${on ? 1.6 : 1}"`)
    for (let x = 170 - w / 2 + 6; x < 170 + w / 2 - 8; x += 11) {
      const isOn = p.rnd() < (on ? 0.7 : 0.28)
      s += rect(x, y + 8, 5, 10, isOn ? sc.accent : mix(sc.mid, sc.base, 0.4), `opacity="${isOn ? 0.75 : 0.5}"`)
    }
  }
  s += rect(168, 70, 4, 30, sc.ink, 'opacity=".7"')
  s += circ(170, 68, 3.4, '#ff5d5d', '', loop(p, 'opacity', '1;.2;1', 2.2, 0.5))
  for (let i = 0; i < 4; i++) {
    const y = 120 + i * 40
    const dur = 7 + p.rnd() * 6
    const begin = p.rnd() * dur
    s += circ(60, y, 1.8, sc.ink, 'opacity=".7"', `${p.animate ? `<animate attributeName="cx" values="30;310;30" dur="${f(dur)}s" begin="-${f(begin)}s" repeatCount="indefinite"/>` : ''}`)
  }
  s += rect(0, 330, W, 110, mix(sc.base, '#000000', 0.3))
  s += fog(p, 336, 22, 0.55, 17)
  return s
}

function dawn(p: P): string {
  const { sc } = p
  const horizon = 268
  let s = rect(0, 0, W, H, sc.base)
  s += `<rect x="0" y="0" width="${W}" height="${horizon}" fill="url(#${p.uid}-sky)"/>`
  const sy = 308 - p.c * 190
  s += glow(p, 170, sy, 150, 0.85)
  s += circ(170, sy, 36, '#ffe3bd', 'opacity=".96"', loop(p, 'r', '36;38;36', 4, 1))
  s += stars(p, 20, 0, 90, sc.ink)
  for (let i = 0; i < 9; i++) {
    const w = 22 + p.rnd() * 30
    const hh = 40 + p.rnd() * 110
    const x = i < 5 ? i * 26 - 8 : 340 - (i - 4) * 28
    s += rect(x, horizon - hh, w, hh + 2, mix(sc.base, sc.mid, 0.35))
  }
  s += rect(0, horizon, W, H - horizon, mix(sc.mid, sc.base, 0.35))
  for (let i = 1; i <= 8; i++) {
    const y = horizon + Math.pow(i / 8, 1.8) * (H - horizon)
    s += line(0, y, W, y, sc.accent, 1, 'opacity=".12"')
  }
  for (let i = -5; i <= 5; i++) s += line(170 + i * 8, horizon, 170 + i * 66, H, sc.accent, 1, 'opacity=".1"')
  for (const x of [34, 306]) {
    s += rect(x, 150, 4, 130, mix(sc.mid, sc.ink, 0.25))
    s += poly([[x - 8, 150], [x + 12, 150], [x + 16, 164], [x - 12, 164]], mix(sc.mid, sc.ink, 0.35))
    s += rect(x + 10, 168, 8, 70, sc.accent, 'opacity=".55"')
  }
  // A quiet crowd facing the sun, long shadows falling toward the viewer.
  for (let row = 0; row < 3; row++) {
    const y = 300 + row * 34
    const scale = 0.7 + row * 0.35
    for (let i = 0; i < 6; i++) {
      const x = 50 + i * 48 + (row % 2) * 22 + (p.rnd() - 0.5) * 12
      s += poly([[x - 3 * scale, y], [x + 3 * scale, y], [x + 16 * scale, y + 20 * scale], [x + 8 * scale, y + 20 * scale]], '#000000', 'opacity=".16"')
      s += rect(x - 4 * scale, y - 16 * scale, 8 * scale, 17 * scale, mix(sc.base, '#000000', 0.5), `rx="2"`)
      s += circ(x, y - 20 * scale, 3.6 * scale, mix(sc.base, '#000000', 0.5))
    }
  }
  s += fog(p, horizon + 6, 18, 0.5, 19)
  return s
}

function solarpunk(p: P): string {
  const { sc } = p
  let s = rect(0, 0, W, H, sc.base)
  s += `<rect x="0" y="0" width="${W}" height="300" fill="url(#${p.uid}-sky)"/>`
  s += glow(p, 270, 70, 80, 0.8)
  s += circ(270, 70, 22, sc.accent, 'opacity=".95"', loop(p, 'r', '22;23.5;22', 5, 2))
  s += path('M0 250 Q80 190 170 240 T340 215 L340 440 L0 440 Z', mix(sc.mid, sc.base, 0.35))
  s += path('M0 290 Q100 250 200 285 T340 270 L340 440 L0 440 Z', mix(sc.mid, sc.accent, 0.1))
  // A greenhouse dome with its ribs.
  s += path('M18 300 A58 58 0 0 1 134 300 Z', mix(sc.accent, sc.base, 0.78), `stroke="${sc.ink}" stroke-width="1" opacity=".9"`)
  for (let i = 1; i < 4; i++) s += line(18 + i * 29, 300, 76, 242, sc.ink, 1, 'opacity=".35"')
  s += rect(18, 298, 116, 5, mix(sc.mid, sc.ink, 0.2))
  // A wind turbine whose blades turn.
  s += rect(299, 150, 4, 150, mix(sc.ink, sc.base, 0.35))
  const spin = p.animate ? `<animateTransform attributeName="transform" type="rotate" from="0 301 150" to="360 301 150" dur="9s" repeatCount="indefinite"/>` : ''
  s += `<g>${[0, 120, 240].map(a => `<ellipse cx="301" cy="128" rx="3" ry="22" fill="${mix(sc.ink, sc.base, 0.15)}" transform="rotate(${a} 301 150)"/>`).join('')}${spin}</g>`
  s += circ(301, 150, 4, sc.accent)
  // The central tree grows with the context: a sapling at first, a full canopy at the end.
  const g = 0.35 + 0.65 * p.c
  const tx = 170
  const base = 330
  const trunkH = 120 * g
  s += path(`M${tx - 9 * g} ${base} Q${tx - 4 * g} ${f(base - trunkH * 0.5)} ${tx - 3 * g} ${f(base - trunkH)} L${tx + 3 * g} ${f(base - trunkH)} Q${tx + 4 * g} ${f(base - trunkH * 0.5)} ${tx + 9 * g} ${base} Z`, mix('#6b4a2b', sc.base, 0.2))
  const cy = base - trunkH
  const blobs = [[0, -8, 52], [-44, 6, 38], [44, 6, 38], [-22, -34, 34], [26, -32, 32]]
  for (const [dx, dy, r] of blobs) {
    s += circ(tx + dx! * g, cy + dy! * g, r! * g, mix(sc.mid, '#58b868', 0.55), 'opacity=".96"')
  }
  for (let i = 0; i < 16; i++) {
    const a = p.rnd() * Math.PI * 2
    const rr = (10 + p.rnd() * 56) * g
    const x = tx + Math.cos(a) * rr
    const y = cy - 8 * g + Math.sin(a) * rr * 0.7
    s += rect(x - 4, y - 2.4, 8, 4.8, sc.accent, `opacity=".92" transform="rotate(${f(p.rnd() * 60 - 30)} ${f(x)} ${f(y)})"`)
  }
  for (let i = 0; i < 14; i++) {
    const x = p.rnd() * W
    const y = 250 + p.rnd() * 150
    const dur = 2 + p.rnd() * 3
    const begin = p.rnd() * 5
    s += circ(x, y, 1.5, sc.accent, 'opacity=".7"', loop(p, 'opacity', '.8;.1;.8', dur, begin))
  }
  s += fog(p, 372, 24, 0.5, 18)
  return s
}

const SCENE_ART: Record<string, (p: P) => string> = {
  'empty-atrium': atrium,
  'night-parking-deck': parking,
  poolrooms,
  'observation-ring': observation,
  'reactor-bay': reactor,
  'hydroponics-deck': hydroponics,
  'terraced-arcology': arcology,
  'dawn-plaza': dawn,
  'solarpunk-commons': solarpunk,
}

// The panel's text sits this far in from either edge.
const PANEL_PAD = 22
const PANEL_TEXT_W = W - PANEL_PAD * 2

const modeOf = (sc: Scene) => MODES.find(m => m.id === sc.mode) ?? MODES[0]!
const fontAttr = (sc: Scene) => `font-family="${modeOf(sc).font}"`
// A size in the mode's face: a wider face is scaled down to fit the same boxes.
const fs = (sc: Scene, size: number) => f(size * modeOf(sc).fit)

export type Slot = { name: string; percent: number | null; note: string; value?: string }

// The gauges the host can fill. A limit it does not report is left out rather
// than drawn as an empty bar; isMissing says one was.
export function gaugeSlots(sc: Scene, usage: UsageSnap, now: number): { slots: Slot[]; isMissing: boolean } {
  const slots: Slot[] = [{ name: sc.gauges[0], percent: usage.context, note: tokensText(usage.tokens, usage.window) }]
  let isMissing = false
  for (const [name, win] of [[sc.gauges[1], usage.five], [sc.gauges[2], usage.week]] as const) {
    if (win.percent === null) isMissing = true
    else slots.push({ name, percent: win.percent, note: resetText(win.resetsAt, now) })
  }
  return { slots, isMissing }
}

export function gaugesAlt(slots: Slot[]): string {
  return slots.map(one => `${one.name} ${percentText(one.percent)}, ${one.note}`).join('. ')
}

export function todayAlt(today: TodaySnap): string {
  return `${today.prompts} prompts · ${today.tools} tool actions · ${today.files} files touched`
}

export type PanelData = { usage: UsageSnap; project: ProjectSnap; today: TodaySnap; now: number }

export type PanelOptions = {
  uid: string
  animate: boolean
  // The scene's art behind the text; without it the text sits on the plain background.
  isArt: boolean
  parts: { project: boolean; limits: boolean; today: boolean }
}

// The whole panel as one drawing, 340 wide and as tall as its text needs. The
// scene fills it with no frame, fading into the panel's own background at the
// edges and the foot; the scene's name, the project, the limits and today's
// counts are written over it, each under a hairline heading.
export function panelSvg(sc: Scene, d: PanelData, o: PanelOptions): { source: string; height: number; alt: string } {
  const p: P = { uid: o.uid, animate: o.animate, sc, c: Math.min(1, Math.max(0, (d.usage.context ?? 0) / 100)), rnd: rng(sc.seed) }
  const u = o.uid
  const { slots, isMissing } = gaugeSlots(sc, d.usage, d.now)
  // With the art up, the context gauge is written in its corner; without it, it is a bar like the rest.
  const bars = o.isArt ? slots.slice(1) : slots
  const x0 = PANEL_PAD
  const x1 = PANEL_PAD + PANEL_TEXT_W
  // A soft edge in the panel's colour keeps text legible over busy art.
  const halo = `stroke="${sc.base}" stroke-opacity=".6" stroke-width="3" paint-order="stroke"`
  const alt: string[] = [`${sc.title}. ${sc.motto}`]
  let g = ''
  let y = o.isArt ? 258 : 36

  const header = (label: string) => {
    g += `<text x="${x0}" y="${y}" font-size="${fs(sc, 9)}" font-weight="600" letter-spacing="2" fill="${sc.accent}">${esc(label)}</text>`
    g += line(x0, y + 7, x1, y + 7, sc.accent, 1, 'opacity=".35"')
    y += 30
  }

  if (o.isArt) {
    const top = slots[0]!
    g += `<text x="${x0}" y="34" font-size="${fs(sc, 9)}" letter-spacing="2" fill="${sc.ink}" ${halo}>${esc(top.name)}</text>`
    g += `<text x="${x0}" y="58" font-size="${fs(sc, 22)}" font-weight="700" fill="${sc.accent}" ${halo}>${percentText(top.percent)}</text>`
    g += `<text x="${x0}" y="74" font-size="${fs(sc, 9)}" fill="${sc.ink}" opacity=".8" ${halo}>${esc(top.note)}</text>`
    alt.push(gaugesAlt([top]))
  }

  g += `<text x="${x0}" y="${y}" font-size="${fs(sc, 19)}" font-weight="700" letter-spacing="2" fill="${sc.ink}" ${halo}>${esc(clip(sc.title.toUpperCase(), 24))}</text>`
  g += `<text x="${x0}" y="${y + 21}" font-size="${fs(sc, 11)}" font-style="italic" fill="${sc.ink}" opacity=".85" ${halo}>“${esc(sc.motto)}”</text>`
  y += 58

  if (o.parts.project) {
    const pr = d.project
    header(clip((pr.name || 'project').toUpperCase(), 26))
    g += `<text x="${x0}" y="${y}" font-size="${fs(sc, 13)}" font-weight="700" fill="${sc.ink}">${esc(pr.isRepo ? '⎇ ' + clip(pr.branch, 30) : 'not a git repository')}</text>`
    y += 18
    const clean = pr.changes === 0 && pr.ahead === 0 && pr.behind === 0
    const status = !pr.isRepo ? '' : clean ? 'all committed' : `${pr.changes} uncommitted · ↑${pr.ahead} ↓${pr.behind}`
    if (status !== '') {
      g += `<text x="${x0}" y="${y}" font-size="${fs(sc, 10)}" fill="${sc.ink}" opacity=".65">${esc(status)}</text>`
      y += 16
    }
    // The subjects line up past the widest hash.
    const subjectX = f(x0 + 7 * 9.5 * modeOf(sc).fit * 0.62 + 10)
    for (const c of pr.commits) {
      g += `<text x="${x0}" y="${y}" font-size="${fs(sc, 9.5)}" fill="${sc.accent}" opacity=".8">${esc(c.hash)}</text>`
      g += `<text x="${subjectX}" y="${y}" font-size="${fs(sc, 9.5)}" fill="${sc.ink}" opacity=".6">${esc(clip(c.subject, 38))}</text>`
      y += 14
    }
    y += 16
    alt.push(`${pr.name || 'project'}. ${pr.isRepo ? pr.branch : 'not a git repository'}. ${status}`.trim())
    if (pr.commits.length > 0) alt.push(pr.commits.map(c => `${c.hash} ${c.subject}`).join('. '))
  }

  if (o.parts.limits) {
    header('LIMITS')
    for (const one of bars) {
      const pct = one.percent === null ? 0 : Math.min(100, Math.max(0, one.percent))
      const color = pct >= 85 ? '#ff7a6b' : sc.accent
      g += `<text x="${x0}" y="${y}" font-size="${fs(sc, 9)}" letter-spacing="1.5" fill="${sc.ink}" opacity=".85">${esc(one.name)}</text>`
      g += `<text x="${x1}" y="${y + 1}" font-size="${fs(sc, 14)}" font-weight="700" fill="${color}" text-anchor="end">${percentText(one.percent)}</text>`
      g += rect(x0, y + 8, PANEL_TEXT_W, 8, mix(sc.base, sc.ink, 0.18), 'rx="4"')
      g += rect(x0, y + 8, (PANEL_TEXT_W * pct) / 100, 8, color, 'rx="4"')
      g += `<text x="${x0}" y="${y + 30}" font-size="${fs(sc, 9)}" fill="${sc.ink}" opacity=".6">${esc(one.note)}</text>`
      y += 54
    }
    if (isMissing) {
      g += `<text x="${x0}" y="${y}" font-size="${fs(sc, 9.5)}" fill="${sc.ink}" opacity=".55">Limits not reported for this session are left out.</text>`
      y += 24
      alt.push('Limits not reported for this session are left out.')
    }
    y += 10
    alt.push(gaugesAlt(bars))
  }

  if (o.parts.today) {
    header('TODAY')
    const cols: [number, string][] = [[d.today.prompts, 'PROMPTS'], [d.today.tools, 'TOOL ACTIONS'], [d.today.files, 'FILES TOUCHED']]
    const cw = PANEL_TEXT_W / 3
    cols.forEach(([count, label], i) => {
      const x = x0 + i * cw
      g += `<text x="${f(x)}" y="${y + 10}" font-size="${fs(sc, 24)}" font-weight="700" fill="${sc.accent}">${count}</text>`
      g += `<text x="${f(x)}" y="${y + 26}" font-size="${fs(sc, 8)}" letter-spacing="1.2" fill="${sc.ink}" opacity=".65">${label}</text>`
    })
    y += 48
    alt.push(todayAlt(d.today))
  }

  const height = Math.max(o.isArt ? H : 60, y + 6)
  const skyTop = mix(sc.base, sc.mid, 0.5)
  const skyLow = sc.id === 'dawn-plaza' ? mix(sc.mid, sc.accent, 0.55) : sc.id === 'solarpunk-commons' ? mix(sc.mid, sc.accent, 0.35) : sc.mid
  const art = o.isArt
    ? `<g mask="url(#${u}-mkh)"><g mask="url(#${u}-mkv)">${(SCENE_ART[sc.id] ?? atrium)(p)}</g></g>
<rect x="0" y="150" width="${W}" height="${H - 150}" fill="url(#${u}-scrim)"/>`
    : ''
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" ${fontAttr(sc)}>
<defs>
<radialGradient id="${u}-glow"><stop offset="0" stop-color="${sc.accent}" stop-opacity=".9"/><stop offset="1" stop-color="${sc.accent}" stop-opacity="0"/></radialGradient>
<radialGradient id="${u}-fog"><stop offset="0" stop-color="${sc.ink}" stop-opacity=".22"/><stop offset="1" stop-color="${sc.ink}" stop-opacity="0"/></radialGradient>
<radialGradient id="${u}-planet" cx=".5" cy="0" r=".85"><stop offset="0" stop-color="${mix(sc.accent, sc.mid, 0.6)}"/><stop offset=".45" stop-color="${sc.mid}"/><stop offset="1" stop-color="${sc.base}"/></radialGradient>
<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyLow}"/></linearGradient>
<linearGradient id="${u}-scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sc.base}" stop-opacity="0"/><stop offset=".3" stop-color="${sc.base}" stop-opacity=".55"/><stop offset=".6" stop-color="${sc.base}" stop-opacity=".85"/><stop offset="1" stop-color="${sc.base}" stop-opacity=".95"/></linearGradient>
<linearGradient id="${u}-mh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".12" stop-color="#fff"/><stop offset=".88" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<linearGradient id="${u}-mv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".05" stop-color="#fff"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="${u}-mkh"><rect width="${W}" height="${H}" fill="url(#${u}-mh)"/></mask>
<mask id="${u}-mkv"><rect width="${W}" height="${H}" fill="url(#${u}-mv)"/></mask>
</defs>
<rect width="${W}" height="${height}" fill="${sc.base}"/>
${art}
${g}
</svg>`
  return { source, height, alt: alt.filter(Boolean).join(' ') }
}

export type BannerData = {
  usage: UsageSnap
  project: string
  branch: string
  now: number
  today?: TodaySnap
}

// The slim strip above the prompt, 760 by 48.
export function bannerSvg(sc: Scene, d: BannerData, o: { uid: string; animate: boolean }): string {
  const u = o.uid
  const p: P = { uid: u, animate: o.animate, sc, c: 0, rnd: rng(sc.seed + 5) }
  // A limit the host does not report is left out; today's counts take its place.
  const { slots, isMissing } = gaugeSlots(sc, d.usage, d.now)
  if (isMissing && d.today !== undefined) {
    slots.push({ name: 'TODAY', percent: null, value: `${d.today.prompts} prompts`, note: `${d.today.tools} tool actions · ${d.today.files} files` })
  }
  // The branch gives way before the model does: the box beside the title is only so wide.
  const model = d.usage.model || 'model'
  const where = `${d.branch ? '⎇ ' + clip(d.branch, Math.max(6, 18 - model.length)) : 'no branch'} · ${model}`
  const gx0 = 340
  const gap = 8
  const gw = Math.floor((400 - gap * (slots.length - 1)) / slots.length)
  const fit = modeOf(sc).fit
  let g = ''
  slots.forEach((one, i) => {
    const x = gx0 + i * (gw + gap)
    const pct = one.percent === null ? 0 : Math.min(100, Math.max(0, one.percent))
    const color = pct >= 85 ? '#ff7a6b' : sc.accent
    g += `<text x="${x}" y="14" font-size="${fs(sc, 7)}" fill="${sc.ink}" opacity=".75">${esc(clip(one.name, 18))}</text>`
    g += `<text x="${x + gw}" y="14" font-size="${fs(sc, 8.5)}" font-weight="700" fill="${color}" text-anchor="end">${esc(one.value ?? percentText(one.percent))}</text>`
    if (one.value === undefined) {
      g += rect(x, 19, gw, 5, mix(sc.base, sc.ink, 0.18), 'rx="2.5"')
      g += rect(x, 19, (gw * pct) / 100, 5, color, 'rx="2.5"')
    } else {
      g += line(x, 21.5, x + gw, 21.5, sc.accent, 1, 'opacity=".25"')
    }
    g += `<text x="${x}" y="38" font-size="${fs(sc, 8)}" fill="${sc.ink}" opacity=".6">${esc(clip(one.note, Math.floor(gw / (4.4 * fit))))}</text>`
  })
  const twinkles = stars(p, 16, 4, 44, sc.ink)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="48" viewBox="0 0 760 48" ${fontAttr(sc)}>
<defs>
<linearGradient id="${u}-bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sc.mid}"/><stop offset=".55" stop-color="${sc.base}"/><stop offset="1" stop-color="${sc.mid}"/></linearGradient>
<linearGradient id="${u}-sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sc.accent}" stop-opacity="0"/><stop offset=".5" stop-color="${sc.accent}" stop-opacity=".22"/><stop offset="1" stop-color="${sc.accent}" stop-opacity="0"/></linearGradient>
<clipPath id="${u}-clip"><rect width="760" height="48" rx="7"/></clipPath>
</defs>
<g clip-path="url(#${u}-clip)">
<rect width="760" height="48" fill="url(#${u}-bg)"/>
${twinkles}
<rect x="-160" y="0" width="160" height="48" fill="url(#${u}-sh)">${o.animate ? `<animate attributeName="x" values="-160;760" dur="11s" begin="-4s" repeatCount="indefinite"/>` : ''}</rect>
<rect x="0" y="0" width="4" height="48" fill="${sc.accent}"/>
<text x="16" y="21" font-size="${fs(sc, 13)}" font-weight="700" fill="${sc.ink}" letter-spacing=".4">${esc(clip(sc.title, 22))}</text>
<text x="16" y="36" font-size="${fs(sc, 8.5)}" font-style="italic" fill="${sc.ink}" opacity=".7">${esc(clip(sc.motto, 46))}</text>
<line x1="206" y1="9" x2="206" y2="39" stroke="${sc.accent}" stroke-opacity=".3"/>
<text x="218" y="21" font-size="${fs(sc, 11)}" font-weight="600" fill="${sc.ink}">${esc(clip(d.project || 'no project', 17))}</text>
<text x="218" y="36" font-size="${fs(sc, 8.5)}" fill="${sc.accent}" opacity=".9">${esc(where)}</text>
<line x1="328" y1="9" x2="328" y2="39" stroke="${sc.accent}" stroke-opacity=".3"/>
${g}
</g>
<rect x=".5" y=".5" width="759" height="47" rx="6.5" fill="none" stroke="${sc.accent}" stroke-opacity=".4"/>
</svg>`
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
