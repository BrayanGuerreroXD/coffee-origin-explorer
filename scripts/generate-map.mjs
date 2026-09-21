#!/usr/bin/env node
/**
 * generate-map.mjs — procedural pen-and-ink aerial of the finca (Gramalote,
 * Norte de Santander).
 *
 *   node scripts/generate-map.mjs
 *
 * Writes three layers, all `viewBox="0 0 1600 1000"` with explicit width and
 * height so they can be uploaded as WebGL textures through an <img>:
 *
 *   public/assets/farm/paper-reference.svg       opaque paper, grain, haze, far ranges
 *   public/assets/farm/map-reference.svg         the drawing (terrain, lots, woods, buildings)
 *   public/assets/farm/foreground-reference.svg  near marks at the bottom edge + vignette
 *
 * ── The projection ─────────────────────────────────────────────────────────
 * Everything is authored in ground space and projected through one pinhole
 * camera, so all the marks share a single viewpoint. Ground space is
 * (X, Z, Y): X is lateral, Z is depth away from the camera, Y is elevation in
 * camera heights. The camera sits one unit above the datum, looking at a
 * strongly inclined ground plane:
 *
 *     sx = CX + F * X / Z
 *     sy = HORIZON + F * (1 - Y) / Z
 *
 * The 1/Z divide is the whole trick: the near band of lots is ~140 px deep on
 * screen and the far band ~12 px, so the land folds away hard towards a high
 * horizon (16.5 % from the top). `fromScreen()` inverts it by bisection, which
 * lets tracks and buildings be composed by eye in screen coordinates and still
 * sit on the terrain.
 *
 * Relief amplitude grows with depth (the cordillera behind the farm is far
 * taller than the spur the farm sits on), which buys back vertical room near
 * the horizon that the perspective divide would otherwise crush.
 *
 * ── The lots ───────────────────────────────────────────────────────────────
 * The land is a jittered 18 x 22 lattice draped over the terrain, so every lot
 * is a ground-space quad. Each quad carries its own bilinear (u, v) frame, and
 * every mark inside it — coffee rows, canopies, tufts — is generated in that
 * unit square and mapped out through the quad. Coverage is therefore exact:
 * lots tile the ground edge to edge with no pale seams, and the only unhatched
 * ribbons are the tracks, which suppress marks as they pass.
 *
 * ── Determinism ────────────────────────────────────────────────────────────
 * Every random number comes from mulberry32 or hashed value noise seeded from
 * SEED, so re-running the script reproduces the drawing byte for byte.
 *
 * ── Style ──────────────────────────────────────────────────────────────────
 * One ink colour (#2a4433) on pale paper (#eef1e6). No second colour anywhere.
 * Depth is carried only by stroke weight and opacity; form is carried by hatch
 * density, which tightens and darkens on the slopes turned away from the
 * light. Marks are grouped into a few dozen <path> elements keyed by
 * (opacity, width) so tens of thousands of strokes still fit in a few hundred
 * kilobytes.
 */

import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, '..', 'public', 'assets', 'farm')

/* ── constants ─────────────────────────────────────────────────────────── */

const SEED = 20260920

const W = 1600
const H = 1000
const CX = 800
const HORIZON = 165 // 16.5 % from the top
const F = 1735.5 // focal length, camera height = 1 world unit
const ZNEAR = 1.3 // the datum plane at this depth lands on sy = 1500
const ZFAR = 4.3
const XOVER = 1300 // half-width of the generated band: x from -500 to 2100

const INK = '#2a4433'
const PAPER = '#eef1e6'

/** Light comes from the upper left; slopes turned away from it go dark. */
const LIGHT = [-0.6, 0.8]

/** Marks further out than this are never rasterised, so they are not emitted. */
const CULL = { x0: -150, y0: -150, x1: W + 150, y1: H + 150 }

/** Interest points, (x, y from top) of the viewBox. Kept free of clutter. */
const MARKERS = [
  [0.83, 0.19],
  [0.25, 0.28],
  [0.55, 0.51],
  [0.16, 0.89],
  [0.82, 0.9],
].map(([u, v]) => [u * W, v * H])

/* ── deterministic randomness ──────────────────────────────────────────── */

function mulberry32(a) {
  let s = a | 0
  return function next() {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(ix, iy, s) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(s | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function vnoise(x, y, s) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi, s)
  const b = hash2(xi + 1, yi, s)
  const c = hash2(xi, yi + 1, s)
  const d = hash2(xi + 1, yi + 1, s)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(x, y, s, oct = 4) {
  let amp = 1
  let f = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 17)
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / norm
}

/** Ridged noise: creases rather than blobs, which is what a spur looks like. */
function ridged(x, y, s, oct = 3) {
  let amp = 1
  let f = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < oct; i++) {
    const v = vnoise(x * f, y * f, s + i * 31)
    sum += amp * (1 - Math.abs(2 * v - 1))
    norm += amp
    amp *= 0.5
    f *= 2.11
  }
  return sum / norm
}

/* ── small maths ───────────────────────────────────────────────────────── */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

/* ── terrain ───────────────────────────────────────────────────────────── */

const LOGZ = Math.log(ZFAR / ZNEAR)
const depthT = (Z) => clamp(Math.log(Math.max(Z, 0.05) / ZNEAR) / LOGZ, 0, 1.15)
const halfX = (Z) => (XOVER / F) * Z

/**
 * Elevation of the datum at a ground point, in camera heights.
 *
 * Noise is sampled in a depth-warped frame (X / Z^0.6 against log depth) so
 * ridges keep a usable size on screen instead of collapsing into the horizon,
 * and the amplitude grows with depth so the back of the basin reads as a
 * cordillera rather than a flat apron. One explicit valley is carved through
 * the middle so the composition has a spine for the tracks to follow.
 */
function terrain(X, Z) {
  const u = clamp((Z - ZNEAR) / (ZFAR - ZNEAR), -0.2, 1.25)
  const hx = halfX(Z)
  const tx = (X / Math.pow(Math.max(Z, 0.3), 0.6)) * 0.85
  const tz = u * 2.1

  // One hillside: it climbs away from the viewer and steepens into the ridge
  // that closes the view. Gentle at first so the near ground still reads as
  // ground seen from above rather than as a wall.
  let h = 0.05 + 0.13 * u + 0.62 * Math.pow(Math.max(u, 0), 2.6)

  // the spur the farm sits on, slightly right of centre, falling away at the sides
  h += (0.035 + 0.15 * u) * Math.exp(-Math.pow((X - 0.17 * Z) / (0.6 * hx), 2))

  // two gullies cutting down the slope
  h -= (0.03 + 0.075 * u) * Math.exp(-Math.pow((X + 0.34 * Z) / (0.17 * hx), 2))
  h -= (0.025 + 0.06 * u) * Math.exp(-Math.pow((X - 0.52 * Z) / (0.15 * hx), 2))

  // the crest that closes the view, highest towards the right
  h += 0.15 * Math.pow(Math.max(u, 0), 2.8) * Math.exp(-Math.pow((X - 0.3 * Z) / (0.45 * hx), 2))

  // the folds: a few big spurs and gullies, then smaller benches on top
  h += (0.055 + 0.1 * u) * (ridged(tx * 0.85, tz * 0.8, 101, 2) - 0.46)
  h += (0.03 + 0.05 * u) * (ridged(tx * 2.1 + 5, tz * 1.6, 137, 2) - 0.47)
  h += (0.016 + 0.026 * u) * (fbm(tx * 3.9 + 11, tz * 2.6, 211, 3) - 0.5)
  h += 0.01 * (fbm(tx * 9, tz * 5 + 3, 307, 2) - 0.5)

  return Math.min(h, 0.945)
}

function terrainGrad(X, Z) {
  const e = 0.02 * Math.max(Z, 0.5)
  return [
    (terrain(X + e, Z) - terrain(X - e, Z)) / (2 * e),
    (terrain(X, Z + e) - terrain(X, Z - e)) / (2 * e),
  ]
}

/** 0 = facing the light, 1 = turned fully away from it. */
function shading(X, Z) {
  const [gx, gz] = terrainGrad(X, Z)
  const d = gx * LIGHT[0] + gz * LIGHT[1]
  const v = clamp(0.5 + 2.6 * d, 0, 1)
  // push the contrast: an ink drawing has lit paper and loaded shadow, little between
  return v * v * (3 - 2 * v)
}

/* ── projection ────────────────────────────────────────────────────────── */

function toScreen(X, Z, e = 0, Yg = null) {
  const Y = (Yg === null ? terrain(X, Z) : Yg) + e
  return [CX + (F * X) / Z, HORIZON + (F * (1 - Y)) / Z]
}

/** Inverse projection onto the terrain, by bisection on depth. */
function fromScreen(sx, sy) {
  let lo = ZNEAR * 0.72
  let hi = ZFAR * 1.15
  for (let i = 0; i < 46; i++) {
    const Z = (lo + hi) / 2
    const X = ((sx - CX) * Z) / F
    const y = HORIZON + (F * (1 - terrain(X, Z))) / Z
    if (y > sy) lo = Z
    else hi = Z
  }
  const Z = (lo + hi) / 2
  return [((sx - CX) * Z) / F, Z]
}

/** Projected length on screen of one ground unit along (dx, dz) at (X, Z). */
function jacobianLen(X, Z, dx, dz) {
  const Y = terrain(X, Z)
  const jx = (F / Z) * dx - ((F * X) / (Z * Z)) * dz
  const jy = -((F * (1 - Y)) / (Z * Z)) * dz
  return Math.hypot(jx, jy)
}

/* ── ink collector ─────────────────────────────────────────────────────── */

class Ink {
  constructor() {
    this.buckets = new Map()
    this.marks = 0
  }

  add(d, op, w) {
    if (!d) return
    const o = clamp(op, 0.05, 0.94)
    const ww = clamp(w, 0.22, 1.9)
    const key = `${Math.round(o * 18) / 18}|${Math.round(ww * 10) / 10}`
    let b = this.buckets.get(key)
    if (!b) {
      b = []
      this.buckets.set(key, b)
    }
    b.push(d)
    this.marks++
  }

  render() {
    const keys = [...this.buckets.keys()].sort((a, b) => parseFloat(a) - parseFloat(b))
    const out = []
    for (const key of keys) {
      const [op, w] = key.split('|')
      const o = (Math.round(parseFloat(op) * 1000) / 1000).toString()
      let buf = []
      let len = 0
      const flush = () => {
        if (!buf.length) return
        out.push(`<path stroke-opacity="${o}" stroke-width="${w}" d="${buf.join('')}"/>`)
        buf = []
        len = 0
      }
      for (const p of this.buckets.get(key)) {
        buf.push(p)
        len += p.length
        if (len > 200000) flush()
      }
      flush()
    }
    return out.join('\n')
  }
}

/* ── path helpers ──────────────────────────────────────────────────────── */

function num(n, prec) {
  const v = prec === 0 ? Math.round(n) : Math.round(n * 10) / 10
  return Object.is(v, -0) ? '0' : String(v)
}

/** "M" plus implicit linetos, separators only where the grammar needs them. */
function polyPath(pts, prec = 1, close = false) {
  if (pts.length < 2) return ''
  let s = 'M'
  for (let i = 0; i < pts.length; i++) {
    const x = num(pts[i][0], prec)
    const y = num(pts[i][1], prec)
    if (i > 0 && x[0] !== '-') s += ' '
    s += x
    if (y[0] !== '-') s += ' '
    s += y
  }
  return close ? `${s}Z` : s
}

function bboxVisible(pts, pad = 0) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false
    if (p[0] < x0) x0 = p[0]
    if (p[0] > x1) x1 = p[0]
    if (p[1] < y0) y0 = p[1]
    if (p[1] > y1) y1 = p[1]
  }
  return x1 >= CULL.x0 - pad && x0 <= CULL.x1 + pad && y1 >= CULL.y0 - pad && y0 <= CULL.y1 + pad
}

const visible = (x, y, pad = 0) =>
  x >= CULL.x0 - pad && x <= CULL.x1 + pad && y >= CULL.y0 - pad && y <= CULL.y1 + pad

/* ── depth-driven pen ──────────────────────────────────────────────────── */

function pen(t, opMul = 1, wMul = 1) {
  const k = clamp(t, 0, 1)
  return [lerp(0.92, 0.5, Math.pow(k, 0.9)) * opMul, lerp(1.35, 0.55, Math.pow(k, 0.7)) * wMul]
}

/** 1 decimal only where a mark is large enough for it to matter. */
const precFor = (t) => (t < 0.1 ? 1 : 0)

function markerDist(sx, sy) {
  let best = Infinity
  for (const [mx, my] of MARKERS) {
    const d = Math.hypot(sx - mx, sy - my)
    if (d < best) best = d
  }
  return best
}

/* ═══════════════════════════════════════════════════════════════════════
   1. The land: a jittered lattice of lots draped over the terrain
   ═══════════════════════════════════════════════════════════════════════ */

const COLS = 6
const ROWS = 7

/**
 * Lateral half-width of the lattice. It grows more slowly than the frustum, so
 * lots genuinely narrow as they recede instead of holding a constant width on
 * screen — that convergence is most of what sells the tilt.
 */
const LAT_REF = 2.4
const latHalf = (Z) => halfX(LAT_REF) * Math.pow(Z / LAT_REF, 0.4)

function buildLattice() {
  const pts = []
  for (let r = 0; r <= ROWS; r++) {
    const row = []
    const baseZ = ZNEAR * Math.pow(ZFAR / ZNEAR, r / ROWS)
    for (let c = 0; c <= COLS; c++) {
      const rng = mulberry32(SEED + c * 7919 + r * 104729)
      let Z = baseZ * (1 + (rng() * 2 - 1) * 0.05)
      if (r === 0) Z = ZNEAR * 0.9
      if (r === ROWS) Z = ZFAR

      let u = -1 + (2 * c) / COLS
      let X
      if (c > 0 && c < COLS) {
        u += (rng() * 2 - 1) * (1 / COLS) * 0.55
        u += 0.06 * Math.sin(3.1 * Math.log(Z) + c * 0.44)
        u += 0.035 * Math.sin(5.5 * Math.log(Z) - c * 0.9)
        X = u * latHalf(Z)
      } else {
        // the outer columns always reach past the frame, however far the
        // lattice itself has narrowed
        X = Math.sign(u) * Math.max(latHalf(Z), halfX(Z) * 1.07)
      }
      let Y = terrain(X, Z)
      let sy = HORIZON + (F * (1 - Y)) / Z
      const prev = r > 0 ? pts[r - 1][c] : null
      if (prev) {
        // Never let a far lattice row sag below the row in front of it: with no
        // hidden-surface removal an inversion would tangle the hatching.
        const limit = prev.sy - 1.5
        if (sy > limit) {
          Y = clamp(1 - ((limit - HORIZON) * Z) / F, 0, 0.95)
          sy = limit
        }
      }
      row.push({ X, Z, Y, sx: CX + (F * X) / Z, sy })
    }
    pts.push(row)
  }
  return pts
}

function buildParcels(lattice) {
  const parcels = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const A = lattice[r][c]
      const B = lattice[r][c + 1]
      const C = lattice[r + 1][c + 1]
      const D = lattice[r + 1][c]
      const quad = [
        [A.X, A.Z],
        [B.X, B.Z],
        [C.X, C.Z],
        [D.X, D.Z],
      ]
      const screen = [
        [A.sx, A.sy],
        [B.sx, B.sy],
        [C.sx, C.sy],
        [D.sx, D.sy],
      ]
      if (!bboxVisible(screen, 30)) continue
      const X = (A.X + B.X + C.X + D.X) / 4
      const Z = (A.Z + B.Z + C.Z + D.Z) / 4
      const cy = [A.Y, B.Y, C.Y, D.Y]
      const sy0 = HORIZON + (F * (1 - (A.Y + B.Y + C.Y + D.Y) / 4)) / Z
      const sx = CX + (F * X) / Z
      const sy = sy0
      // screen edge vectors of the (u, v) frame, used for every spacing decision
      const eu = [
        (B.sx - A.sx + (C.sx - D.sx)) / 2,
        (B.sy - A.sy + (C.sy - D.sy)) / 2,
      ]
      const ev = [
        (D.sx - A.sx + (C.sx - B.sx)) / 2,
        (D.sy - A.sy + (C.sy - B.sy)) / 2,
      ]
      parcels.push({ c, r, quad, cy, screen, X, Z, sx, sy, eu, ev, t: depthT(Z) })
    }
  }
  return parcels
}

/** Point of the lot at unit-square coordinates (u, v). */
function quadAt(quad, u, v) {
  const iu = 1 - u
  const iv = 1 - v
  return [
    iu * iv * quad[0][0] + u * iv * quad[1][0] + u * v * quad[2][0] + iu * v * quad[3][0],
    iu * iv * quad[0][1] + u * iv * quad[1][1] + u * v * quad[2][1] + iu * v * quad[3][1],
  ]
}

/**
 * Screen position of a point inside a lot.
 *
 * The elevation is interpolated from the lot's own four corners (the ones the
 * lattice already de-tangled) rather than resampled from the terrain, so no
 * mark can ever wander outside its lot's silhouette or cross the row in front.
 * A little high-frequency noise is added back on top for tremble.
 */
function screenAt(p, u, v) {
  const [gX, gZ] = quadAt(p.quad, u, v)
  const iu = 1 - u
  const iv = 1 - v
  const Y =
    iu * iv * p.cy[0] +
    u * iv * p.cy[1] +
    u * v * p.cy[2] +
    iu * v * p.cy[3] +
    0.0016 * (vnoise(gX * 22, gZ * 22, 619) - 0.5)
  return [CX + (F * gX) / gZ, HORIZON + (F * (1 - Y)) / gZ, gX, gZ]
}

function pointInPoly(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function assignLandUse(parcels) {
  const byKey = new Map()
  for (const p of parcels) byKey.set(`${p.c}:${p.r}`, p)

  for (const p of parcels) {
    const rng = mulberry32(SEED + p.c * 3571 + p.r * 66601 + 7)
    const tx = (p.X / Math.pow(Math.max(p.Z, 0.3), 0.6)) * 0.8
    const tz = depthT(p.Z) * 3.0
    const [gx, gz] = terrainGrad(p.X, p.Z)
    const slope = Math.hypot(gx, gz)
    const wood = fbm(tx * 1.3 + 31, tz * 1.3 + 5, 555, 3)
    const near = markerDist(p.sx, p.sy)

    // Everything outside the farm is hillside: woods on the steep flanks and
    // in the gullies, rough grazing elsewhere. The coffee is assigned below,
    // to the handful of lots nearest the yard.
    let use = 'pasture'
    if (wood > 0.52 || slope > 0.52) use = 'wood'
    else if (rng() < 0.3) use = 'stubble'

    // a marker must never land on a wood; a field or a track there is welcome
    if (near < 150 && use === 'wood') use = rng() < 0.5 ? 'coffee' : 'pasture'

    p.use = use
    p.slope = slope
    p.shade = shading(p.X, p.Z)

    // Tone: how tightly this lot is planted. Spreading it across lots is what
    // stops the drawing settling into one flat grey.
    const tn = fbm(tx * 2.2 + 61, tz * 2.2 + 13, 771, 3)
    p.tone = clamp(0.55 + 1.5 * (tn - 0.5) + 0.35 * (rng() - 0.5), 0, 1)

    // Most lots are planted across the slope; a few run up and down it. Very
    // elongated lots always take the long axis, or the rows fan out.
    const roll = rng()
    let ang =
      roll < 0.7 ? (rng() * 2 - 1) * 0.4 : roll < 0.92 ? 1.05 + rng() * 0.45 : Math.PI / 2 + (rng() - 0.5) * 0.4
    const lu = Math.hypot(p.eu[0], p.eu[1])
    const lv = Math.hypot(p.ev[0], p.ev[1])
    if (lu > lv * 2.6) ang = (rng() * 2 - 1) * 0.3
    else if (lv > lu * 2.2) ang = Math.PI / 2 + (rng() - 0.5) * 0.3
    p.angle = ang
    p.bow = (rng() * 2 - 1) * 0.15
    // phases for the boundary warp: fields are not exact quadrilaterals
    p.wu = rng() * 6.283
    p.wv = rng() * 6.283
    p.rng = rng
    p.merged = false
  }

  // The farm itself: the seven lots closest to the yard, which is where the
  // buildings and the tracks are. Everything else stays hillside.
  const YARD = [810, 690]
  const ranked = parcels
    .filter((p) => {
      if (!bboxVisible(p.screen, -60) || p.slope >= 0.62) return false
      let area = 0
      let minEdge = Infinity
      for (let i = 0; i < 4; i++) {
        const q = p.screen[i]
        const r2 = p.screen[(i + 1) % 4]
        area += q[0] * r2[1] - r2[0] * q[1]
        minEdge = Math.min(minEdge, Math.hypot(r2[0] - q[0], r2[1] - q[1]))
      }
      return Math.abs(area) / 2 > 14000 && minEdge > 55
    })
    .map((p) => ({
      p,
      d: Math.hypot((p.sx - YARD[0]) / 1.15, (p.sy - YARD[1]) / 0.95),
    }))
    .sort((a, b) => a.d - b.d)
  for (let i = 0; i < Math.min(7, ranked.length); i++) ranked[i].p.use = 'coffee'

  // Merge some lots into their left neighbour so the lattice stops reading as
  // a grid: same use, same row angle, shared boundary suppressed.
  for (const p of parcels) {
    const left = byKey.get(`${p.c - 1}:${p.r}`)
    if (!left || left.use !== p.use) continue
    const rng = mulberry32(SEED + p.c * 17 + p.r * 613 + 91)
    if (rng() > 0.34) continue
    p.angle = left.angle
    p.tone = left.tone
    p.bow = left.bow
    p.merged = true
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   2. Hatching a lot through its own (u, v) frame
   ═══════════════════════════════════════════════════════════════════════ */

/** Clip the line s*n + tau*d to the unit square. Returns [tau0, tau1] or null. */
function clipUnitSquare(sx, sy, dx, dy) {
  let t0 = -1e9
  let t1 = 1e9
  const edges = [
    [-dx, sx - 0],
    [dx, 1 - sx],
    [-dy, sy - 0],
    [dy, 1 - sy],
  ]
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null
    } else {
      const r = q / p
      if (p < 0) {
        if (r > t1) return null
        if (r > t0) t0 = r
      } else {
        if (r < t0) return null
        if (r < t1) t1 = r
      }
    }
  }
  return t1 > t0 ? [t0, t1] : null
}

/**
 * Parallel rows across a lot. Lines live in the unit square, so coverage is
 * exact and neighbouring lots meet without a seam; the bilinear map carries
 * them onto the ground and the camera does the rest.
 */
function hatchQuad(ink, p, opts) {
  const {
    angle = p.angle,
    spacingPx = 3.4,
    stepPx = 20,
    opMul = 1,
    wMul = 1,
    dash = 0.03,
    skip = 0.02,
    wobble = 1,
    suppress,
    bow = p.bow,
  } = opts
  const rng = p.rng
  const t = p.t
  const prec = precFor(t)
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  // screen vectors for one unit step along and across the rows
  const alongLen = Math.hypot(p.eu[0] * cosA + p.ev[0] * sinA, p.eu[1] * cosA + p.ev[1] * sinA)
  const acrossLen = Math.hypot(
    -p.eu[0] * sinA + p.ev[0] * cosA,
    -p.eu[1] * sinA + p.ev[1] * cosA,
  )
  if (!(alongLen > 0.5) || !(acrossLen > 0.5)) return

  const h = spacingPx / acrossLen
  const nLines = Math.min(220, Math.floor(1.45 / h))
  const steps = clamp(Math.ceil(alongLen / stepPx), 1, 9)

  for (let i = -Math.ceil(nLines * 0.25); i <= nLines; i++) {
    const s = (i + 0.5) * h - 0.22 + (rng() - 0.5) * h * 0.4
    if (rng() < skip) continue
    // a point on the row, and the row's direction, in (u, v)
    const ox = 0.5 + -sinA * s
    const oy = 0.5 + cosA * s
    const span = clipUnitSquare(ox, oy, cosA, sinA)
    if (!span) continue
    const [ta, tb] = span
    if (tb - ta < 0.02) continue
    const n = Math.max(1, Math.round(steps * (tb - ta)))
    const [op, pw] = pen(t, opMul * (0.8 + 0.45 * rng()), wMul * (0.85 + 0.35 * rng()))
    const phase = rng() * 6.283

    let run = []
    const flush = () => {
      if (run.length > 1 && bboxVisible(run, 10)) ink.add(polyPath(run, prec), op, pw)
      run = []
    }
    for (let k = 0; k <= n; k++) {
      const tau = lerp(ta, tb, k / n)
      let u = ox + cosA * tau
      let v = oy + sinA * tau
      // a gentle bow so rows read as planted, not ruled
      const b = bow * Math.sin(Math.PI * clamp(u, 0, 1))
      v = clamp(v + b, 0, 1)
      u = clamp(u, 0, 1)
      // inset the planted area behind a wavy verge so the lot is not a polygon
      const wu = clamp(0.035 + u * 0.93 + 0.032 * Math.sin(3.1 * v + p.wu), 0, 1)
      const wv = clamp(0.035 + v * 0.93 + 0.032 * Math.sin(3.3 * u + p.wv), 0, 1)
      const [sxp, syp, gX, gZ] = screenAt(p, wu, wv)
      if (suppress && suppress(gX, gZ)) {
        flush()
        continue
      }
      const wob = wobble * Math.sin(phase + tau * 9.3) * lerp(0.9, 0.25, t)
      run.push([sxp, syp + wob])
      if (rng() < dash) flush()
    }
    flush()
  }
}

/** A jittered grid over the lot that stays uniform on screen. */
function sampleQuad(p, spacingPx, rng, fn) {
  const nu = clamp(Math.round(Math.hypot(p.eu[0], p.eu[1]) / spacingPx), 1, 240)
  const nv = clamp(Math.round(Math.hypot(p.ev[0], p.ev[1]) / spacingPx), 1, 240)
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const u = clamp((i + 0.5 + (rng() - 0.5) * 0.9) / nu, 0, 1)
      const v = clamp((j + 0.5 + (rng() - 0.5) * 0.9) / nv, 0, 1)
      const [sx, sy, gX, gZ] = screenAt(p, u, v)
      if (!visible(sx, sy, 12)) continue
      fn(gX, gZ, sx, sy, u, v)
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   3. Land uses
   ═══════════════════════════════════════════════════════════════════════ */

function drawCoffee(ink, p, suppress) {
  const shade = p.shade
  // tone runs from a loosely planted lot (wide, pale) to a tight dark one
  const dense = lerp(1.45, 0.92, p.tone) * (1 - 0.2 * shade)
  hatchQuad(ink, p, {
    spacingPx: lerp(4, 2.9, p.t) * dense,
    stepPx: lerp(34, 18, p.t),
    opMul: (0.72 + 0.4 * p.tone) * (1 + 0.45 * shade),
    dash: 0.07,
    skip: 0.05,
    suppress,
  })
  // the deepest folds get a second, wider pass across the rows
  if (shade > 0.62 && p.tone > 0.45) {
    hatchQuad(ink, p, {
      angle: p.angle + 1.15,
      spacingPx: lerp(9, 6, p.t),
      stepPx: lerp(50, 24, p.t),
      opMul: 0.5 * shade,
      wMul: 0.8,
      dash: 0.05,
      skip: 0.25,
      bow: 0,
      suppress,
    })
  }
  // a few shade trees standing in the rows
  const rng = p.rng
  const nTrees = Math.round(lerp(4, 1, p.t) * rng())
  for (let i = 0; i < nTrees; i++) {
    const [sx, sy, gX, gZ] = screenAt(p, 0.12 + rng() * 0.76, 0.12 + rng() * 0.76)
    if (suppress(gX, gZ)) continue
    if (markerDist(sx, sy) < 72) continue
    canopy(ink, sx, sy, lerp(5.6, 1.5, p.t) * (0.8 + rng() * 0.5), p.t, rng, 1.05)
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   3b. The hillside around the farm
   ═══════════════════════════════════════════════════════════════════════

   Everything that is not a planted lot is drawn as one continuous surface
   rather than as more polygons: evenly spaced streamlines that follow the
   contour of the slope, placed by rejection against an occupancy grid so they
   keep their distance the way a pen would. Density and weight come from how
   far the facet is turned from the light, so the folds of the land are what
   you read first. Woods sit on top of that, inside an organic noise mask.
*/

class Occupancy {
  constructor(cell = 2) {
    this.cell = cell
    this.x0 = CULL.x0 - 40
    this.y0 = CULL.y0 - 40
    this.w = Math.ceil((CULL.x1 - CULL.x0 + 80) / cell)
    this.h = Math.ceil((CULL.y1 - CULL.y0 + 80) / cell)
    this.g = new Uint8Array(this.w * this.h)
  }

  free(x, y, r) {
    const n = Math.max(1, Math.round(r / this.cell))
    const i0 = ((x - this.x0) / this.cell) | 0
    const j0 = ((y - this.y0) / this.cell) | 0
    for (let j = j0 - n; j <= j0 + n; j++) {
      if (j < 0 || j >= this.h) continue
      const row = j * this.w
      for (let i = i0 - n; i <= i0 + n; i++) {
        if (i < 0 || i >= this.w) continue
        if (this.g[row + i]) return false
      }
    }
    return true
  }

  mark(x, y) {
    const i = ((x - this.x0) / this.cell) | 0
    const j = ((y - this.y0) / this.cell) | 0
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return
    this.g[j * this.w + i] = 1
  }

  markSeg(x0, y0, x1, y1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / this.cell))
    for (let i = 0; i <= n; i++) this.mark(lerp(x0, x1, i / n), lerp(y0, y1, i / n))
  }
}

/** Contour direction at a ground point, nudged by noise so it is not sterile. */
function contourDir(X, Z) {
  const [gx, gz] = terrainGrad(X, Z)
  const g = Math.hypot(gx, gz)
  let dx = 1
  let dz = 0
  if (g >= 1e-5) {
    dx = -gz / g
    dz = gx / g
  }
  const a = (vnoise(X * 1.7, Z * 1.7, 4321) - 0.5) * 0.5
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const rx = dx * ca - dz * sa
  const rz = dx * sa + dz * ca
  return rx < 0 ? [-rx, -rz] : [rx, rz]
}

/** How wooded a point is: gullies and steep flanks, away from the yard. */
function woodMask(X, Z) {
  const u = clamp((Z - ZNEAR) / (ZFAR - ZNEAR), 0, 1)
  const tx = (X / Math.pow(Math.max(Z, 0.3), 0.6)) * 0.85
  const n = fbm(tx * 1.15 + 41, u * 2.4 + 7, 555, 3)
  const [gx, gz] = terrainGrad(X, Z)
  const slope = Math.hypot(gx, gz)
  const big = fbm(tx * 0.42 + 3, u * 0.9, 661, 2)
  let m = (n - 0.5) * 3.4 + clamp((slope - 0.46) * 2.4, 0, 0.8)
  m *= 0.55 + 1.15 * clamp((big - 0.3) * 1.9, 0, 1)
  const [sx, sy] = toScreen(X, Z)
  // keep the yard and the interest points open
  m -= 1.4 * Math.exp(-Math.pow(Math.hypot((sx - 820) / 430, (sy - 700) / 250), 2))
  const md = markerDist(sx, sy)
  if (md < 170) m -= 1.5 * (1 - md / 170)
  return clamp(m, 0, 1)
}

function drawHillside(ink, ctx) {
  const { blocked } = ctx
  const rng = mulberry32(SEED + 31337)
  const occ = new Occupancy(2)
  let lines = 0
  let trees = 0

  // ── 1. the woods, drawn as dark masses: a loaded ground of short strokes
  //       under a ceiling of overlapping canopies
  const canopies = []
  {
    for (let Z = ZNEAR * 0.92; Z < ZFAR * 1.02; ) {
      const Y = terrain(0, Z)
      const t0 = depthT(Z)
      const spacingPx = lerp(8, 3.4, t0)
      const dZ = (spacingPx * Z * Z) / (F * Math.max(0.1, 1 - Y))
      const dX = (spacingPx * Z) / F
      for (let X = -halfX(Z) * 1.15; X < halfX(Z) * 1.15; X += dX) {
        const jx = X + (rng() - 0.5) * dX * 1.15
        const jz = Z + (rng() - 0.5) * dZ * 1.15
        const m = woodMask(jx, jz)
        if (m < 0.2 || rng() > m * 1.35) continue
        if (ctx.inLot(jx, jz) || blocked(jx, jz)) continue
        const [sx, sy] = toScreen(jx, jz)
        if (!visible(sx, sy, 20)) continue
        const t = depthT(jz)
        const shade = shading(jx, jz)
        const r = lerp(11, 1.8, t) * (0.45 + rng() * 1.1) * (0.72 + 0.4 * m)

        // the dark between the crowns
        const [dop, dpw] = pen(t, (0.85 + 0.5 * shade) * (0.45 + 0.75 * m), 1.15)
        const nd = r > 4 ? 5 : 3
        for (let k = 0; k < nd; k++) {
          const a = 1.1 + rng() * 0.9
          const l = r * (0.7 + rng() * 0.9)
          const x0 = sx + (rng() - 0.5) * r * 1.6
          const y0 = sy + (rng() - 0.5) * r * 0.9
          ink.add(
            polyPath([[x0, y0], [x0 + Math.cos(a) * l, y0 + Math.sin(a) * l]], precFor(t)),
            dop,
            dpw,
          )
        }
        const room = occ.free(sx, sy, r * 0.3)
        occ.markSeg(sx - r * 0.9, sy, sx + r * 0.9, sy)
        occ.markSeg(sx, sy - r * 0.6, sx, sy + r * 0.6)
        if (room) canopies.push([sx, sy, r, t, jx, jz, m])
      }
      Z += dZ
    }
  }

  // ── 2. contour streamlines over everything that is still open
  {
    for (let Z = ZNEAR * 0.92; Z < ZFAR * 1.02; ) {
      const Y0 = terrain(0, Z)
      const seedPx = 4.2
      const dZ = (seedPx * Z * Z) / (F * Math.max(0.1, 1 - Y0))
      const dX = (seedPx * Z) / F
      for (let X = -halfX(Z) * 1.18; X < halfX(Z) * 1.18; X += dX) {
        const sx0 = X + (rng() - 0.5) * dX
        const sz0 = Z + (rng() - 0.5) * dZ
        if (ctx.inLot(sx0, sz0)) continue
        if (blocked(sx0, sz0)) {
          // inside the swept yard: a few faint scuffs, never over a roof
          if (rng() > 0.62 || ctx.onBuilding(sx0, sz0) || ctx.onTrack(sx0, sz0)) continue
          const [yx, yy] = toScreen(sx0, sz0)
          if (!visible(yx, yy, 10)) continue
          const ty = depthT(sz0)
          const [yop, ypw] = pen(ty, 0.34 + 0.42 * rng(), 0.65)
          const yl = lerp(16, 7, ty) * (0.4 + rng() * 0.9)
          ink.add(
            polyPath([[yx - yl / 2, yy], [yx + yl / 2, yy + (rng() - 0.5) * 2]], precFor(ty)),
            yop,
            ypw,
          )
          lines++
          continue
        }
        const [px, py] = toScreen(sx0, sz0)
        if (!visible(px, py, 18)) continue

        const t = depthT(sz0)
        const shade = shading(sx0, sz0)
        const wm = woodMask(sx0, sz0)
        if (wm > 0.52) continue
        const tone = clamp(fbm(sx0 * 2.4 + 5, sz0 * 2.4, 909, 3), 0, 1)
        // loaded in the shade, nearly open paper on the lit benches
        const sep = lerp(10, 5, t) * (1 - 0.78 * shade) * (1 - 0.35 * wm) * lerp(1.5, 0.6, tone)
        if (!occ.free(px, py, sep * 0.5)) continue

        const targetLen = lerp(230, 70, t) * (0.45 + rng() * 1.1)
        const stepPx = lerp(17, 8, t)
        const fwd = []
        const back = []
        for (const dir of [1, -1]) {
          let cx = sx0
          let cz = sz0
          let len = 0
          const side = dir === 1 ? fwd : back
          while (len < targetLen / 2) {
            const [ux, uz] = contourDir(cx, cz)
            const j = jacobianLen(cx, cz, ux, uz) || 1
            const st = (stepPx / j) * dir
            cx += ux * st
            cz += uz * st
            if (cz < ZNEAR * 0.85 || cz > ZFAR * 1.05 || Math.abs(cx) > halfX(cz) * 1.3) break
            if (ctx.inLot(cx, cz) || blocked(cx, cz)) break
            const [qx, qy] = toScreen(cx, cz)
            if (!visible(qx, qy, 24)) break
            side.push([qx, qy])
            len += stepPx
          }
        }
        const pts = [...back.reverse(), [px, py], ...fwd]
        if (pts.length < 2) continue

        for (let i = 1; i < pts.length; i++) {
          occ.markSeg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
        }

        const [op, pw] = pen(
          t,
          (0.42 + 1.5 * shade + 0.35 * wm) * (0.75 + 0.5 * rng()),
          (0.78 + 0.45 * rng()) * (1 + 0.35 * shade + 0.2 * wm),
        )
        // break the streamline so it reads as strokes rather than a wire
        const prec = precFor(t)
        let run = []
        for (let i = 0; i < pts.length; i++) {
          run.push(pts[i])
          if (rng() < 0.08 && run.length > 1) {
            ink.add(polyPath(run, prec), op, pw)
            lines++
            run = rng() < 0.5 ? [] : [pts[i]]
          }
        }
        if (run.length > 1) {
          ink.add(polyPath(run, prec), op, pw)
          lines++
        }

        // the deepest folds get a crossing stroke, which is where the darks come from
        if (shade > 0.58 && rng() < 0.55 && pts.length > 2) {
          const k = 1 + ((rng() * (pts.length - 2)) | 0)
          const [ax, ay] = pts[k]
          const l = lerp(26, 11, t) * (0.5 + rng() * 0.9) * shade
          const [gx2, gz2] = terrainGrad(sx0, sz0)
          const gl = Math.hypot(gx2, gz2) || 1
          const jj = jacobianLen(sx0, sz0, gx2 / gl, gz2 / gl) || 1
          const [bx, by] = toScreen(sx0 + (gx2 / gl) * (l / jj), sz0 + (gz2 / gl) * (l / jj))
          const [cop, cpw] = pen(t, (0.55 + 0.9 * shade) * (0.7 + 0.5 * rng()), 0.75)
          ink.add(polyPath([[ax, ay], [lerp(ax, bx, 1), lerp(ay, by, 1)]], prec), cop, cpw)
          lines++
        }
      }
      Z += dZ
    }
  }

  // ── 3. the canopies on top
  for (const [sx, sy, r, t, gx, gz, m] of canopies) {
    canopy(ink, sx, sy, r, t, rng, 0.95 + 0.6 * shading(gx, gz) + 0.3 * m)
    trees++
  }

  return { lines, trees }
}

/* ── canopies ──────────────────────────────────────────────────────────── */

function canopy(ink, sx, sy, r, t, rng, opMul = 1) {
  if (!visible(sx, sy, 12)) return
  const prec = precFor(t)
  const [op, pw] = pen(t, 1.05 * opMul, 1)
  if (r < 1.9) {
    const a = -0.9 + rng() * 1.6
    ink.add(
      `M${num(sx, prec)} ${num(sy, prec)}q${num(r * 0.9, prec)} ${num(-r * 1.2, prec)} ${num(
        r * 2 * Math.cos(a) * 0.8,
        prec,
      )} ${num(r * 0.5, prec)}`,
      op * 0.95,
      pw * 0.9,
    )
    return
  }
  const N = r > 4 ? 7 : 5
  const pts = []
  const phase = rng() * 6.28
  for (let i = 0; i < N; i++) {
    const a = phase + (i / N) * Math.PI * 2
    const rr = r * (0.66 + 0.55 * rng())
    pts.push([sx + Math.cos(a) * rr * 1.15, sy + Math.sin(a) * rr * 0.62])
  }
  let d = `M${num(pts[0][0], prec)} ${num(pts[0][1], prec)}`
  for (let i = 1; i <= N; i++) {
    const pt = pts[i % N]
    const prev = pts[i - 1]
    const mx = (prev[0] + pt[0]) / 2 + (rng() - 0.5) * r * 0.5
    const my = (prev[1] + pt[1]) / 2 + (rng() - 0.5) * r * 0.35
    d += `Q${num(mx, prec)} ${num(my, prec)} ${num(pt[0], prec)} ${num(pt[1], prec)}`
  }
  ink.add(d, op, pw * 0.9)
  if (r > 3) {
    ink.add(
      `M${num(sx - r * 0.7, prec)} ${num(sy + r * 0.28, prec)}Q${num(sx, prec)} ${num(
        sy + r * 0.74,
        prec,
      )} ${num(sx + r * 0.75, prec)} ${num(sy + r * 0.34, prec)}`,
      op * 1.15,
      pw * 1.1,
    )
  }
  if (r > 5.2) {
    ink.add(polyPath([[sx, sy + r * 0.55], [sx + r * 0.1, sy + r * 1.05]], prec), op * 0.85, pw * 0.85)
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   4. Tracks — pale ribbons made by suppressing marks, not by outlining
   ═══════════════════════════════════════════════════════════════════════ */

function catmull(pts, n = 14) {
  const P = [pts[0], ...pts, pts[pts.length - 1]]
  const out = []
  for (let i = 0; i < P.length - 3; i++) {
    const p0 = P[i]
    const p1 = P[i + 1]
    const p2 = P[i + 2]
    const p3 = P[i + 3]
    for (let j = 0; j < n; j++) {
      const t = j / n
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Screen waypoints, inverted onto the terrain so the tracks lie on the land. */
const TRACK_PLAN = [
  // the road up from the valley, through the yard and on over the shoulder
  {
    w: 0.052,
    pts: [
      [560, 1180],
      [640, 1040],
      [784, 946],
      [900, 872],
      [980, 800],
      [1006, 724],
      [930, 672],
      [812, 636],
      [700, 590],
      [654, 528],
      [712, 466],
      [830, 424],
      [980, 400],
      [1150, 392],
      [1312, 402],
    ],
  },
  // the spur down to the drying deck and the beneficiadero
  {
    w: 0.036,
    pts: [
      [930, 672],
      [836, 700],
      [720, 742],
      [612, 786],
      [470, 838],
      [330, 900],
      [236, 968],
      [150, 1060],
    ],
  },
  // a footpath climbing out of the far lots towards the ridge
  {
    w: 0.022,
    pts: [
      [654, 528],
      [560, 470],
      [430, 430],
      [300, 404],
      [150, 388],
      [-40, 378],
    ],
  },
]

function buildTracks() {
  const tracks = []
  for (const plan of TRACK_PLAN) {
    plan.w *= 0.72
    const ground = plan.pts.map(([sx, sy]) => fromScreen(sx, sy))
    const smooth = catmull(ground, 16)
    const samples = []
    for (let i = 0; i < smooth.length - 1; i++) {
      const [x0, z0] = smooth[i]
      const [x1, z1] = smooth[i + 1]
      const len = Math.hypot(x1 - x0, z1 - z0)
      const steps = Math.max(1, Math.ceil(len / (plan.w * 0.4)))
      for (let s = 0; s < steps; s++) {
        const u = s / steps
        samples.push([lerp(x0, x1, u), lerp(z0, z1, u)])
      }
    }
    samples.push(smooth[smooth.length - 1])
    tracks.push({ w: plan.w, line: smooth, samples })
  }
  return tracks
}

function buildTrackIndex(tracks) {
  const CELL = 0.3
  const grid = new Map()
  for (const tr of tracks) {
    for (const [X, Z] of tr.samples) {
      const key = `${Math.floor(X / CELL)}:${Math.floor(Z / CELL)}`
      let a = grid.get(key)
      if (!a) {
        a = []
        grid.set(key, a)
      }
      a.push([X, Z, tr.w])
    }
  }
  return function onTrack(X, Z, extra = 0) {
    const ci = Math.floor(X / CELL)
    const cj = Math.floor(Z / CELL)
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const a = grid.get(`${i}:${j}`)
        if (!a) continue
        for (const [tx, tz, tw] of a) {
          const r = tw + extra
          const dx = X - tx
          const dz = Z - tz
          if (dx * dx + dz * dz < r * r) return true
        }
      }
    }
    return false
  }
}

/** Only the faintest broken edge; the gap in the hatching does the work. */
function drawTrackEdges(ink, tr) {
  const rng = mulberry32(SEED + Math.round(tr.w * 10000))
  for (const side of [-1, 1]) {
    let run = []
    let lastT = 0
    const flush = (t) => {
      if (run.length > 2 && bboxVisible(run, 10)) {
        const [op, pw] = pen(t, 0.72, 0.8)
        ink.add(polyPath(run, precFor(t)), op, pw)
      }
      run = []
    }
    for (let i = 1; i < tr.line.length - 1; i++) {
      const [X, Z] = tr.line[i]
      const [nx, nz] = tr.line[i + 1]
      const dx = nx - X
      const dz = nz - Z
      const l = Math.hypot(dx, dz) || 1
      const t = depthT(Z)
      lastT = t
      const [sx, sy] = toScreen(X + (-dz / l) * tr.w * side, Z + (dx / l) * tr.w * side)
      if (!visible(sx, sy, 12)) {
        flush(t)
        continue
      }
      run.push([sx, sy])
      if (rng() < 0.13) flush(t)
    }
    flush(lastT)
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   5. Buildings
   ═══════════════════════════════════════════════════════════════════════ */

const STRUCTURES = []
const FOOTPRINTS = []

/** Buildings suppress marks over a slightly bigger patch: a swept yard. */
function claim(poly, k = 1.9) {
  const cx = (poly[0][0] + poly[1][0] + poly[2][0] + poly[3][0]) / 4
  const cz = (poly[0][1] + poly[1][1] + poly[2][1] + poly[3][1]) / 4
  STRUCTURES.push(poly.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]))
  FOOTPRINTS.push(poly.map(([x, z]) => [cx + (x - cx) * 1.06, cz + (z - cz) * 1.06]))
}

function footprintPoly(X, Z, w, d, rot) {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([a, b]) => [X + a * c - b * s, Z + a * s + b * c])
}

function drawShed(ink, X, Z, opts = {}) {
  const { w = 0.09, d = 0.06, wall = 0.028, roof = 0.022, rot = 0.1, seed = 1, opMul = 1 } = opts
  const rng = mulberry32(SEED + seed * 977)
  const t = depthT(Z)
  const Yp = terrain(X, Z)
  const [op, pw] = pen(t, 1.25 * opMul, 1.2)
  const prec = precFor(t)

  const base = footprintPoly(X, Z, w, d, rot)
  const P = (pt, e) => toScreen(pt[0], pt[1], e, Yp)
  const b = base.map((pt) => P(pt, 0))
  const topw = base.map((pt) => P(pt, wall))
  if (!bboxVisible(b, 8)) return
  claim(base, 2.05)

  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const r0 = P([X - (w / 2) * c, Z - (w / 2) * s], wall + roof)
  const r1 = P([X + (w / 2) * c, Z + (w / 2) * s], wall + roof)

  // the far pitch is the one turned away from the light: fill it with dense
  // slope lines so the roof reads as two values, not as a wireframe
  const nFar = clamp(Math.round(Math.hypot(r1[0] - r0[0], r1[1] - r0[1]) / 1.7), 3, 120)
  for (let i = 1; i < nFar; i++) {
    const u = i / nFar
    ink.add(
      polyPath(
        [
          [lerp(topw[3][0], topw[2][0], u), lerp(topw[3][1], topw[2][1], u)],
          [lerp(r0[0], r1[0], u), lerp(r0[1], r1[1], u)],
        ],
        prec,
      ),
      op * 0.85,
      pw * 0.7,
    )
  }
  const nNear = clamp(Math.round(Math.hypot(r1[0] - r0[0], r1[1] - r0[1]) / 3.6), 2, 60)
  for (let i = 1; i < nNear; i++) {
    const u = i / nNear
    ink.add(
      polyPath(
        [
          [lerp(topw[0][0], topw[1][0], u), lerp(topw[0][1], topw[1][1], u)],
          [lerp(r0[0], r1[0], u), lerp(r0[1], r1[1], u)],
        ],
        prec,
      ),
      op * 0.3,
      pw * 0.5,
    )
  }

  // the right-hand long wall is the shadow side
  const nH = clamp(Math.round(Math.hypot(topw[1][0] - topw[2][0], topw[1][1] - topw[2][1]) / 1.6), 2, 60)
  for (let i = 1; i < nH; i++) {
    const u = i / nH
    ink.add(
      polyPath(
        [
          [lerp(topw[1][0], topw[2][0], u), lerp(topw[1][1], topw[2][1], u)],
          [lerp(b[1][0], b[2][0], u), lerp(b[1][1], b[2][1], u)],
        ],
        prec,
      ),
      op * 0.8,
      pw * 0.7,
    )
  }

  // outlines last, heaviest, so the silhouette stays crisp over the hatching.
  // Only the two walls that face the viewer are drawn, or the shed reads as a
  // glass box.
  ink.add(polyPath([b[0], b[1], b[2]], prec), op * 0.9, pw * 0.9)
  for (const i of [0, 1, 2]) ink.add(polyPath([b[i], topw[i]], prec), op, pw)
  ink.add(polyPath([topw[0], r0, topw[3]], prec), op, pw * 1.1)
  ink.add(polyPath([topw[1], r1, topw[2]], prec), op, pw * 1.1)
  ink.add(polyPath([r0, r1], prec), op, pw * 1.4)
  ink.add(polyPath([topw[3], topw[0], topw[1], topw[2]], prec), op, pw)

  // cast shadow on the ground, away from the light
  const shl = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1])
  const nS = clamp(Math.round(shl / 2.4), 3, 14)
  for (let i = 0; i <= nS; i++) {
    const u = i / nS
    const p1 = [lerp(b[3][0], b[2][0], u), lerp(b[3][1], b[2][1], u)]
    ink.add(
      polyPath([p1, [p1[0] + shl * (0.07 + 0.035 * rng()), p1[1] + shl * 0.045]], prec),
      op * 0.45,
      pw * 0.6,
    )
  }
}

function drawTank(ink, X, Z, r = 0.02, hgt = 0.016, seed = 5) {
  const t = depthT(Z)
  const Yp = terrain(X, Z)
  const [op, pw] = pen(t, 1.2, 1.1)
  const prec = precFor(t)
  const N = 16
  const rim = []
  const foot = []
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    rim.push(toScreen(X + Math.cos(a) * r, Z + Math.sin(a) * r, hgt, Yp))
    foot.push(toScreen(X + Math.cos(a) * r, Z + Math.sin(a) * r, 0, Yp))
  }
  if (!bboxVisible(rim, 6)) return
  claim(
    [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2 + 0.4
      return [X + Math.cos(a) * r * 1.4, Z + Math.sin(a) * r * 1.4]
    }),
    1.5,
  )
  ink.add(polyPath(rim, prec), op, pw)
  ink.add(polyPath(foot.slice(0, N / 2 + 1), prec), op * 0.75, pw * 0.8)
  for (let i = 0; i <= N; i++) {
    if (i > N * 0.55 && i < N * 0.95) continue
    ink.add(polyPath([rim[i], foot[i]], prec), op * (i > N / 2 ? 0.45 : 0.85), pw * 0.6)
  }
}

function drawDeck(ink, X, Z, w, d, rot, seed = 9) {
  const t = depthT(Z)
  const Yp = terrain(X, Z)
  const [op, pw] = pen(t, 1.05, 1)
  const prec = precFor(t)
  const rng = mulberry32(SEED + seed * 613)
  const base = footprintPoly(X, Z, w, d, rot)
  const scr = base.map((pt) => toScreen(pt[0], pt[1], 0.004, Yp))
  if (!bboxVisible(scr, 8)) return
  claim(base, 1.35)
  ink.add(polyPath(scr, prec, true), op * 0.9, pw)

  // beans raked into windrows, all running the same way across the slab
  const n = clamp(Math.round(Math.hypot(scr[0][0] - scr[3][0], scr[0][1] - scr[3][1]) / 3.2), 4, 40)
  for (let i = 1; i < n; i++) {
    const u = i / n
    const p1 = [lerp(scr[0][0], scr[3][0], u), lerp(scr[0][1], scr[3][1], u)]
    const p2 = [lerp(scr[1][0], scr[2][0], u), lerp(scr[1][1], scr[2][1], u)]
    const a = 0.04 + rng() * 0.1
    const bq = 0.96 - rng() * 0.1
    const heavy = i % 3 === 1
    ink.add(
      polyPath(
        [
          [lerp(p1[0], p2[0], a), lerp(p1[1], p2[1], a)],
          [lerp(p1[0], p2[0], bq), lerp(p1[1], p2[1], bq)],
        ],
        prec,
      ),
      op * (heavy ? 0.6 : 0.26 + 0.2 * rng()),
      pw * (heavy ? 0.8 : 0.5),
    )
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   6. Drainage and boundaries
   ═══════════════════════════════════════════════════════════════════════ */

function drawCreeks(ink, suppress) {
  const rng = mulberry32(SEED + 4242)
  for (let k = 0; k < 9; k++) {
    let X = (rng() * 2 - 1) * halfX(ZFAR) * 0.95
    let Z = lerp(1.9, ZFAR * 0.97, rng())
    const pts = []
    let tEnd = depthT(Z)
    for (let s = 0; s < 110; s++) {
      const [gx, gz] = terrainGrad(X, Z)
      const g = Math.hypot(gx, gz)
      if (g < 1e-5) break
      const stepScreen = lerp(7, 3.5, depthT(Z))
      const j = jacobianLen(X, Z, -gx / g, -gz / g) || 1
      const st = stepScreen / j
      X += (-gx / g) * st + (vnoise(X * 40, Z * 40, 991) - 0.5) * st * 0.8
      Z += (-gz / g) * st
      if (Z < ZNEAR * 0.9 || Z > ZFAR * 1.05 || Math.abs(X) > halfX(Z) * 1.1) break
      tEnd = depthT(Z)
      pts.push(toScreen(X, Z))
    }
    if (pts.length < 4 || !bboxVisible(pts, 10)) continue
    const [op, pw] = pen(tEnd, 0.5, 0.8)
    ink.add(polyPath(pts, precFor(tEnd)), op, pw)
  }
}

/**
 * The edge of a planted lot: a broken line, thickened where the rows meet it,
 * and sometimes a hedgerow of small canopies instead.
 */
function drawLotEdges(ink, lots) {
  for (const p of lots) {
    const rng = mulberry32(SEED + p.c * 811 + p.r * 5501 + 3)
    const t = p.t
    const prec = precFor(t)
    for (let e = 0; e < 4; e++) {
      const kind = rng()
      if (kind > 0.88) continue
      const a = p.quad[e]
      const b = p.quad[(e + 1) % 4]
      const ay = p.cy[e]
      const by = p.cy[(e + 1) % 4]
      const N = clamp(
        Math.round(Math.hypot(p.screen[e][0] - p.screen[(e + 1) % 4][0], p.screen[e][1] - p.screen[(e + 1) % 4][1]) / 16),
        3,
        40,
      )
      const pts = []
      for (let i = 0; i <= N; i++) {
        const u = i / N
        const X = lerp(a[0], b[0], u)
        const Z = lerp(a[1], b[1], u)
        const Y = lerp(ay, by, u) + 0.0016 * (vnoise(X * 22, Z * 22, 619) - 0.5)
        pts.push([CX + (F * X) / Z, HORIZON + (F * (1 - Y)) / Z])
      }
      if (!bboxVisible(pts, 10)) continue

      if (kind < 0.26 && t < 0.55) {
        for (let i = 0; i <= N; i++) {
          const [sx, sy] = pts[i]
          if (markerDist(sx, sy) < 90) continue
          canopy(ink, sx, sy, lerp(6.5, 2, t) * (0.65 + rng() * 0.7), t, rng, 1)
        }
        continue
      }
      const [op, pw] = pen(t, 0.8 + 0.3 * rng(), 0.85)
      let i = 0
      while (i < N) {
        const len = Math.max(2, Math.round(3 + rng() * (N - 2)))
        const seg = pts.slice(i, Math.min(N + 1, i + len))
        if (seg.length > 1) ink.add(polyPath(seg, prec), op, pw)
        i += len + Math.round(1 + rng() * 2)
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   7. The map layer
   ═══════════════════════════════════════════════════════════════════════ */

function buildMapLayer() {
  const ink = new Ink()
  const stats = {}

  const lattice = buildLattice()
  const parcels = buildParcels(lattice)
  assignLandUse(parcels)
  const tracks = buildTracks()
  const onTrack = buildTrackIndex(tracks)
  const place = (sx, sy) => fromScreen(sx, sy)

  /* the beneficiadero: the long shed, its tanks and a lean-to */
  const [bX, bZ] = place(640, 622)
  drawShed(ink, bX, bZ, { w: 0.33, d: 0.2, wall: 0.042, roof: 0.03, rot: 0.12, seed: 2 })
  const [b2X, b2Z] = place(826, 654)
  drawShed(ink, b2X, b2Z, { w: 0.15, d: 0.11, wall: 0.018, roof: 0.015, rot: -0.24, seed: 3 })
  for (let i = 0; i < 3; i++) {
    const [tX, tZ] = place(548 + i * 52, 688 + i * 20)
    drawTank(ink, tX, tZ, 0.032, 0.03, 11 + i)
  }
  /* the drying deck, on the bench below the beneficiadero */
  const [dX, dZ] = place(560, 782)
  drawDeck(ink, dX, dZ, 0.46, 0.235, 0.06, 21)

  /* the house, its kitchen shed and the store */
  const [hX, hZ] = place(1052, 738)
  drawShed(ink, hX, hZ, { w: 0.285, d: 0.195, wall: 0.044, roof: 0.034, rot: -0.12, seed: 4 })
  const [h2X, h2Z] = place(1200, 786)
  drawShed(ink, h2X, h2Z, { w: 0.135, d: 0.1, wall: 0.018, roof: 0.016, rot: 0.34, seed: 6 })
  const [h3X, h3Z] = place(944, 800)
  drawShed(ink, h3X, h3Z, { w: 0.11, d: 0.082, wall: 0.015, roof: 0.013, rot: 0.06, seed: 8 })
  stats.buildings = ink.marks

  const suppress = (X, Z) => {
    if (onTrack(X, Z, 0.004)) return true
    for (const poly of STRUCTURES) if (pointInPoly(X, Z, poly)) return true
    return false
  }

  const lots = parcels.filter((p) => p.use === 'coffee')
  const inLot = (X, Z) => {
    for (const p of lots) if (pointInPoly(X, Z, p.quad)) return true
    return false
  }

  const beforeHill = ink.marks
  const onBuilding = (X, Z) => {
    for (const poly of FOOTPRINTS) if (pointInPoly(X, Z, poly)) return true
    return false
  }
  const hill = drawHillside(ink, {
    inLot,
    blocked: suppress,
    onBuilding,
    onTrack: (X, Z) => onTrack(X, Z, 0.004),
  })
  stats.hillside = ink.marks - beforeHill
  stats.streamlines = hill.lines
  stats.trees = hill.trees

  const before = ink.marks
  for (const p of lots) drawCoffee(ink, p, suppress)
  stats.lots = ink.marks - before

  const beforeEdge = ink.marks
  drawLotEdges(ink, lots)
  stats.edges = ink.marks - beforeEdge

  const beforeTrack = ink.marks
  for (const tr of tracks) drawTrackEdges(ink, tr)
  stats.tracks = ink.marks - beforeTrack

  return { ink, stats, parcels }
}

/* ═══════════════════════════════════════════════════════════════════════
   8. Paper layer — grain, haze and the far cordillera
   ═══════════════════════════════════════════════════════════════════════ */

function buildPaperLayer() {
  const ink = new Ink()
  const rng = mulberry32(SEED + 77)

  // Four ranges behind the farm. Broad smooth profiles, flanks shaded with
  // strokes that run down the slope and clump into facets instead of combing
  // evenly along the ridge.
  const ranges = [
    { y: 74, amp: 46, freq: 0.00105, op: 0.22, w: 0.45, hatch: 30, seed: 3 },
    { y: 104, amp: 40, freq: 0.00145, op: 0.3, w: 0.5, hatch: 26, seed: 8 },
    { y: 134, amp: 34, freq: 0.0019, op: 0.4, w: 0.56, hatch: 21, seed: 15 },
    { y: 164, amp: 27, freq: 0.0026, op: 0.5, w: 0.62, hatch: 17, seed: 26 },
  ]

  for (const rg of ranges) {
    const prof = (x) => {
      const n = ridged(x * rg.freq, rg.seed * 0.7, 400 + rg.seed, 2)
      const n2 = fbm(x * rg.freq * 2.6, rg.seed, 500 + rg.seed, 2)
      return rg.y - (n - 0.45) * rg.amp - (n2 - 0.5) * rg.amp * 0.5
    }
    const pts = []
    for (let x = -160; x <= W + 160; x += 7) pts.push([x, prof(x)])
    ink.add(polyPath(pts, 1), rg.op * 1.7, rg.w * 1.2)

    for (let x = -158; x <= W + 158; x += 3.2) {
      const y = prof(x)
      const slope = (prof(x + 6) - prof(x - 6)) / 12
      // slopes falling to the right are turned away from the light
      const lit = clamp(0.5 + 2.2 * slope, 0, 1)
      // a smooth mask so the shading gathers into flanks
      const mask = fbm(x * rg.freq * 5.5, rg.seed * 3, 600 + rg.seed, 3)
      const face = clamp((mask - 0.34) * 2.1, 0, 1) * (0.25 + 0.95 * lit)
      if (face < 0.08) continue
      const len = rg.hatch * face * (0.45 + Math.min(1.4, Math.abs(slope) * 2.2)) * (0.6 + rng() * 0.8)
      if (len < 2) continue
      const dxs = slope * len * 0.8
      const d0 = rng() * 1.6
      ink.add(
        polyPath(
          [
            [x, y + 0.4 + d0],
            [x + dxs * 0.45, y + d0 + len * 0.5],
            [x + dxs, y + d0 + len],
          ],
          1,
        ),
        rg.op * (0.5 + 0.9 * face) * (0.6 + rng() * 0.6),
        rg.w,
      )
    }

    // a couple of secondary spurs inside the range
    for (let k = 0; k < 7; k++) {
      const x0 = -140 + rng() * (W + 280)
      const len = 60 + rng() * 190
      const sp = []
      for (let i = 0; i <= 10; i++) {
        const x = x0 + (len * i) / 10
        sp.push([x, prof(x) + (rg.amp * 0.5 * i) / 10 + rng() * 2])
      }
      ink.add(polyPath(sp, 1), rg.op * 0.9, rg.w * 0.9)
    }
  }

  const defs = `<defs>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${INK}" stop-opacity="0.1"/>
<stop offset="0.14" stop-color="${INK}" stop-opacity="0.045"/>
<stop offset="0.3" stop-color="${INK}" stop-opacity="0.012"/>
<stop offset="0.62" stop-color="${INK}" stop-opacity="0"/>
<stop offset="1" stop-color="${INK}" stop-opacity="0.055"/>
</linearGradient>
<filter id="grain" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" seed="17" stitchTiles="stitch" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.165 0 0 0 0 0.267 0 0 0 0 0.2 0.34 0.42 0.2 0 -0.2"/>
<feComponentTransfer><feFuncA type="gamma" exponent="1.7" amplitude="1.5"/></feComponentTransfer>
</filter>
</defs>`

  const body = `<rect x="-40" y="-40" width="${W + 80}" height="${H + 80}" fill="${PAPER}"/>
<rect x="-40" y="-40" width="${W + 80}" height="${H + 80}" fill="url(#haze)"/>
<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision">
${ink.render()}
</g>
<rect x="-40" y="-40" width="${W + 80}" height="${H + 80}" filter="url(#grain)" opacity="0.52"/>`

  return { svg: wrap(defs + '\n' + body), marks: ink.marks }
}

/* ═══════════════════════════════════════════════════════════════════════
   9. Foreground — a few heavy marks at the bottom edge and a vignette
   ═══════════════════════════════════════════════════════════════════════ */

function buildForegroundLayer() {
  const ink = new Ink()
  const rng = mulberry32(SEED + 909)

  // Out-of-focus canopy masses anchoring the two bottom corners, well clear of
  // the two low interest points at (256, 890) and (1312, 900).
  const clumps = [
    [-40, 1030, 240, 140],
    [1650, 1040, 250, 140],
    [760, 1105, 430, 105],
  ]
  for (const [cx, cy, rx, ry] of clumps) {
    for (let i = 0; i < 280; i++) {
      const a = rng() * Math.PI * 2
      const rr = Math.pow(rng(), 0.55)
      const x = cx + Math.cos(a) * rr * rx
      const y = cy + Math.sin(a) * rr * ry
      if (!visible(x, y, 30)) continue
      if (markerDist(x, y) < 95) continue
      const r = 5 + rng() * 9
      const N = 5
      const phase = rng() * 6.28
      const pts = []
      for (let k = 0; k < N; k++) {
        const ang = phase + (k / N) * Math.PI * 2
        const q = r * (0.6 + 0.6 * rng())
        pts.push([x + Math.cos(ang) * q * 1.2, y + Math.sin(ang) * q * 0.7])
      }
      let d = `M${num(pts[0][0], 1)} ${num(pts[0][1], 1)}`
      for (let k = 1; k <= N; k++) {
        const pt = pts[k % N]
        const prev = pts[k - 1]
        d += `Q${num((prev[0] + pt[0]) / 2 + (rng() - 0.5) * r, 1)} ${num(
          (prev[1] + pt[1]) / 2 + (rng() - 0.5) * r * 0.6,
          1,
        )} ${num(pt[0], 1)} ${num(pt[1], 1)}`
      }
      ink.add(d, 0.3 + rng() * 0.5, 0.9 + rng() * 0.8)
    }
  }

  // A thin band of coarse strokes right along the bottom edge.
  for (let i = 0; i < 260; i++) {
    const x = -150 + rng() * (W + 300)
    const fall = Math.pow(rng(), 2.2)
    const y = H + 70 - fall * 105
    if (markerDist(x, y) < 95) continue
    const l = 12 + rng() * 34 * (1 - fall * 0.5)
    const lean = (rng() - 0.5) * 20
    ink.add(
      `M${num(x, 1)} ${num(y, 1)}Q${num(x + lean * 0.3, 1)} ${num(y - l * 0.6, 1)} ${num(
        x + lean,
        1,
      )} ${num(y - l, 1)}`,
      0.3 + rng() * 0.45,
      0.9 + rng() * 0.7,
    )
  }

  const defs = `<defs>
<radialGradient id="vig" cx="0.5" cy="0.52" r="0.78">
<stop offset="0.55" stop-color="${INK}" stop-opacity="0"/>
<stop offset="0.82" stop-color="${INK}" stop-opacity="0.05"/>
<stop offset="1" stop-color="${INK}" stop-opacity="0.17"/>
</radialGradient>
<filter id="fgrain" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="3" seed="41" stitchTiles="stitch" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.165 0 0 0 0 0.267 0 0 0 0 0.2 0.3 0.36 0.18 0 -0.22"/>
</filter>
</defs>`

  const body = `<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision">
${ink.render()}
</g>
<rect x="-40" y="-40" width="${W + 80}" height="${H + 80}" fill="url(#vig)"/>
<rect x="-40" y="-40" width="${W + 80}" height="${H + 80}" filter="url(#fgrain)" opacity="0.3"/>`

  return { svg: wrap(defs + '\n' + body), marks: ink.marks }
}

/* ═══════════════════════════════════════════════════════════════════════
   10. Emit
   ═══════════════════════════════════════════════════════════════════════ */

function wrap(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${inner}
</svg>
`
}

function writeLayer(name, svg) {
  const file = join(OUT_DIR, name)
  writeFileSync(file, svg, 'utf8')
  return statSync(file).size / 1024
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const paper = buildPaperLayer()
  const map = buildMapLayer()
  const fg = buildForegroundLayer()

  const mapSvg = wrap(
    `<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision">
${map.ink.render()}
</g>`,
  )

  const sizes = {
    'paper-reference.svg': writeLayer('paper-reference.svg', paper.svg),
    'map-reference.svg': writeLayer('map-reference.svg', mapSvg),
    'foreground-reference.svg': writeLayer('foreground-reference.svg', fg.svg),
  }

  const useCount = {}
  for (const p of map.parcels) useCount[p.use] = (useCount[p.use] || 0) + 1

  console.log('paper      %s marks  %s KB', String(paper.marks).padStart(6), sizes['paper-reference.svg'].toFixed(1))
  console.log('map        %s marks  %s KB', String(map.ink.marks).padStart(6), sizes['map-reference.svg'].toFixed(1))
  console.log('foreground %s marks  %s KB', String(fg.marks).padStart(6), sizes['foreground-reference.svg'].toFixed(1))
  console.log('  map breakdown:', JSON.stringify(map.stats))
  console.log('  lots:', JSON.stringify(useCount), 'total', map.parcels.length)
  for (const [k, v] of Object.entries(sizes)) {
    if (v > 900) console.error(`!! ${k} is ${v.toFixed(1)} KB, over the 900 KB budget`)
  }
}

main()
